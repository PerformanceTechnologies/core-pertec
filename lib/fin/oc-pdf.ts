import "server-only";
import { lanzarNavegador } from "@/lib/playwright-navegador";
import { htmlDeOc, pieDeOc, type DatosOc } from "./oc-documento";
import { imprimirAjustado } from "./cotizacion-impresion";

/**
 * La OC, impresa. Mismo mecanismo que la cotización: Chromium imprime el HTML.
 * `printBackground: true` es obligatorio: sin eso la barra de color de la empresa, el encabezado de la tabla y la barra del total salen en blanco.
 */
export async function ocAPdf(d: DatosOc): Promise<Buffer> {
  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    // Cabe en una hoja si se puede; si no, sigue ordenada en la siguiente (ver cotizacion-impresion.ts).
    return (await imprimirAjustado(page, htmlDeOc(d), pieDeOc(d))).pdf;
  } finally {
    await browser.close();
  }
}
