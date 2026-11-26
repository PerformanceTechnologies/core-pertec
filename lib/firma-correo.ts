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

/** Largo máximo del texto de la firma (nombre, cargo, teléfono, dirección…). */
export const LARGO_MAX_TEXTO = 600;

/** La firma de una persona: un texto, una imagen (PNG en base64), o ambos. */
export interface FirmaCorreo {
  texto: string | null;
  imagen: string | null;
}

/**
 * La firma de correo de una persona, o null si no tiene ni texto ni imagen.
 *
 * La imagen vive en SharePoint («ARCHIVOS CORE/Firmas de correo/<id>.png») y en la base queda solo
 * su referencia («sp:<id>»). Una firma antigua guardada en la base (base64) se sigue leyendo
 * hasta que el traspaso la mueva (lib/archivos/traspaso.ts). El texto va en la base (firma_texto).
 *
 * Los invitados no tienen: entran con un código, no con una cuenta de la empresa, y no mandan
 * correos a clientes desde el Core. Sin las columnas (SQL sin correr) tampoco: se lee como «sin
 * firma» (o solo la imagen) y el correo sale igual que antes.
 */
export async function firmaDe(usuario: { id: string; tipo?: string | null }): Promise<FirmaCorreo | null> {
  if (usuario.tipo === "invitado") return null;
  let fila: { firma_imagen?: unknown; firma_texto?: unknown } | null = null;
  const conTexto = await supabaseAdmin.from("usuarios").select("firma_imagen, firma_texto").eq("id", usuario.id).maybeSingle();
  if (!conTexto.error) fila = conTexto.data;
  else if (/firma_texto/.test(conTexto.error.message)) {
    // Falta correr supabase/usuarios/0004_firma_texto.sql: se sigue con la imagen sola.
    const soloImagen = await supabaseAdmin.from("usuarios").select("firma_imagen").eq("id", usuario.id).maybeSingle();
    if (!soloImagen.error) fila = soloImagen.data;
  }
  if (!fila) return null;
  const texto = typeof fila.firma_texto === "string" && fila.firma_texto.trim() ? fila.firma_texto.trim() : null;
  const valor = typeof fila.firma_imagen === "string" && fila.firma_imagen ? fila.firma_imagen : null;
  let imagen: string | null = valor;
  if (valor && esReferenciaSharePoint(valor)) {
    try {
      imagen = (await bajarDeSharePoint(valor)).contenido.toString("base64");
    } catch (e) {
      // Sin la imagen el correo sale igual (con el texto, si hay): no se frena un envío por esto.
      console.error("[firma] No se pudo leer la firma de SharePoint:", e instanceof Error ? e.message : e);
      imagen = null;
    }
  }
  return texto || imagen ? { texto, imagen } : null;
}

/** Guarda (o quita, con null o vacío) el texto de la firma de una persona. */
export async function guardarTextoFirma(usuarioId: string, texto: string | null): Promise<void> {
  const limpio = (texto ?? "").replace(/\r\n?/g, "\n").trim().slice(0, LARGO_MAX_TEXTO) || null;
  const { error } = await supabaseAdmin.from("usuarios").update({ firma_texto: limpio }).eq("id", usuarioId);
  if (error) {
    if (/firma_texto/.test(error.message)) throw new Error("Falta correr el SQL supabase/usuarios/0004_firma_texto.sql.");
    throw new Error(error.message);
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
