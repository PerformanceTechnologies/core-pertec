// Valida un supuesto de lib/finanzas-ih/sii-guias-ih.ts: que dentro de la
// MISMA sesion (un solo login) se puede volver a mipeSelEmpresa.cgi y elegir
// una empresa distinta, sin que el SII invalide la sesion.
import { chromium } from "playwright";

function limpiarRut(rut) {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

async function seleccionarEmpresa(page, rutEmpresa) {
  await page.goto("https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4", {
    timeout: 30000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  if (!page.url().includes("mipeSelEmpresa")) {
    console.log("(SII salto el selector, ya estaba en la empresa correcta)");
    return;
  }
  const opciones = await page.evaluate(() => {
    const sel = document.querySelector("select");
    return sel ? Array.from(sel.options).map((o) => ({ value: o.value, text: o.text.trim() })) : [];
  });
  const emp = limpiarRut(rutEmpresa).replace(/-/g, "");
  const elegida = opciones.find((o) => o.text.toUpperCase().replace(/[.\-\s]/g, "").includes(emp));
  if (!elegida) {
    console.log("Opciones vistas:", opciones);
    throw new Error(`No se encontro ${rutEmpresa}`);
  }
  await page.locator("select").first().selectOption({ value: elegida.value });
  const btn = page.locator(
    "input[type='submit'], button[type='submit'], input[value*='eleccionar' i], input[value*='ontinuar' i]"
  );
  if ((await btn.count()) > 0) await btn.first().click();
  else await page.evaluate(() => document.querySelector("form")?.submit());
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  console.log("Empresa elegida:", elegida.text);
}

async function razonSocialActual(page) {
  await page.goto(
    "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=&ESTADO=&ORDEN=&NUM_PAG=1",
    { timeout: 30000 }
  );
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  return page.evaluate(() => document.body.innerText.match(/RUT\s*Empresa[^\n]*|Raz[oó]n\s*Social[^\n]*/gi)?.slice(0, 3) ?? null);
}

async function main() {
  const rutRepr = process.env.SII_RUT_REPRESENTANTE;
  const clave = process.env.SII_CLAVE_TRIBUTARIA;

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

  await seleccionarEmpresa(page, process.env.SII_RUT_EMPRESA_IH);
  console.log("Tras elegir IH:", await razonSocialActual(page));

  await seleccionarEmpresa(page, process.env.SII_RUT_EMPRESA_IL);
  console.log("Tras elegir IL (misma sesion):", await razonSocialActual(page));

  await browser.close();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
