// Script exploratorio (no forma parte de la app): login al SII y volcado del
// menu de la empresa autenticada, para descubrir donde viven las boletas
// electronicas y las guias de despacho (Portal MIPYME / facturacion
// gratuita) antes de escribir el scraper real. NO imprime la clave
// tributaria en ningun momento. Mismo patron que scripts/explorar-rcv.mjs.
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
        onclick: el.getAttribute("onclick"),
      }))
    )
    .catch(() => []);
  const botones = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']")).map((el) => ({
        texto: (el.textContent || el.value || "").trim().slice(0, 100),
        id: el.id || null,
      }))
    )
    .catch(() => []);

  fs.writeFileSync(
    path.join(OUT_DIR, `${nombre}.json`),
    JSON.stringify({ url: page.url(), enlaces, botones }, null, 2)
  );
  console.log(`[${nombre}] url=${page.url()} -- ${enlaces.length} enlaces, ${botones.length} botones (ver ${nombre}.json)`);
}

// Palabras clave para detectar candidatos a "boleta electronica" / "guia de
// despacho" / "facturacion gratuita" entre TODOS los enlaces del menu, sin
// asumir de antemano el texto ni la URL exactos.
const PATRON_CANDIDATO = /boleta|gu[ií]a\s*de\s*despacho|mipyme|facturaci[oó]n\s*(gratis|gratuita)|emitir\s*(dte|documento)/i;

async function main() {
  const rutRepr = process.env.SII_RUT_REPRESENTANTE;
  const clave = process.env.SII_CLAVE_TRIBUTARIA;
  const rutEmpresa = process.env.SII_RUT_EMPRESA_EXPLORAR || process.env.SII_RUT_EMPRESA_IH;
  if (!rutRepr || !clave || !rutEmpresa) {
    console.error("Faltan SII_RUT_REPRESENTANTE / SII_CLAVE_TRIBUTARIA / SII_RUT_EMPRESA_EXPLORAR (o _IH) en el entorno.");
    process.exit(1);
  }

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

  const body = (await page.innerText("body")).toLowerCase();
  if (["clave incorrecta", "rut incorrecto", "acceso no autorizado"].some((s) => body.includes(s))) {
    console.error("Login fallido: RUT o clave incorrectos.");
    await browser.close();
    process.exit(1);
  }
  console.log("Login OK.");
  await volcar("01-post-login", page);

  // Seleccion de empresa, igual que explorar-rcv.mjs.
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
    } else {
      console.error("No se encontro la empresa en el <select> de seleccion. Opciones vistas:", opciones);
    }
  }
  await volcar("02-menu-empresa", page);

  // Con el menu de la empresa ya volcado (02-menu-empresa.json), se buscan
  // los enlaces candidatos y se entra a cada uno para ver que hay detras.
  const dump = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "02-menu-empresa.json"), "utf-8"));
  const candidatos = dump.enlaces.filter((e) => PATRON_CANDIDATO.test(e.texto) || PATRON_CANDIDATO.test(e.href || ""));
  console.log(`Candidatos encontrados en el menu (${candidatos.length}):`, candidatos.map((c) => c.texto));

  let i = 0;
  for (const candidato of candidatos.slice(0, 6)) {
    i++;
    try {
      if (candidato.href && /^https?:\/\//.test(candidato.href)) {
        await page.goto(candidato.href, { timeout: 30000 });
      } else {
        const link = page.locator("a", { hasText: candidato.texto.slice(0, 40) }).first();
        await link.click({ timeout: 10000 });
      }
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await volcar(`03-candidato-${i}-${candidato.texto.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40)}`, page);
      await page.goBack({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
    } catch (err) {
      console.log(`Candidato "${candidato.texto}" fallo: ${err.message}`);
    }
  }

  await browser.close();
  console.log("Listo. Revisa", OUT_DIR);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
