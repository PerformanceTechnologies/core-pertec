import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ImagenExtraida } from "@/lib/cotizador/obra/extraer-texto";
import { PROPORCION_APAISADA, type ImagenDibujable } from "./logo";

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

const BUCKET = "ofertas-imagenes";

/** El lado más largo de una imagen guardada. Una foto de faena en A4 no necesita más. */
const LADO_MAXIMO = 1400;

/**
 * Lo que se descarta por chico.
 *
 * Un .docx trae viñetas, íconos y líneas decorativas como imágenes. Nada de eso es
 * una foto ni una firma, y meterlas en el inventario obliga al modelo a decidir
 * sobre basura.
 */
const LADO_MINIMO = 150;

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
 * Normaliza y guarda las imágenes de un borrador.
 *
 * JPEG para las fotos y PNG para lo que tiene transparencia: un diagrama o un
 * logo con fondo transparente pasado a JPEG queda con un rectángulo negro o
 * blanco detrás. Los metadatos no se arrastran —una foto de faena puede traer
 * EXIF con GPS— y una imagen que sharp no puede abrir se omite sin cortar la
 * subida: el borrador vale más que una de sus imágenes.
 */
async function normalizarYSubir(
  imagen: ImagenExtraida,
  origen: "borrador" | "subida",
): Promise<ImagenGuardada> {
  const original = sharp(imagen.contenido, { failOn: "error" });
  const info = await original.metadata();
  const ancho = info.width ?? 0;
  const alto = info.height ?? 0;

  const escalada = original.resize({
    width: LADO_MAXIMO,
    height: LADO_MAXIMO,
    fit: "inside",
    withoutEnlargement: true,
  });
  const conAlfa = info.hasAlpha === true;
  const contenido = conAlfa
    ? await escalada.png({ compressionLevel: 9 }).toBuffer()
    : await escalada.jpeg({ quality: 78, mozjpeg: true }).toBuffer();

  const extension = conAlfa ? "png" : "jpg";
  const ruta = `${randomUUID()}.${extension}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(ruta, contenido, {
    contentType: conAlfa ? "image/png" : "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`no se pudo guardar en el bucket: ${error.message}`);

  const final = await sharp(contenido).metadata();
  return {
    indice: imagen.indice,
    ruta,
    nombre: imagen.nombre,
    ancho: final.width ?? ancho,
    alto: final.height ?? alto,
    origen,
  };
}

export async function guardarImagenesDelBorrador(imagenes: ImagenExtraida[]): Promise<ImagenGuardada[]> {
  const guardadas: ImagenGuardada[] = [];

  for (const imagen of imagenes) {
    try {
      const info = await sharp(imagen.contenido, { failOn: "error" }).metadata();
      const ancho = info.width ?? 0;
      const alto = info.height ?? 0;
      if (ancho < LADO_MINIMO && alto < LADO_MINIMO) continue;
      guardadas.push(await normalizarYSubir(imagen, "borrador"));
    } catch (error) {
      // Una imagen que no se pudo abrir se omite sin cortar la subida: el borrador
      // vale más que una de sus imágenes.
      console.warn(`[ofertas] la imagen ${imagen.nombre} no se pudo procesar:`, error);
    }
  }

  return guardadas;
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
 * Agrega al inventario una imagen que alguien subió a mano.
 *
 * Dos diferencias con las del borrador, y las dos son la misma idea: acá hubo una
 * decisión de una persona, así que el sistema no la corrige por su cuenta. No se
 * descarta por chica —una firma escaneada o un sello miden poco y son exactamente
 * lo que alguien querría agregar— y si no se puede procesar, se avisa en vez de
 * omitirla en silencio.
 */
export async function agregarImagenSubida(
  inventario: ImagenGuardada[],
  nombre: string,
  contenido: Buffer,
): Promise<ImagenGuardada> {
  return normalizarYSubir({ indice: proximoIndice(inventario), nombre, contenido }, "subida");
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
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([imagen.ruta]);
  if (error) console.warn(`[ofertas] quedó una imagen sin borrar: ${error.message}`);
}

/** Borra las imágenes de una oferta que se elimina. */
export async function borrarImagenes(imagenes: ImagenGuardada[]): Promise<void> {
  const rutas = imagenes.map((i) => i.ruta).filter(Boolean);
  if (rutas.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(rutas);
  if (error) console.warn(`[ofertas] quedaron imágenes sin borrar: ${error.message}`);
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
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(imagen.ruta);
      if (error || !data) {
        // Una foto que no se pudo bajar no sale, y el documento sale igual.
        console.warn(`[ofertas] no se pudo bajar la imagen ${imagen.ruta}: ${error?.message}`);
        return;
      }
      const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
      const tipo = imagen.ruta.endsWith(".png") ? "png" : "jpeg";
      resueltas[imagen.indice] = {
        uri: `data:image/${tipo};base64,${base64}`,
        // Un diagrama técnico o una panorámica a media página no se leen.
        apaisada: imagen.alto > 0 && imagen.ancho / imagen.alto >= PROPORCION_APAISADA,
      };
    }),
  );

  return resueltas;
}

/** Una URL firmada y corta, para mirarlas en la pantalla de la oferta. */
export async function urlFirmadaImagen(ruta: string, segundos = 600): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ruta, segundos);
  return data?.signedUrl ?? null;
}
