// Imprimir la cotización ajustándola a la hoja. Sin "server-only" y recibiendo la página ya abierta, para que
// lo use el servidor (con el Chromium de Vercel) y la prueba local con la MISMA lógica.
//
// La regla: el texto del documento mantiene SIEMPRE su tamaño; lo único que se achica son las filas de la
// tabla de productos, y solo cuando son tantas que no caben en una hoja.
//   1. Si todo cabe en una hoja con las filas a tamaño normal, así se imprime.
//   2. Si no, se aprietan los márgenes entre bloques (la letra no cambia).
//   3. Si aún no cabe, se busca el mayor tamaño de las filas (entre ZOOM_MIN y 1) con el que todo cabe.
//   4. Si ni al tamaño mínimo cabe, sigue en una segunda hoja ordenada: encabezado de la tabla repetido,
//      sin cortar filas ni bloques por la mitad.
// Con pocas líneas sobra alto: se reparte como un respiro entre bloques (hasta un tope) y la firma va al
// pie, en vez de agrandar la letra.

import type { Page } from "playwright-core";
import { htmlDeCotizacion, pieDeCotizacion, type DatosDocumento } from "./cotizacion-documento";

/** Alto máximo del contenido de la primera hoja, en px CSS (A4 = 297 mm menos el margen de pie de 13 mm y la barra). */
export const LIMITE_PX = 1052;
/** Lo más que se achican las filas de productos (1 = tamaño normal). Por debajo de ~0,6 ya no se lee bien impreso. */
export const ZOOM_MIN = 0.6;
/** Tamaño de las filas cuando de verdad son demasiadas para una hoja (así la segunda hoja ocupa menos). */
const ZOOM_VARIAS_HOJAS = 0.85;
/** Lo máximo que se separa cada bloque del anterior para repartir el sobrante, en px. */
const RESPIRO_MAX_PX = 56;

export type ModoDeImpresion = "una-hoja" | "varias-hojas";

export interface Impresion {
  pdf: Buffer;
  paginas: number;
  modo: ModoDeImpresion;
  /** El tamaño con el que se imprimieron las filas de productos (1 = normal). */
  zoom: number;
  /** Si se apretaron los márgenes entre bloques para que cupiera. */
  espacioJusto: boolean;
  /** Qué parte de la hoja ocupa el contenido antes de repartir el sobrante (0–1; en varias hojas, el alto total en hojas). */
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

  /** Alto del contenido con las filas a ese tamaño (se mide en .hoja, que no lleva zoom). */
  const alto = (zoom: number, justo: boolean) =>
    page.evaluate(({ z, j }) => {
      document.body.className = j ? "espacio-justo" : "";
      const p = document.querySelector<HTMLElement>(".pagina")!;
      p.className = "pagina";
      p.style.minHeight = "";
      document.querySelector<HTMLElement>("table.lineas")!.style.zoom = String(z);
      document.querySelectorAll<HTMLElement>(".g + .g").forEach((g) => (g.style.marginTop = ""));
      return document.querySelector(".hoja")!.getBoundingClientRect().height;
    }, { z: zoom, j: justo });

  let zoom = 1;
  let justo = false;
  let modo: ModoDeImpresion = "una-hoja";
  if ((await alto(1, false)) <= LIMITE_PX) {
    // Todo a tamaño normal.
  } else if ((await alto(1, true)) <= LIMITE_PX) {
    justo = true;
  } else if ((await alto(ZOOM_MIN, true)) <= LIMITE_PX) {
    justo = true;
    // El mayor tamaño que cabe, por bisección (el alto crece con el zoom, con pequeños saltos cuando una línea se parte).
    let bajo = ZOOM_MIN;
    let arriba = 1;
    for (let i = 0; i < 9; i++) {
      const medio = (bajo + arriba) / 2;
      if ((await alto(medio, true)) <= LIMITE_PX) bajo = medio;
      else arriba = medio;
    }
    zoom = Math.floor(bajo * 1000) / 1000;
  } else {
    zoom = ZOOM_VARIAS_HOJAS;
    modo = "varias-hojas";
  }

  const usado = await alto(zoom, justo);
  const ocupacion = usado / LIMITE_PX;
  if (modo === "una-hoja") {
    // El sobrante se reparte como respiro entre los bloques, hasta un tope; lo que quede va arriba de la firma.
    const respiro = Math.max(0, Math.min(RESPIRO_MAX_PX, (LIMITE_PX - usado) / 4));
    await page.evaluate(
      ({ extra, min }) => {
        const p = document.querySelector<HTMLElement>(".pagina")!;
        // Primero se leen los márgenes de cada bloque (5 mm, o 3 mm con el espacio justo): con la hoja ya en
        // columna, el margen automático de la firma se informaría como el sobrante entero.
        // La firma (.cierre) queda fuera: su margen automático es lo que la lleva al pie de la hoja.
        const bloques = [...document.querySelectorAll<HTMLElement>(".g + .g:not(.cierre)")];
        const base = bloques.map((g) => parseFloat(getComputedStyle(g).marginTop));
        p.className = "pagina una-hoja";
        p.style.minHeight = `${min}px`;
        bloques.forEach((g, i) => (g.style.marginTop = `${base[i] + extra}px`));
      },
      { extra: respiro, min: LIMITE_PX },
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
  return { pdf, paginas: paginasDelPdf(pdf), modo, zoom, espacioJusto: justo, ocupacion };
}
