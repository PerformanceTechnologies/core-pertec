// Script exploratorio (no forma parte de la app): login al SII + navegacion
// al RCV, tomando screenshots y volcando los elementos interactivos de la
// pagina para descubrir los selectores reales (la RCV es una SPA Angular,
// no se pueden adivinar). NO imprime la clave tributaria en ningun momento.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR =
  "C:\\Users\\HUGO\\AppData\\Local\\Temp\\claude\\C--Users-HUGO-Documents-CLAUDE-Proyectos\\2f5abe62-bb29-4012-aa08-c45cee47103e\\scratchpad";

function limpiarRut(rut) {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

async function paso(nombre, page) {
  const shot = path.join(OUT_DIR, `paso-${nombre}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  const selects = await page.evaluate(() =>
    Array.from(document.querySelectorAll("select")).map((el) => ({
      id: el.id || null,
      name: el.name || null,
      cls: el.className || null,
      opciones: Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() })),
    }))
  );
  const botones = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], a.btn, [role='tab']"))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.value || "").trim().slice(0, 60),
        id: el.id || null,
        cls: el.className && typeof el.className === "string" ? el.className.slice(0, 100) : null,
      }))
      .filter((b) => b.text)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, `paso-${nombre}.json`),
    JSON.stringify({ url: page.url(), selects, botones }, null, 2)
  );
  console.log(`[${nombre}] url=${page.url()} screenshot+dump guardados`);
}

async function main() {
  const rutRepr = process.env.SII_RUT_REPRESENTANTE;
  const clave = process.env.SII_CLAVE_TRIBUTARIA;
  const rutEmpresa = process.env.SII_RUT_EMPRESA;
  if (!rutRepr || !clave || !rutEmpresa) {
    console.error("Faltan SII_RUT_REPRESENTANTE / SII_CLAVE_TRIBUTARIA / SII_RUT_EMPRESA en el entorno.");
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
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await paso("01-login", page);

  const body = (await page.innerText("body")).toLowerCase();
  if (["clave incorrecta", "rut incorrecto", "acceso no autorizado"].some((s) => body.includes(s))) {
    console.error("Login fallido: RUT o clave incorrectos.");
    await browser.close();
    process.exit(1);
  }
  console.log("Login OK.");

  // Seleccion de empresa (si aplica)
  if (page.url().includes("mipeSelEmpresa")) {
    const opciones = await page.evaluate(() => {
      const sel = document.querySelector("select");
      if (!sel) return [];
      return Array.from(sel.options).map((o) => ({ value: o.value, text: o.text.trim() }));
    });
    console.log("Empresas disponibles:", opciones);
    const emp = limpiarRut(rutEmpresa).replace(/-/g, "");
    const elegida = opciones.find((o) =>
      o.text.toUpperCase().replace(/[.\-\s]/g, "").includes(emp)
    ) || (opciones.length === 1 ? opciones[0] : null);
    if (elegida) {
      await page.locator("select").first().selectOption({ value: elegida.value });
      const btn = page.locator(
        "input[type='submit'], button[type='submit'], input[value*='eleccionar' i], input[value*='ontinuar' i]"
      );
      if ((await btn.count()) > 0) await btn.first().click();
      else await page.evaluate(() => document.querySelector("form")?.submit());
      await page.waitForLoadState("networkidle", { timeout: 20000 });
      console.log("Empresa seleccionada:", elegida.text);
    } else {
      console.error("No se encontro la empresa en el <select>.");
    }
  }
  await paso("02-post-empresa", page);

  // Navegar al RCV
  await page.goto("https://www4.sii.cl/consdcvinternetui/#/index", { timeout: 40000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(2000); // Angular SPA, dar tiempo a renderizar
  await paso("03-rcv-index", page);

  // Solo inspeccionar los <select> de la pantalla de consulta (RUT/Periodo);
  // la seleccion real se hace en una segunda pasada una vez confirmados los
  // valores/ids exactos.
  const selectsInfo = await page.evaluate(() =>
    Array.from(document.querySelectorAll("select")).map((el, i) => ({
      idx: i,
      id: el.id,
      name: el.name,
      opciones: Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() })),
    }))
  );
  console.log("Selects en pantalla de consulta:", JSON.stringify(selectsInfo, null, 2));

  const ahora = new Date();
  const mes = String(process.env.SII_MES || ahora.toISOString().slice(5, 7));
  const anio = String(process.env.SII_ANIO || ahora.toISOString().slice(0, 4));

  await page.locator("select[name='rut']").selectOption(limpiarRut(rutEmpresa));
  await page.locator("select#periodoMes").selectOption(mes);
  await page.locator("select").nth(2).selectOption(anio);
  await paso("05-form-lleno", page);

  const btnConsultar = page.locator("button, input[type='submit']").filter({ hasText: /consultar/i });
  await btnConsultar.first().click();
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await paso("06-tras-consultar", page);

  async function descargarDetalles(etiqueta) {
    const btnDetalles = page.locator("button, a").filter({ hasText: /descargar detalles/i });
    if ((await btnDetalles.count()) === 0) {
      console.log(`[${etiqueta}] No encontre boton 'Descargar Detalles'.`);
      return;
    }
    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }),
        btnDetalles.first().click(),
      ]);
      const destino = path.join(OUT_DIR, `matriz-${etiqueta}.csv`);
      await download.saveAs(destino);
      const contenido = fs.readFileSync(destino, "utf-8");
      const filas = contenido.trim().split("\n").length - 1;
      console.log(`[${etiqueta}] OK, ${filas} filas -> ${destino}`);
    } catch (err) {
      console.log(`[${etiqueta}] Sin descarga (probablemente 0 documentos): ${err.message}`);
    }
  }

  async function irATab(texto) {
    const tab = page.locator("a, li").filter({ hasText: new RegExp(`^${texto}$`, "i") }).first();
    await tab.scrollIntoViewIfNeeded();
    await tab.click({ timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  // VENTA no tiene sub-pestanas (Registro/Pendientes/etc.) porque el flujo de
  // acuse de recibo/reclamo es solo del lado de quien recibe (COMPRA); VENTA
  // muestra el resumen directo.
  await irATab("COMPRA");
  for (const sub of ["Registro", "Pendientes", "No Incluir", "Reclamados"]) {
    try {
      await irATab(sub);
      await descargarDetalles(`COMPRA-${sub.replace(/\s+/g, "")}`);
    } catch (err) {
      console.log(`[COMPRA-${sub}] No pude entrar al sub-tab: ${err.message}`);
    }
  }

  await irATab("VENTA");
  await descargarDetalles("VENTA-Registro");

  await browser.close();
  console.log("Listo. Revisa los paso-*.png y paso-*.json en:", OUT_DIR);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
