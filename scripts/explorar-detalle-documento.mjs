// Continuacion de explorar-portal-mipyme.mjs: mipeAdminDocsEmi.cgi (listado
// de documentos EMITIDOS, con filtro TPO_DOC que incluye Guia de Despacho
// Electronica=52 ademas de 33/34/56/61) resulto ser HTML plano, no SPA
// Angular -- y cada fila tiene un link "Ver" a mipeGesDocEmi.cgi?CODIGO=...
// Este script entra a ese detalle para confirmar si trae PDF/XML
// descargables, y prueba tambien el filtro TPO_DOC=52 (guias de despacho).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "scripts", "exploracion-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

function limpiarRut(rut) {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

async function volcar(nombre, page) {
  await page.screenshot({ path: path.join(OUT_DIR, `${nombre}.png`), fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => "");
  fs.writeFileSync(path.join(OUT_DIR, `${nombre}.html`), html);
  const enlaces = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((el) => ({
        texto: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
        href: el.getAttribute("href"),
      }))
    )
    .catch(() => []);
  fs.writeFileSync(path.join(OUT_DIR, `${nombre}.json`), JSON.stringify({ url: page.url(), enlaces }, null, 2));
  console.log(`[${nombre}] url=${page.url()} -- ${enlaces.length} enlaces`);
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
      if (!sel) return [];
      return Array.from(sel.options).map((o) => ({ value: o.value, text: o.text.trim() }));
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

  // 1) Filtro TPO_DOC=52 (Guia de Despacho Electronica) en el listado de
  // documentos emitidos.
  await page.goto(
    "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=52&ESTADO=&ORDEN=&NUM_PAG=1",
    { timeout: 30000 }
  );
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await volcar("04-listado-guias-despacho", page);

  // 2) Detalle de un documento (link "Ver" de la primera fila del listado
  // general, sin filtro) -- para confirmar si expone PDF/XML descargables.
  await page.goto(
    "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=&ESTADO=&ORDEN=&NUM_PAG=1",
    { timeout: 30000 }
  );
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const primerVer = page.locator("table tbody tr td a[href*='mipeGesDocEmi']").first();
  if ((await primerVer.count()) > 0) {
    await primerVer.click({ timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await volcar("05-detalle-documento", page);

    // Dentro del detalle, buscar cualquier link/boton que apunte a PDF o XML.
    const descargas = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href], button"))
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          texto: (el.textContent || "").trim().slice(0, 80),
          href: el.getAttribute("href"),
        }))
        .filter(
          (e) =>
            /pdf|xml|imprimir|descargar/i.test(e.texto) ||
            /pdf|xml|imprimir|descargar/i.test(e.href || "")
        )
    );
    console.log("Posibles descargas en el detalle:", JSON.stringify(descargas, null, 2));
  } else {
    console.log("No encontre un link 'Ver' en el listado general.");
  }

  await browser.close();
  console.log("Listo. Revisa", OUT_DIR);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
