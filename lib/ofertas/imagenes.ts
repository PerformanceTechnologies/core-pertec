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
export async function guardarImagenesDelBorrador(imagenes: ImagenExtraida[]): Promise<ImagenGuardada[]> {
  const guardadas: ImagenGuardada[] = [];

  for (const imagen of imagenes) {
    try {
      const original = sharp(imagen.contenido, { failOn: "error" });
      const info = await original.metadata();
      const ancho = info.width ?? 0;
      const alto = info.height ?? 0;
      if (ancho < LADO_MINIMO && alto < LADO_MINIMO) continue;

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
      if (error) {
        console.warn(`[ofertas] no se pudo guardar ${imagen.nombre}: ${error.message}`);
        continue;
      }

      const final = await sharp(contenido).metadata();
      guardadas.push({
        indice: imagen.indice,
        ruta,
        nombre: imagen.nombre,
        ancho: final.width ?? ancho,
        alto: final.height ?? alto,
      });
    } catch (error) {
      console.warn(`[ofertas] la imagen ${imagen.nombre} no se pudo procesar:`, error);
    }
  }

  return guardadas;
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
