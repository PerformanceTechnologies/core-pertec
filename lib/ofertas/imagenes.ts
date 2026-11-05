import "server-only";
import { randomUUID } from "node:crypto";
import { borrarArchivos, enlaceTemporal, guardarArchivo, leerArchivo } from "@/lib/archivos/almacen";
import { nombreUnico } from "@/lib/archivos/sharepoint-core";
import type { ImagenDibujable } from "./logo";

/**
 * Las imágenes que traía el borrador.
 *
 * Un borrador en Word suele llevar adentro el membrete, un diagrama del trabajo y
 * las fotos de faena del anexo. Se extraen en orden y el texto que ve el modelo
 * lleva un marcador `[IMAGEN n]` en el lugar donde estaban, así que el modelo
 * puede decir cuál es cuál por su contexto: lo que cae después de "Fotografías de
 * referencia incluidas" es una foto del anexo, y lo que cae junto al nombre del
 * firmante es una firma.
 *
 * El reparto lo decide el modelo —es interpretación— y el almacenamiento lo hace
 * el servidor. El contenido canónico solo guarda NÚMEROS: `anexo.fotos: [3, 4, 5]`.
 * Eso mantiene la separación de siempre: lo que dijo el modelo por un lado, lo que
 * el servidor guardó por otro, unidos por el índice.
 */

/** Exportado para ./imagenes-subir.ts, que sube al mismo bucket. */
export const BUCKET = "ofertas-imagenes";

export interface ImagenGuardada {
  indice: number;
  ruta: string;
  nombre: string;
  ancho: number;
  alto: number;
  /**
   * De dónde salió.
   *
   * Falta en las ofertas anteriores a que se pudieran agregar imágenes a mano, y
   * ahí "sin origen" quiere decir "del borrador": es lo único que había. Importa
   * para una sola cosa, y está explicada en `borrarImagen`.
   */
  origen?: "borrador" | "subida";
}

/**
 * El número que le toca a la próxima imagen de una oferta.
 *
 * Continúa la numeración del borrador en vez de rellenar huecos: el índice es la
 * identidad de la imagen —lo que guarda `imagenesPorSeccion` y `firmaImagen`— así
 * que reusar el de una borrada haría que la nueva aparezca donde estaba la otra.
 * Y arranca en 1 porque el 0 significa "ninguna es la firma".
 */
export function proximoIndice(inventario: ImagenGuardada[]): number {
  return inventario.reduce((mayor, imagen) => Math.max(mayor, imagen.indice), 0) + 1;
}

/**
 * Saca una imagen del bucket. Devuelve si estaba.
 *
 * Solo se ofrece para las que se subieron a mano, y no por capricho: el inventario
 * del borrador es el registro de lo que traía el archivo original, y borrar una de
 * ahí pierde ese rastro. Para no usarla ya está "No usar", que es lo que hace falta.
 * Una subida por error, en cambio, no es rastro de nada.
 */
export async function borrarImagen(imagen: ImagenGuardada): Promise<void> {
  await borrarArchivos(BUCKET, [imagen.ruta]);
}

/** Borra las imágenes de una oferta que se elimina. */
export async function borrarImagenes(imagenes: ImagenGuardada[]): Promise<void> {
  const rutas = imagenes.map((i) => i.ruta).filter(Boolean);
  if (rutas.length === 0) return;
  await borrarArchivos(BUCKET, rutas);
}

/**
 * Las imágenes que pide el documento, como data URI y por índice.
 *
 * Solo las que se van a dibujar: una oferta puede traer ocho imágenes y usar
 * cinco, y bajar las tres que no se usan es peso al PDF por nada. Van como data
 * URI porque las cajas de encabezado de Chromium no cargan nada por red, y por
 * coherencia con los logos.
 */
export async function imagenesParaDocumento(
  inventario: ImagenGuardada[],
  indices: number[],
): Promise<Record<number, ImagenDibujable>> {
  const pedidas = inventario.filter((i) => indices.includes(i.indice));
  const resueltas: Record<number, ImagenDibujable> = {};

  // Un documento que pide imágenes contra un inventario vacío es un cable
  // desconectado, no una oferta sin fotos. Pasó: la ruta del PDF no le pasaba el
  // inventario y las seis fotos no se dibujaban, sin que nada lo dijera.
  if (indices.length > 0 && inventario.length === 0) {
    console.warn(
      `[ofertas] el documento pide ${indices.length} imagen(es) y el inventario llegó vacío: ` +
        "revisar que quien llama esté pasando oferta.imagenes.",
    );
  }

  await Promise.all(
    pedidas.map(async (imagen) => {
      // Una foto que no se pudo bajar no sale, y el documento sale igual.
      const contenido = await leerArchivo(BUCKET, imagen.ruta);
      if (!contenido) return;
      const base64 = contenido.toString("base64");
      const tipo = esPng(contenido) ? "png" : "jpeg";
      resueltas[imagen.indice] = {
        uri: `data:image/${tipo};base64,${base64}`,
        // La forma de la foto, para que su caja la respete. Ver ImagenDibujable.
        proporcion: imagen.alto > 0 ? imagen.ancho / imagen.alto : 0,
      };
    }),
  );

  return resueltas;
}

/**
 * Los bytes de una imagen del inventario, o null si no se pudo bajar.
 *
 * Existe para poder usar una imagen del borrador como logo del encabezado: el
 * borrador casi siempre trae el logo del cliente o su membrete entre sus imágenes
 * —por eso quedan sin sección—, y hasta ahora había que bajarla a mano y volverla a
 * subir. Los logos viven en otro bucket y pasan por `normalizarLogo`, así que se
 * copia el contenido, no la ruta.
 */
export async function leerImagenDeOferta(imagen: ImagenGuardada): Promise<Buffer | null> {
  return leerArchivo(BUCKET, imagen.ruta);
}

/**
 * Copia los archivos de un inventario para una oferta duplicada.
 *
 * Copia de verdad, no reusa las rutas. Si las dos ofertas apuntaran al mismo archivo,
 * borrar una dejaría a la otra con fotos que no existen —`borrarImagenes` borra por
 * ruta y no sabe de la otra— y sacar una foto de un duplicado la sacaría del
 * original. Un duplicado tiene que ser independiente o no sirve para nada.
 *
 * Los ÍNDICES se conservan: son la identidad de la imagen dentro del contenido
 * (`imagenesPorSeccion`, `firmaImagen`), así que el duplicado sale con sus fotos ya
 * ubicadas donde estaban. Lo que cambia es dónde vive el archivo.
 *
 * Una copia que falla se omite: el duplicado sale con una foto menos, y eso es mejor
 * que no poder duplicar. Queda en el log.
 */
export async function duplicarImagenes(inventario: ImagenGuardada[]): Promise<ImagenGuardada[]> {
  const copiadas: ImagenGuardada[] = [];

  for (const imagen of inventario) {
    // La copia se baja y se vuelve a subir: así queda en SharePoint aunque el original
    // siga en el bucket de antes.
    const contenido = await leerArchivo(BUCKET, imagen.ruta);
    if (!contenido) continue;
    const extension = esPng(contenido) ? "png" : "jpg";
    try {
      const ruta = await guardarArchivo({
        carpeta: "Ofertas/Imagenes",
        nombre: nombreUnico(imagen.nombre, extension),
        contenido,
        tipo: extension === "png" ? "image/png" : "image/jpeg",
        respaldo: { bucket: BUCKET, ruta: `${randomUUID()}.${extension}` },
      });
      copiadas.push({ ...imagen, ruta });
    } catch (error) {
      console.warn(`[ofertas] no se pudo copiar la imagen ${imagen.ruta}: ${error instanceof Error ? error.message : error}`);
    }
  }

  return copiadas;
}

/** Una URL firmada y corta, para mirarlas en la pantalla de la oferta. */
export async function urlFirmadaImagen(ruta: string, segundos = 600): Promise<string | null> {
  return enlaceTemporal(BUCKET, ruta, { segundos });
}

/** Un PNG empieza con 0x89 «PNG»: las referencias de SharePoint no traen extensión que mirar. */
function esPng(contenido: Buffer): boolean {
  return contenido.length > 4 && contenido[0] === 0x89 && contenido[1] === 0x50 && contenido[2] === 0x4e && contenido[3] === 0x47;
}
