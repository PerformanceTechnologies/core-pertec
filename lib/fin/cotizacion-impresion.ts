// Imprimir la cotización cuidando la paginación. Sin "server-only" y recibiendo la página ya abierta, para que
// lo use el servidor (con Chromium de Vercel) y la prueba local (con cualquier Chromium) con la MISMA lógica.
//
// La regla: si cabe en una hoja, va en UNA hoja (repartida en el alto, sin hueco al final); si no cabe por poco,
// se usa el modo compacto; y si de verdad son muchas líneas, sigue en una segunda hoja ordenada (encabezado de la
// tabla repetido, filas y bloques sin cortarse por la mitad).

import type { Page } from "playwright-core";
import { htmlDeCotizacion, pieDeCotizacion, type DatosDocumento } from "./cotizacion-documento";

/** Alto máximo del contenido de la primera hoja, en px CSS (A4 = 297 mm menos el margen de pie de 13 mm y la barra). */
export const LIMITE_PX = 1052;

export type ModoDeImpresion = "una-hoja" | "compacto" | "varias-hojas";

export interface Impresion {
  pdf: Buffer;
  paginas: number;
  modo: ModoDeImpresion;
  /** Alto del contenido en px CSS, normal y compacto (diagnóstico); el límite de una hoja es LIMITE_PX. */
  altos: { normal: number; compacto: number | null };
}

/** Páginas de un PDF, contando sus objetos /Type /Page. */
export function paginasDelPdf(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

export async function imprimirCotizacion(page: Page, d: DatosDocumento): Promise<Impresion> {
  // El ancho de A4 a 96 dpi: la maqueta se mide como se va a imprimir.
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.setContent(htmlDeCotizacion(d), { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  const alto = (clases: string) =>
    page.evaluate((c) => {
      document.body.className = c;
      return document.querySelector(".pagina")!.getBoundingClientRect().height;
    }, clases);

  let modo: ModoDeImpresion;
  let clases: string;
  const normal = await alto("");
  let compacto: number | null = null;
  if (normal <= LIMITE_PX) {
    modo = "una-hoja";
    clases = "una-hoja";
  } else if ((compacto = await alto("compacto")) <= LIMITE_PX) {
    modo = "compacto";
    clases = "compacto una-hoja";
  } else {
    modo = "varias-hojas";
    clases = "";
  }
  await page.evaluate((c) => {
    document.body.className = c;
  }, clases);

  const pdf = Buffer.from(
    await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: pieDeCotizacion(d),
      // Los márgenes salen del @page del documento (la primera hoja sin margen arriba, las demás con aire).
      preferCSSPageSize: true,
    }),
  );
  return { pdf, paginas: paginasDelPdf(pdf), modo, altos: { normal: Math.round(normal), compacto: compacto === null ? null : Math.round(compacto) } };
}
