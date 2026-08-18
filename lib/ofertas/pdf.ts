import "server-only";
import { lanzarNavegador } from "@/lib/playwright-navegador";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import type { Empresa } from "@/lib/cotizador/empresas";
import { ofertaAHtml } from "./plantilla";
import { calcularTotales } from "./verificar";
import type { OfertaCanonica } from "./tipos";

/**
 * La oferta, impresa.
 *
 * Mismo mecanismo que el ECO-1 del Cotizador: Chromium imprime el HTML de la
 * plantilla. Se reutiliza `lanzarNavegador` a propósito — resuelve el Chromium de
 * Vercel, que necesita extraer sus librerías de sistema y no es algo que convenga
 * tener escrito en dos lados.
 *
 * `printBackground: true` es obligatorio acá: sin eso, la cabecera oscura de las
 * tablas, el sombreado de filas alternadas y la barra de avance del cronograma
 * salen en blanco y el documento pierde justo lo que lo hace reconocible.
 */
export async function ofertaAPdf(oferta: OfertaCanonica, nombreEmpresa: Empresa): Promise<Buffer> {
  const empresa = await obtenerEmpresaPorNombre(nombreEmpresa);
  if (!empresa) {
    throw new Error(
      `No se encontró la identidad de "${nombreEmpresa}". Cárgala en /cotizador/empresas antes de emitir.`,
    );
  }

  const html = ofertaAHtml(oferta, calcularTotales(oferta), empresa);

  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** El HTML sin imprimir, para la previsualización en pantalla. */
export async function ofertaAHtmlConEmpresa(
  oferta: OfertaCanonica,
  nombreEmpresa: Empresa,
): Promise<string> {
  const empresa = await obtenerEmpresaPorNombre(nombreEmpresa);
  if (!empresa) throw new Error(`No se encontró la identidad de "${nombreEmpresa}".`);
  return ofertaAHtml(oferta, calcularTotales(oferta), empresa);
}
