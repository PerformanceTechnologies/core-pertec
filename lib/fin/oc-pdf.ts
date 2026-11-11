import "server-only";
import { lanzarNavegador } from "@/lib/playwright-navegador";
import { htmlDeOc, pieDeOc, type DatosOc } from "./oc-documento";

/**
 * La OC, impresa. Mismo mecanismo que la cotización: Chromium imprime el HTML.
 * `printBackground: true` es obligatorio: sin eso el fondo claro de la empresa y la barra de color salen en blanco.
 */
export async function ocAPdf(d: DatosOc): Promise<Buffer> {
  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.setContent(htmlDeOc(d), { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    return Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: pieDeOc(d),
        preferCSSPageSize: true,
      }),
    );
  } finally {
    await browser.close();
  }
}
