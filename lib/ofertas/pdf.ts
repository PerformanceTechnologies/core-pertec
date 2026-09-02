import "server-only";
import { lanzarNavegador } from "@/lib/playwright-navegador";
import type { Empresa } from "@/lib/cotizador/empresas";
import { plantillasDeImpresion } from "./plantilla";
import { piezasDelDocumento } from "./documento";
import type { OfertaCanonica } from "./tipos";
import type { ImagenGuardada } from "./imagenes";

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
 *
 * El header y el footer van como cajas de margen de Chromium y no como elementos
 * del documento. El primer intento los puso con `position: fixed` y offsets
 * negativos: se veía bien en el navegador y en el PDF caían ENCIMA del texto, con
 * "Página 0 de 0" — los contadores CSS de página no existen fuera de estas cajas.
 * Los márgenes se declaran acá porque tienen que dejarles lugar.
 */
export async function ofertaAPdf(
  oferta: OfertaCanonica,
  nombreEmpresa: Empresa,
  maestroId: string | null = null,
  logoClienteRuta: string | null = null,
  inventario: ImagenGuardada[] = [],
): Promise<Buffer> {
  // El MISMO documento que se ve en pantalla, armado en un solo lugar (./documento.ts):
  // dos caminos para maquetarlo serían dos documentos distintos con el mismo nombre.
  const { html, empresa, estilo, logos } = await piezasDelDocumento(
    oferta,
    nombreEmpresa,
    maestroId,
    logoClienteRuta,
    inventario,
  );

  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    // Playwright imprime con medio "screen" salvo que se le pida lo contrario, a
    // diferencia de Puppeteer. Sin esto, el @media print de la plantilla no se
    // aplica y el header de pantalla sale ADEMÁS del que repite Chromium: la
    // portada mostraba la cabecera dos veces. Se vio imprimiendo, no leyendo el
    // código.
    await page.emulateMedia({ media: "print" });
    const { headerTemplate, footerTemplate } = plantillasDeImpresion(oferta, empresa, estilo, logos);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      // Arriba tiene que caber el header de tres celdas (16 mm) más su aire;
      // abajo, la línea del pie.
      margin: { top: "30mm", bottom: "18mm", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
