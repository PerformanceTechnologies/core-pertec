// Imprimir la cotización ajustándola a la hoja. Sin "server-only" y recibiendo la página ya abierta, para que
// lo use el servidor (con el Chromium de Vercel) y la prueba local con la MISMA lógica.
//
// La regla, en este orden:
//   1. Se busca el mayor tamaño (zoom de .pagina) con el que todo cabe en UNA hoja, entre ZMIN y ZMAX:
//      con pocas líneas el documento se agranda un poco (para no dejar media hoja en blanco), y con
//      muchas se achica solo.
//   2. Lo que sobra de alto se reparte como un respiro entre bloques (hasta un tope) y el resto queda
//      arriba de la firma, que va al pie de la hoja.
//   3. Si ni al tamaño mínimo cabe, sigue en una segunda hoja ordenada: encabezado de la tabla repetido,
//      sin cortar filas ni bloques por la mitad.

import type { Page } from "playwright-core";
import { htmlDeCotizacion, pieDeCotizacion, type DatosDocumento } from "./cotizacion-documento";

/** Alto máximo del contenido de la primera hoja, en px CSS (A4 = 297 mm menos el margen de pie de 13 mm y la barra). */
export const LIMITE_PX = 1052;
/** Letra más chica y más grande que se acepta (1 = el tamaño base de 10 pt). Por debajo de ~0,7 ya no se lee bien impreso. */
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.25;
/** Tamaño con el que se imprime cuando de verdad son demasiadas líneas para una hoja. */
const ZOOM_VARIAS_HOJAS = 0.88;
/** Lo máximo que se separa cada bloque del anterior para repartir el sobrante, en px visuales. */
const RESPIRO_MAX_PX = 30;

export type ModoDeImpresion = "una-hoja" | "varias-hojas";

export interface Impresion {
  pdf: Buffer;
  paginas: number;
  modo: ModoDeImpresion;
  /** El zoom con el que se imprimió. */
  zoom: number;
  /** Qué parte de la hoja ocupa el contenido antes de repartir el sobrante (0–1; en varias hojas, la altura total en hojas). */
  ocupacion: number;
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

  /** Alto visual del contenido con ese zoom (se mide en .hoja, que no lleva zoom, así no depende de cómo el navegador informa las medidas con zoom). */
  const alto = (zoom: number) =>
    page.evaluate((z) => {
      const p = document.querySelector<HTMLElement>(".pagina")!;
      p.className = "pagina";
      p.style.minHeight = "";
      p.style.zoom = String(z);
      document.querySelectorAll<HTMLElement>(".g + .g").forEach((g) => (g.style.marginTop = ""));
      return document.querySelector(".hoja")!.getBoundingClientRect().height;
    }, zoom);

  let zoom: number;
  // (se calcula abajo)
  let modo: ModoDeImpresion;
  if ((await alto(ZOOM_MAX)) <= LIMITE_PX) {
    zoom = ZOOM_MAX;
    modo = "una-hoja";
  } else if ((await alto(ZOOM_MIN)) <= LIMITE_PX) {
    // El mayor zoom que cabe, por bisección (el alto crece con el zoom, con pequeños saltos cuando una línea se parte).
    let bajo = ZOOM_MIN;
    let alto_ = ZOOM_MAX;
    for (let i = 0; i < 9; i++) {
      const medio = (bajo + alto_) / 2;
      if ((await alto(medio)) <= LIMITE_PX) bajo = medio;
      else alto_ = medio;
    }
    zoom = Math.floor(bajo * 1000) / 1000;
    modo = "una-hoja";
  } else {
    zoom = ZOOM_VARIAS_HOJAS;
    modo = "varias-hojas";
  }

  const usado = await alto(zoom);
  const ocupacion = usado / LIMITE_PX;
  if (modo === "una-hoja") {
    // El sobrante se reparte como respiro entre los cuatro bloques, hasta un tope; lo que quede va arriba de la firma.
    const respiro = Math.max(0, Math.min(RESPIRO_MAX_PX, (LIMITE_PX - usado) / 4));
    await page.evaluate(
      ({ z, extra, min }) => {
        const p = document.querySelector<HTMLElement>(".pagina")!;
        p.className = "pagina una-hoja";
        p.style.minHeight = `${min / z}px`;
        document.querySelectorAll<HTMLElement>(".g + .g").forEach((g) => (g.style.marginTop = `calc(5mm + ${extra / z}px)`));
      },
      { z: zoom, extra: respiro, min: LIMITE_PX },
    );
  }

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
  return { pdf, paginas: paginasDelPdf(pdf), modo, zoom, ocupacion };
}
