import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { EmpresaIdentidad } from "@/lib/cotizador/empresas";
import { CAJA_LOGO, logoSeguro, type LogosDocumento } from "./logo";

/**
 * El archivo de un logo: normalizarlo, guardarlo y traerlo para imprimir.
 *
 * Lo importante de acá es que **no se guarda el archivo que subieron**. Se guarda
 * el PNG que produce sharp: dentro de una caja conocida, sin metadatos y sin la
 * forma original. Eso resuelve tres cosas de una:
 *
 *  1. El peso. El logo va embebido en la caja de encabezado que Chromium repite en
 *     cada página, así que el de 3 MB del manual de marca multiplicaría el PDF por
 *     la cantidad de páginas.
 *  2. El formato. Un SVG es marcado, no una imagen; rasterizarlo antes de guardarlo
 *     significa que el documento nunca ve otra cosa que píxeles.
 *  3. Los metadatos. Una foto de un logo puede traer EXIF con GPS y autor. sharp
 *     no los arrastra salvo que se le pida.
 *
 * El bucket es privado y solo acepta image/png, que es lo único que este archivo
 * sube. Para mirarlo en pantalla se firma una URL corta; para imprimirlo se baja y
 * se pasa a data URI, porque las cajas de encabezado de Chromium no cargan nada
 * por red.
 */

const BUCKET = "logos";

/**
 * El PNG normalizado.
 *
 * `withoutEnlargement` evita que un logo chico se estire y salga borroso: si mide
 * menos que la caja, queda como está. `density` solo afecta a las entradas
 * vectoriales, y es lo que hace que un SVG se rasterice nítido en vez de a 72 dpi.
 */
export async function normalizarLogo(contenido: Buffer): Promise<Buffer> {
  return sharp(contenido, { density: 300, failOn: "error" })
    .resize({
      width: CAJA_LOGO.ancho,
      height: CAJA_LOGO.alto,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Guarda el PNG y devuelve su ruta en el bucket. */
export async function subirLogo(png: Buffer): Promise<string> {
  // Nombre de uuid: dos empresas pueden subir "logo.png" y el nombre original no
  // aporta nada acá — se guarda aparte, en la fila, solo para mostrarlo.
  const ruta = `${randomUUID()}.png`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(ruta, png, { contentType: "image/png", upsert: false });

  if (error) throw new Error(`No se pudo guardar el logo: ${error.message}`);
  return ruta;
}

/**
 * Borra el archivo de un logo.
 *
 * Acepta null para poder llamarla siempre con el valor anterior sin preguntar: al
 * reemplazar un logo, el archivo viejo tiene que irse o el bucket se llena de
 * huérfanos que nada nombra.
 */
export async function borrarLogo(ruta: string | null | undefined): Promise<void> {
  if (!ruta) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([ruta]);
  // No se propaga: si el archivo ya no está, la fila igual quedó limpia y eso es
  // lo que importa. Queda anotado para poder revisarlo.
  if (error) console.warn(`[ofertas] no se pudo borrar el logo ${ruta}: ${error.message}`);
}

/** Una URL firmada y corta, para mirarlo en pantalla. */
export async function urlFirmadaLogo(ruta: string | null, segundos = 600): Promise<string | null> {
  if (!ruta) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ruta, segundos);
  return data?.signedUrl ?? null;
}

/** El PNG como data URI, que es la única forma de meterlo en el PDF. */
async function comoDataUri(ruta: string | null): Promise<string | null> {
  if (!ruta) return null;

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(ruta);
  if (error || !data) {
    // Un logo que no se pudo bajar deja el encabezado en texto. Falta un logo, no
    // falla la oferta: emitir es lo que la persona vino a hacer.
    console.warn(`[ofertas] no se pudo bajar el logo ${ruta}: ${error?.message ?? "sin datos"}`);
    return null;
  }

  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
  const uri = logoSeguro(`data:image/png;base64,${base64}`);
  if (!uri) console.warn(`[ofertas] el logo ${ruta} quedó fuera del control de tamaño y no se imprimió.`);
  return uri;
}

/**
 * Los dos logos de un documento, listos para la plantilla.
 *
 * El de la casa sale de la identidad de la empresa emisora —se sube una vez y
 * sirve para todas sus ofertas— y el del cliente sale de la oferta, porque ese sí
 * cambia en cada una.
 */
export async function logosParaDocumento(
  empresa: EmpresaIdentidad,
  logoClienteRuta: string | null,
): Promise<LogosDocumento> {
  const [casa, cliente] = await Promise.all([comoDataUri(empresa.logoRuta), comoDataUri(logoClienteRuta)]);
  return { casa, cliente };
}
