import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ImagenExtraida } from "@/lib/cotizador/obra/extraer-texto";
import { BUCKET, proximoIndice, type ImagenGuardada } from "./imagenes";

// Lo único de las imágenes de una oferta que necesita sharp: normalizar y subir.
//
// Está separado de ./imagenes.ts por PESO DEL BUNDLE, no por orden. sharp trae su
// binario nativo de libvips —16 MB— y un import a nivel de módulo lo arrastra a toda
// ruta que importe el archivo, la use o no. ./imagenes.ts lo importa TODO el módulo de
// ofertas (la plantilla, el documento, el PDF, la página), y ninguno de esos redimensiona
// nada: solo bajan del bucket. Con sharp adentro, esos 16 MB viajaban en cada una de esas
// funciones serverless, y en Vercel el peso de las funciones de cada deployment se suma
// contra la cuota de Function Storage (el aviso que llegó al llenarse los 10 GB).
//
// Mismo motivo por el que ./pdf.ts se separó de ./documento.ts para no arrastrar Chromium.
// La regla que queda: lo que importa sharp o un navegador va en su propio archivo, y solo
// lo importa quien de verdad lo usa.

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
