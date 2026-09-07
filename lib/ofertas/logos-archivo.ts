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
  const entrada = sharp(contenido, { density: 300, failOn: "error" });

  // Recorte del borde uniforme ANTES de escalar. Un logo exportado suele traer
  // margen transparente alrededor de la marca, y ese margen se escala junto con
  // ella: el resultado entra en la celda del encabezado pero la marca se ve
  // chica, con aire que nadie pidió. Recortando, la marca ocupa su caja.
  //
  // Si el recorte falla —una imagen de un solo color no tiene borde que quitar—
  // se sigue con la original: es una mejora, no un requisito.
  let base = entrada;
  try {
    base = sharp(await entrada.trim().toBuffer(), { failOn: "error" });
  } catch {
    base = sharp(contenido, { density: 300, failOn: "error" });
  }

  return base
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
