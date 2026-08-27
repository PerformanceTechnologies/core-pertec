import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * El PDF tal como se emitió, guardado.
 *
 * La oferta emitida dice "quedó de solo lectura", y hasta ahora eso era verdad del
 * contenido pero no del archivo: la ruta del PDF lo volvía a imprimir en cada
 * descarga. Un ajuste al maestro —otra paleta, otra tipografía, otro alto de
 * encabezado— cambiaba retroactivamente el documento que el cliente ya había
 * recibido, y nadie se enteraba. Para un documento comercial eso no puede ser.
 *
 * Es el mismo criterio que ya usa el Cotizador con `parametros_snapshot`: lo que se
 * emitió se guarda, no se recalcula. Y como el archivo es el que se subió al
 * workspace y el que se adjuntó al correo, guardar ESE es lo que hace que las tres
 * copias sean la misma.
 *
 * Un borrador no se guarda nunca: cambia todo el tiempo y su PDF es una vista
 * previa, no un documento.
 */

const BUCKET = "ofertas-emitidas";

/** Una oferta, un archivo. Emitir dos veces reemplaza, no acumula. */
function rutaDe(ofertaId: string): string {
  return `${ofertaId}.pdf`;
}

/**
 * Guarda el PDF emitido y devuelve su ruta, o null si no se pudo.
 *
 * No lanza: si el bucket falla, la oferta igual se emitió —el PDF ya se generó, se
 * subió al workspace y salió por correo— y perder la copia congelada es un problema
 * menor que dejar la emisión a medias. Queda en el log y en los problemas de la
 * emisión, así que no pasa en silencio.
 */
export async function guardarPdfEmitido(ofertaId: string, pdf: Buffer): Promise<string | null> {
  const ruta = rutaDe(ofertaId);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(ruta, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    console.warn(`[ofertas] no se pudo guardar el PDF emitido de ${ofertaId}: ${error.message}`);
    return null;
  }
  return ruta;
}

/** El PDF emitido, o null si no está guardado (una oferta emitida antes de esto). */
export async function leerPdfEmitido(ruta: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(ruta);
  if (error || !data) {
    console.warn(`[ofertas] no se pudo bajar el PDF emitido ${ruta}: ${error?.message}`);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Borra el PDF de una oferta que se elimina. */
export async function borrarPdfEmitido(ruta: string | null): Promise<void> {
  if (!ruta) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([ruta]);
  if (error) console.warn(`[ofertas] quedó un PDF emitido sin borrar: ${error.message}`);
}
