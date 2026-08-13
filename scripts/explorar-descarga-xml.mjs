// Prueba puntual: el detalle de un documento emitido (mipeGesDocEmi.cgi)
// tiene un boton "Obtener Envio" que dispara new_win_DownEnvio() -> navega a
// mipeGenDLNewEnvio.cgi?CODIGO=...&TPO_DOC=...&RUT_RCP=...&DV_RCP=... (con
// un token de reCAPTCHA v3 invisible de por medio). Esta prueba confirma si
// un click real en Playwright (browser real, no fetch plano) completa el
// reCAPTCHA y efectivamente descarga el XML del EnvioDTE.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "scripts", "exploracion-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

function limpiarRut(rut) {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

async function main() {
  const rutRepr = process.env.SII_RUT_REPRESENTANTE;
  const clave = process.env.SII_CLAVE_TRIBUTARIA;
  const rutEmpresa = process.env.SII_RUT_EMPRESA_EXPLORAR || process.env.SII_RUT_EMPRESA_IH;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(
    "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html" +
      "?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4",
    { timeout: 40000 }
  );
  await page.waitForSelector("#rutcntr", { timeout: 20000 });
  await page.locator("#rutcntr").fill(limpiarRut(rutRepr));
  await page.locator("#rutcntr").blur();
  await page.locator("#clave").fill(clave);
  await page.locator("#bt_ingresar").click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  console.log("Login OK.");

  if (page.url().includes("mipeSelEmpresa")) {
    const opciones = await page.evaluate(() => {
      const sel = document.querySelector("select");
      return sel ? Array.from(sel.options).map((o) => ({ value: o.value, text: o.text.trim() })) : [];
    });
    const emp = limpiarRut(rutEmpresa).replace(/-/g, "");
    const elegida =
      opciones.find((o) => o.text.toUpperCase().replace(/[.\-\s]/g, "").includes(emp)) ||
      (opciones.length === 1 ? opciones[0] : null);
    if (elegida) {
      await page.locator("select").first().selectOption({ value: elegida.value });
      const btn = page.locator(
        "input[type='submit'], button[type='submit'], input[value*='eleccionar' i], input[value*='ontinuar' i]"
      );
      if ((await btn.count()) > 0) await btn.first().click();
      else await page.evaluate(() => document.querySelector("form")?.submit());
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      console.log("Empresa seleccionada:", elegida.text);
    }
  }

  await page.goto(
    "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=&ESTADO=&ORDEN=&NUM_PAG=1",
    { timeout: 30000 }
  );
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  const primerVer = page.locator("table tbody tr td a[href*='mipeGesDocEmi']").first();
  await primerVer.click({ timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  console.log("En detalle:", page.url());

  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.evaluate(() => new_win_DownEnvio()),
    ]);
    const destino = path.join(OUT_DIR, "envio-dte-descargado.xml");
    await download.saveAs(destino);
    const contenido = fs.readFileSync(destino, "utf-8");
    console.log("DESCARGA OK. Tamano:", contenido.length, "bytes. Primeros 300 chars:");
    console.log(contenido.slice(0, 300));
  } catch (err) {
    console.log("No hubo descarga (posible bloqueo de reCAPTCHA):", err.message);
    await page.screenshot({ path: path.join(OUT_DIR, "06-tras-obtener-envio.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(OUT_DIR, "06-tras-obtener-envio.html"), await page.content());
    console.log("URL final:", page.url());
  }

  await browser.close();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
