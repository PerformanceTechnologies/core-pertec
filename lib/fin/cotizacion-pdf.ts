import "server-only";
import { lanzarNavegador } from "@/lib/playwright-navegador";
import type { DatosDocumento } from "./cotizacion-documento";
import { imprimirCotizacion } from "./cotizacion-impresion";

/**
 * La cotización, impresa. Mismo mecanismo que el ECO-1 y las ofertas: Chromium imprime el HTML.
 *
 * `printBackground: true` es obligatorio: sin eso la cabecera oscura de la tabla, el sombreado de
 * filas y la barra de TOTAL salen en blanco. El pie va como caja de margen de Chromium (con
 * «Página x de y»), no como elemento del documento. La paginación (una hoja si cabe) vive en
 * cotizacion-impresion.ts.
 */
export async function cotizacionAPdf(d: DatosDocumento): Promise<Buffer> {
  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    // Cabe en una hoja si se puede; si no, sigue ordenada en la siguiente (ver cotizacion-impresion.ts).
    return (await imprimirCotizacion(page, d)).pdf;
  } finally {
    await browser.close();
  }
}

/** «COT-000123 Mantención planta.pdf», sin caracteres que un sistema de archivos o un correo rechacen. */
export function nombreArchivoCotizacion(numero: string, version: number, cliente: string | null): string {
  const limpio = (t: string) => t.normalize("NFC").replace(/["*:<>?/\\|#%\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const partes = [`${limpio(numero)}${version > 1 ? ` V${version}` : ""}`, cliente ? limpio(cliente).slice(0, 50) : ""].filter(Boolean);
  return `${partes.join(" - ")}.pdf`;
}
