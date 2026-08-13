import "server-only";
import { gotoRobusto } from "../playwright-navegador";

// Descarga el XML/PDF de UN documento puntual del portal MIPYME. Combina lo
// portado de descargador_sii.py con un hallazgo posterior (el usuario nos
// mostro una captura del detalle real de un emitido):
//
// 1) El detalle de un EMITIDO trae el PDF YA INCRUSTADO en un
//    <iframe src="mipeDisplayPDF.cgi?DHDR_CODIGO=...">, sin boton ni firma
//    -- se pide directo con page.request.get(), igual que el de un recibido.
// 2) El boton "Obtener Envio" del mismo detalle no descarga un archivo:
//    navega a una pagina de "Firma de Envio de DTE" que ya trae el XML
//    plano (SIN firmar) en un <textarea readonly id="txtPlainText">. No
//    hace falta firmar nada -- alcanza con leer ese campo.
// 3) El detalle de un RECIBIDO trae un link a mipeShowPdf.cgi que se puede
//    pedir directo con page.request.get() (reutiliza las cookies de sesion),
//    sin firma ni CAPTCHA.
//
// IMPORTANTE (confirmado en vivo, probando lo contrario primero): el
// detalle de un documento (mipeGesDocEmi.cgi / mipeGesDocRcp.cgi) NO se
// puede pedir reconstruyendo una URL "?CODIGO=X" en frio, ni siquiera
// visitando el listado general justo antes -- rebota con el boton/link no
// disponible. Solo funciona llegando por el link REAL que trae la fila de
// ese documento en el listado (con su ALL_PAGE_ANT), en la MISMA pasada en
// que se descubre -- exactamente como hace descargador_sii.py. Por eso
// estas funciones reciben el href completo, no un CODIGO suelto (ver
// lib/finanzas-ih/sii-guias-ih.ts, que hace el respaldo en linea).

// Espera corta tras cada carga antes de leer el DOM o navegar de nuevo:
// estas paginas del SII disparan una redireccion de fondo poco despues de
// cargar (ver gotoRobusto en playwright-navegador.ts), que si no, alcanza a
// destruir el contexto de ejecucion justo cuando se llama a page.evaluate().
async function esperarAsentamiento(page: import("playwright-core").Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}

export interface DocumentoEmitidoDescargado {
  xml: string | null;
  pdf: Buffer | null;
}

// Una sola visita al detalle trae ambos archivos: el PDF esta incrustado ya
// en la carga inicial (no requiere click), y el XML aparece despues de
// clickear "Obtener Envio" -- en ese orden, porque el click navega a otra
// pagina y perderiamos el iframe del PDF si lo dejaramos para despues.
export async function descargarDocumentoEmitido(
  page: import("playwright-core").Page,
  hrefDetalle: string
): Promise<DocumentoEmitidoDescargado> {
  await gotoRobusto(page, hrefDetalle, { timeout: 20000 });
  await esperarAsentamiento(page);

  let pdf: Buffer | null = null;
  const pdfSrc = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="mipeDisplayPDF"]');
    return iframe ? iframe.src : null;
  });
  if (pdfSrc) {
    const respuesta = await page.request.get(pdfSrc);
    if (respuesta.ok()) {
      const buffer = await respuesta.body();
      pdf = buffer.length > 500 ? buffer : null; // por debajo de eso es casi seguro una pagina de error, no un PDF real
    }
  }

  let xml: string | null = null;
  const btnEnvio = page.locator('input[name="Button_DLEnvio"]');
  if ((await btnEnvio.count()) > 0) {
    await btnEnvio.first().click();
    await esperarAsentamiento(page);
    const valor = await page.evaluate(() => {
      const el = document.querySelector<HTMLTextAreaElement>("#txtPlainText");
      return el ? el.value : null;
    });
    xml = valor && valor.trim().startsWith("<?xml") ? valor : null;
  }

  return { xml, pdf };
}

export async function descargarPdfRecibido(
  page: import("playwright-core").Page,
  hrefDetalle: string
): Promise<Buffer | null> {
  await gotoRobusto(page, hrefDetalle, { timeout: 20000 });
  await esperarAsentamiento(page);

  const href = await page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>('a[href*="mipeShowPdf"]');
    return a ? a.href : null;
  });
  if (!href) return null;

  const respuesta = await page.request.get(href);
  if (!respuesta.ok()) return null;
  const buffer = await respuesta.body();
  return buffer.length > 500 ? buffer : null; // por debajo de eso es casi seguro una pagina de error, no un PDF real
}
