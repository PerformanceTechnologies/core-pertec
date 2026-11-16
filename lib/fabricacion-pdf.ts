import "server-only";
import { lanzarNavegador } from "@/lib/playwright-navegador";
import { imprimirAjustado } from "./fin/cotizacion-impresion";
import { htmlDeCosto, pieDeCosto, type DatosCostoPdf } from "./fabricacion-documento";

/**
 * El PDF del costo de fabricación, impreso con Chromium como la OC y la cotización.
 * `printBackground: true` (dentro de imprimirAjustado) es obligatorio: sin eso la barra de color y el
 * encabezado de la tabla salen en blanco.
 */
export async function costoAPdf(d: DatosCostoPdf): Promise<Buffer> {
  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    return (await imprimirAjustado(page, htmlDeCosto(d), pieDeCosto(d))).pdf;
  } finally {
    await browser.close();
  }
}
