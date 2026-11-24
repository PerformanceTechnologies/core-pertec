import "server-only";
import sharp from "sharp";
import { supabaseAdmin } from "./supabase-admin";
import { guardarArchivo } from "./archivos/almacen";
import { bajarDeSharePoint, borrarDeSharePoint, esReferenciaSharePoint } from "./archivos/sharepoint-core";
import { CARPETA_FIRMAS } from "./archivos/carpetas";

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
 * La imagen vive en SharePoint («ARCHIVOS CORE/Firmas de correo/<id>.png») y en la base queda solo
 * su referencia («sp:<id>»). Una firma antigua guardada en la base (base64) se sigue leyendo
 * hasta que el traspaso la mueva (lib/archivos/traspaso.ts).
 *
 * Los invitados no tienen: entran con un código, no con una cuenta de la empresa, y no mandan
 * correos a clientes desde el Core. Sin la columna (SQL sin correr) tampoco: se lee como «sin
 * firma» y el correo sale igual que antes.
 */
export async function firmaDe(usuario: { id: string; tipo?: string | null }): Promise<string | null> {
  if (usuario.tipo === "invitado") return null;
  const { data, error } = await supabaseAdmin.from("usuarios").select("firma_imagen").eq("id", usuario.id).maybeSingle();
  if (error || !data) return null;
  const valor = typeof data.firma_imagen === "string" && data.firma_imagen ? data.firma_imagen : null;
  if (!valor || !esReferenciaSharePoint(valor)) return valor;
  try {
    return (await bajarDeSharePoint(valor)).contenido.toString("base64");
  } catch (e) {
    // Sin la imagen el correo sale igual, sin firma: no se frena un envío por esto.
    console.error("[firma] No se pudo leer la firma de SharePoint:", e instanceof Error ? e.message : e);
    return null;
  }
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

/** Guarda (o quita, con null) la firma de una persona: la imagen a SharePoint y su referencia a la base. */
export async function guardarFirma(usuarioId: string, pngBase64: string | null): Promise<void> {
  const { data: antes } = await supabaseAdmin.from("usuarios").select("firma_imagen").eq("id", usuarioId).maybeSingle();
  const anterior = typeof antes?.firma_imagen === "string" ? antes.firma_imagen : null;

  // Un archivo por persona, con nombre fijo: cambiar la firma lo reemplaza (SharePoint guarda la versión vieja).
  const valor = pngBase64
    ? await guardarArchivo({ carpeta: CARPETA_FIRMAS, nombre: `${usuarioId}.png`, contenido: Buffer.from(pngBase64, "base64"), tipo: "image/png", reemplazar: true })
    : null;

  const { error } = await supabaseAdmin.from("usuarios").update({ firma_imagen: valor }).eq("id", usuarioId);
  if (error) {
    if (/firma_imagen/.test(error.message)) throw new Error("Falta correr el SQL supabase/usuarios/0003_firma_correo.sql.");
    throw new Error(error.message);
  }
  // Al quitarla, la imagen va a la papelera del sitio (al cambiarla se reemplazó arriba).
  if (!valor && anterior && esReferenciaSharePoint(anterior)) {
    await borrarDeSharePoint([anterior]).catch((e) => console.error("[firma] No se pudo borrar la firma en SharePoint:", e instanceof Error ? e.message : e));
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
