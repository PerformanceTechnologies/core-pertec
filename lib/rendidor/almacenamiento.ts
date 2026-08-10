import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "../supabase-admin";

// Los respaldos de las rendiciones viven en Supabase Storage.
//
// Antes vivian SOLO en memoria del navegador: cerrar la pestania dejaba la
// rendicion con los datos pero sin los archivos, y habia que volver a subirlos
// para adjuntarlos a Odoo o embeberlos en el Excel. Con el bucket, el servidor
// lee los bytes por su cuenta y el navegador ya no tiene que retener ni reenviar
// nada.
//
// Efecto secundario que importa: la generacion del Excel dejo de mandar N
// imagenes en un solo request, asi que ya no roza el tope de ~4,5 MB del body de
// Vercel, y una rendicion recuperada mas tarde puede exportar la planilla igual.

const BUCKET = "rendiciones-respaldos";

/**
 * Sube un respaldo y devuelve su ruta.
 *
 * La ruta se agrupa por rendicion (`{rendicionId}/{uuid}.{ext}`) para poder
 * borrar todo junto cuando se borra la rendicion. El nombre es un uuid y no el
 * del archivo original: los nombres reales traen espacios, tildes y parentesis
 * ("descarga (1).png"), y ademas dos comprobantes distintos pueden llamarse
 * igual.
 */
export async function subirRespaldo(
  rendicionId: string,
  contenido: Buffer,
  mimeType: string,
): Promise<string> {
  const extension = mimeType === "application/pdf" ? "pdf" : mimeType.replace("image/", "");
  const ruta = `${rendicionId}/${randomUUID()}.${extension}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(ruta, contenido, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`No pudimos guardar el respaldo: ${error.message}`);
  return ruta;
}

export interface RespaldoDescargado {
  contenido: Buffer;
  mimeType: string;
}

/**
 * Baja un respaldo del bucket.
 *
 * Devuelve null si no esta, en vez de lanzar: un respaldo faltante es una fila
 * que hay que informar, no un motivo para tumbar toda la carga o la planilla.
 */
export async function descargarRespaldo(ruta: string): Promise<RespaldoDescargado | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(ruta);
  if (error || !data) {
    console.error(`[rendidor] No se pudo bajar el respaldo ${ruta}:`, error?.message);
    return null;
  }
  return {
    contenido: Buffer.from(await data.arrayBuffer()),
    // El tipo se deriva de la extension: es lo que se uso al subir y evita
    // depender de que el bucket devuelva el content-type correcto.
    mimeType: ruta.endsWith(".pdf") ? "application/pdf" : `image/${ruta.split(".").pop()}`,
  };
}

/** Borra todos los respaldos de una rendicion. */
/**
 * URL temporal para VER un respaldo desde el navegador.
 *
 * El bucket es privado y tiene que seguir siéndolo: son documentos tributarios con
 * RUT, montos y datos del proveedor. Una URL firmada es la forma de mostrarlos sin
 * abrir el bucket ni hacer pasar los bytes por una función del servidor — el
 * navegador los pide directo a Supabase.
 *
 * Es una credencial portadora: quien tenga el enlace puede ver ESE archivo hasta
 * que expire, sin estar logueado. Por eso la vida es corta y se generan en cada
 * carga de la página, que es force-dynamic. No sirven para compartir ni quedan
 * guardadas en ninguna parte.
 *
 * Devuelve null en vez de lanzar: un respaldo que no se puede previsualizar no
 * puede voltear la página entera de revisión.
 */
export async function urlFirmadaDeRespaldo(ruta: string, segundos = 1800): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ruta, segundos);
  if (error || !data?.signedUrl) {
    console.error(`[rendidor] No se pudo firmar la URL de ${ruta}:`, error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function borrarRespaldosDeRendicion(rendicionId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(rendicionId);
  if (error) {
    console.error(`[rendidor] No se pudo listar los respaldos de ${rendicionId}:`, error.message);
    return;
  }
  if (!data || data.length === 0) return;

  const { error: errorBorrado } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove(data.map((f) => `${rendicionId}/${f.name}`));

  // No se propaga: el borrado de la rendicion no debe fallar porque quedaron
  // archivos huerfanos en el bucket. Se deja en el log para poder limpiarlos.
  if (errorBorrado) {
    console.error(`[rendidor] Quedaron respaldos sin borrar en ${rendicionId}:`, errorBorrado.message);
  }
}

// Objetivo de peso por imagen embebida en el Excel, igual que la skill: 35 KB en
// escala de grises. Con eso una planilla de 16 respaldos pesa ~600 KB en vez de
// varios MB, y el documento sigue perfectamente legible.
const OBJETIVO_KB = 35;
const ESCALONES: [number, number][] = [
  [1400, 65],
  [1200, 60],
  [1000, 55],
  [900, 50],
];

/**
 * Version chica y en escala de grises para embeber en el Excel.
 *
 * Antes esto se hacia en el navegador con un canvas y viajaba en el request.
 * Ahora se hace con sharp del lado del servidor, que lee del bucket: el
 * navegador dejo de tener que retener los archivos.
 *
 * Devuelve null para un PDF (no se puede embeber en una celda) o si la
 * conversion falla, y quien llama pone el aviso en la planilla.
 */
export async function miniaturaParaExcel(contenido: Buffer, mimeType: string): Promise<Buffer | null> {
  if (mimeType === "application/pdf") return null;

  try {
    for (const [maxDim, calidad] of ESCALONES) {
      const salida = await sharp(contenido)
        // flatten sobre blanco: un PNG con transparencia perderia el fondo al
        // pasar a JPEG y saldria texto oscuro sobre negro.
        .flatten({ background: "#ffffff" })
        .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
        .grayscale()
        // grayscale() convierte los colores a gris, pero el JPEG sale igual con
        // 3 canales sRGB: gris a la vista y con el peso de una imagen en color.
        // toColourspace lo baja a 1 canal real, que es el modo "L" que usa la
        // skill.
        .toColourspace("b-w")
        .jpeg({ quality: calidad, mozjpeg: true })
        .toBuffer();

      // Se corta en el primer escalon que baja del objetivo para no degradar mas
      // de lo necesario; el ultimo se acepta como sea.
      if (salida.length <= OBJETIVO_KB * 1024 || maxDim === 900) return salida;
    }
    return null;
  } catch (e) {
    console.error("[rendidor] No se pudo generar la miniatura para el Excel:", e);
    return null;
  }
}
