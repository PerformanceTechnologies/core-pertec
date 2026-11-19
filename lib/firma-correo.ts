import "server-only";
import sharp from "sharp";
import { supabaseAdmin } from "./supabase-admin";

/** Hasta cuánto se achica la firma: el ancho cómodo de un correo y un alto de firma, no de afiche. */
const ANCHO_MAX = 600;
const ALTO_MAX = 240;
/** El archivo que se acepta subir, antes de achicarlo: el tope del cuerpo de una Server Action es 1 MB. */
export const PESO_MAX_SUBIDA = 950 * 1024;
/** El id con que la imagen va incrustada en el correo (`<img src="cid:…">`). */
export const CID_FIRMA = "firma-core";

/**
 * La firma de correo de una persona (PNG en base64), o null.
 *
 * Los invitados no tienen: entran con un código, no con una cuenta de la empresa, y no mandan
 * correos a clientes desde el Core. Sin la columna (SQL sin correr) tampoco: se lee como «sin
 * firma» y el correo sale igual que antes.
 */
export async function firmaDe(usuario: { id: string; tipo?: string | null }): Promise<string | null> {
  if (usuario.tipo === "invitado") return null;
  const { data, error } = await supabaseAdmin.from("usuarios").select("firma_imagen").eq("id", usuario.id).maybeSingle();
  if (error || !data) return null;
  return typeof data.firma_imagen === "string" && data.firma_imagen ? data.firma_imagen : null;
}

/**
 * Achica la imagen subida a un PNG liviano. Se re-codifica siempre: así lo que se incrusta en los
 * correos es una imagen limpia generada acá (sin metadatos ni lo que trajera el archivo original).
 */
export async function normalizarFirma(contenido: Buffer): Promise<string> {
  const png = await sharp(contenido, { failOn: "error" })
    .rotate()
    .resize({ width: ANCHO_MAX, height: ALTO_MAX, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  if (png.length > 400 * 1024) throw new Error("La imagen quedó muy pesada incluso achicada. Prueba con una más simple.");
  return png.toString("base64");
}

/** Guarda (o quita, con null) la firma de una persona. */
export async function guardarFirma(usuarioId: string, pngBase64: string | null): Promise<void> {
  const { error } = await supabaseAdmin.from("usuarios").update({ firma_imagen: pngBase64 }).eq("id", usuarioId);
  if (error) {
    if (/firma_imagen/.test(error.message)) throw new Error("Falta correr el SQL supabase/usuarios/0003_firma_correo.sql.");
    throw new Error(error.message);
  }
}

/** La imagen como adjunto incrustado de Graph (va con el mensaje, no se ve como archivo aparte). */
export function adjuntoDeFirma(pngBase64: string) {
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: "firma.png",
    contentType: "image/png",
    contentBytes: pngBase64,
    isInline: true,
    contentId: CID_FIRMA,
  };
}
