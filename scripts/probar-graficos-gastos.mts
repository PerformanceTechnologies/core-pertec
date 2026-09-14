/**
 * Los gráficos de Gastos (ApexCharts), en un navegador de verdad.
 *
 * Correr con:  npm run probar-graficos-gastos
 *
 * Las series puras ya se prueban en probar-gastos; acá se mide el CABLEADO: que un clic en
 * una categoría, en una persona, en un proveedor, en un tipo de documento, en un mes o en
 * un tramo de antigüedad deje la tabla mostrando exactamente eso, que los avisos de arriba
 * sean clickeables, y que los gráficos sigan a los filtros —o la pantalla dice dos cosas a
 * la vez—.
 *
 * Las fechas del universo de prueba son RELATIVAS a hoy y las expectativas se calculan con
 * las mismas funciones puras: así la prueba no se rompe sola cuando pasa el mes.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";
import type { FilaFondo, FilaGasto } from "../lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  filtrarGastos,
  hoyEnChileIso,
  type Criterios,
} from "../lib/panel-odoo/gastos-filtro";
import {
  antiguedadSinRendir,
  porCategoria,
  porEmpleado,
  porProveedor,
  porTipoDeDocumento,
  rangoDelMes,
  tendenciaMensual,
} from "../lib/panel-odoo/gastos-series";

const carpeta = mkdtempSync(join(tmpdir(), "graficos-gastos-"));

execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", join(carpeta, "estilos.css")], {
  stdio: "pipe",
});

writeFileSync(
  join(carpeta, "dinamico.ts"),
  `import { lazy, Suspense, createElement } from "react";
   export default function dynamic(cargar: () => Promise<any>) {
     const Perezoso = lazy(() => cargar().then((c: any) => ({ default: c })));
     return (props: any) => createElement(Suspense, { fallback: null }, createElement(Perezoso, props));
   }`,
);

const HOY = hoyEnChileIso();
const haceDias = (n: number): string =>
  new Date(Date.parse(`${HOY}T00:00:00Z`) - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const base = {
  departamento: "Administración",
  aprobador: null,
  monto_neto: null,
  monto_impuesto: null,
  monto_pendiente: 0,
  estado_aprobacion: null,
  fecha_aprobacion: null,
  forma_pago: "company_account",
  categoria_odoo: "Gastos varios",
  concepto: null,
  respaldos: 1,
  fondo: null,
  fondo_odoo_id: null,
  atribuido_a: null,
  atribuido_tipo: null,
  contraparte: null,
  proyecto: null,
  tarea: null,
  asiento: null,
  duplicados: 0,
};

const GASTOS: FilaGasto[] = [
  // Rendidos de este mes, con categoría y respaldo.
  { ...base, odoo_id: 1, descripcion: "Almuerzo obra", empleado: "Alexa Vasquez", monto_total: 30000, estado: "in_report", fecha: haceDias(2), categoria: "alimentacion", tipo_documento: "boleta_electronica", proveedor: "Copec" },
  { ...base, odoo_id: 2, descripcion: "Peaje ruta 5", empleado: "Alexa Vasquez", monto_total: 12000, estado: "posted", fecha: haceDias(4), categoria: "traslados", tipo_documento: "comprobante_peaje_tag", proveedor: "Copec" },
  { ...base, odoo_id: 3, descripcion: "Hotel Calama", empleado: "Otra Persona", monto_total: 90000, estado: "in_report", fecha: haceDias(6), categoria: "alojamiento", tipo_documento: "factura_electronica", proveedor: "Hotel Norte" },
  // Uno pagado de su bolsillo y sin devolver.
  { ...base, odoo_id: 4, descripcion: "Repuesto urgente", empleado: "Otra Persona", monto_total: 50000, monto_pendiente: 50000, forma_pago: "own_account", estado: "approved", fecha: haceDias(8), categoria: "urgencias", tipo_documento: "factura_electronica", proveedor: "Ferretería Sur" },
  // Borradores sin categoría ni respaldo: el recién cargado y el olvidado.
  { ...base, odoo_id: 5, descripcion: "Sin clasificar", empleado: "Alexa Vasquez", monto_total: 15000, estado: "draft", fecha: haceDias(3), categoria: null, tipo_documento: null, proveedor: null, respaldos: 0 },
  { ...base, odoo_id: 6, descripcion: "Del año pasado", empleado: "Alexa Vasquez", monto_total: 20000, estado: "draft", fecha: haceDias(400), categoria: null, tipo_documento: null, proveedor: null, respaldos: 0 },
  // Uno que Odoo marca repetido.
  { ...base, odoo_id: 7, descripcion: "Almuerzo obra", empleado: "Otra Persona", monto_total: 30000, estado: "in_report", fecha: haceDias(2), categoria: "alimentacion", tipo_documento: "boleta_electronica", proveedor: "Copec", duplicados: 1 },
];

const FONDOS: FilaFondo[] = [
  { odoo_id: 13, referencia: "FR/2026/00013", empleado: "Alexa Vasquez", descripcion: null, motivo: null, fecha: haceDias(90), monto_entregado: 100000, monto_rendido: 100000, saldo: 0, estado: "closed" },
  { odoo_id: 14, referencia: "FR/2026/00014", empleado: "Alexa Vasquez", descripcion: null, motivo: null, fecha: haceDias(30), monto_entregado: 200000, monto_rendido: 50000, saldo: 150000, estado: "delivered" },
];

// Las expectativas se calculan con las mismas funciones puras que ya prueba
// probar-gastos: así esto mide el cableado y no vuelve a discutir cuántos hay en cada
// grupo, que es lo que se rompe cada vez que se toca el universo de prueba.
const cuantosCon = (criterios: Partial<Criterios>) =>
  filtrarGastos(GASTOS, { ...CRITERIOS_INICIALES, ...criterios }, HOY).length;

const meses = tendenciaMensual(GASTOS);
const categorias = porCategoria(GASTOS);
const empleados = porEmpleado(GASTOS);
const proveedores = porProveedor(GASTOS);
const documentos = porTipoDeDocumento(GASTOS);
const tramos = antiguedadSinRendir(GASTOS, HOY);

assert.ok(meses.length >= 12, "la tendencia necesita cubrir hasta el borrador del año pasado");
assert.ok(categorias.some((c) => c.clave === ""), "el universo necesita gastos sin categoría");
assert.equal(cuantosCon({ estado: "olvidados" }), 1, "y exactamente un borrador olvidado");
assert.equal(cuantosCon({ estado: "por_reembolsar" }), 1);
assert.equal(cuantosCon({ estado: "sin_respaldo" }), 2);
assert.equal(tramos[tramos.length - 1].cantidad, 1, "el borrador del año pasado cae en el último tramo");

writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import DetalleGastos from "${process.cwd()}/components/panel-odoo/DetalleGastos";

createRoot(document.getElementById("raiz")!).render(
  <DetalleGastos gastos={${JSON.stringify(GASTOS)} as never} fondos={${JSON.stringify(FONDOS)} as never} />,
);
`,
);

const { outputFiles } = await esbuild.build({
  entryPoints: [join(carpeta, "entrada.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".tsx": "tsx", ".ts": "ts" },
  absWorkingDir: process.cwd(),
  nodePaths: [join(process.cwd(), "node_modules")],
  alias: { "next/dynamic": join(carpeta, "dinamico.ts") },
});
writeFileSync(join(carpeta, "panel.js"), outputFiles[0].text);

writeFileSync(
  join(carpeta, "index.html"),
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="estilos.css"></head>
<body class="bg-crema text-tinta"><div id="raiz" style="max-width:1300px"></div>
<script src="panel.js"></script></body></html>`,
);

const navegador = await chromium.launch({ headless: true });
const pagina = await navegador.newPage({ viewport: { width: 1400, height: 1800 } });
const errores: string[] = [];
pagina.on("pageerror", (e) => errores.push(e.message));

const ORIGEN = "http://gastos.local";
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
await pagina.route(`${ORIGEN}/**`, (ruta) => {
  const nombre = new URL(ruta.request().url()).pathname.replace(/^\//, "") || "index.html";
  const tipo = TIPOS[nombre.slice(nombre.lastIndexOf("."))];
  if (!tipo) return ruta.fulfill({ status: 200, contentType: "text/plain", body: "" });
  return ruta.fulfill({ status: 200, contentType: tipo, body: readFileSync(join(carpeta, nombre)) });
});
await pagina.goto(`${ORIGEN}/index.html`);

// ── 1. Los seis gráficos se dibujan ─────────────────────────────────────
await pagina.waitForSelector(".apexcharts-canvas", { timeout: 15000 });
await pagina.waitForFunction(() => document.querySelectorAll(".apexcharts-canvas").length === 6, null, {
  timeout: 15000,
});
assert.deepEqual(errores, [], `los gráficos no pueden lanzar al montarse: ${errores.join(" · ")}`);

const filasVisibles = () => pagina.locator("table").first().locator("tbody tr");
const cuantasFilas = () =>
  pagina.evaluate(() => document.querySelector("table")!.querySelectorAll("tbody tr").length);
const chips = () =>
  pagina.evaluate(() =>
    [...document.querySelectorAll("button[aria-label^='Quitar filtro']")].map(
      (b) => b.parentElement?.textContent?.replace("✕", "").trim() ?? "",
    ),
  );
const esperarFilas = (cuantas: number) =>
  pagina.waitForFunction((n) => document.querySelector("table")!.querySelectorAll("tbody tr").length === n, cuantas, {
    timeout: 5000,
  });
const quitarPrimerFiltro = async () => {
  await pagina.locator("button[aria-label^='Quitar filtro']").first().click();
  await esperarFilas(GASTOS.length);
};
/** El índice del gráfico cuyo panel se titula así: por título y no por posición. */
const indiceDe = async (titulo: string) => {
  const indice = await pagina.evaluate(
    (t) =>
      [...document.querySelectorAll(".apexcharts-canvas")].findIndex((canvas) =>
        (canvas.closest("div.rounded-xl")?.querySelector("p")?.textContent ?? "").includes(t),
      ),
    titulo,
  );
  assert.notEqual(indice, -1, `no hay ningún gráfico en el panel "${titulo}"`);
  return indice;
};
/** Apex ata sus escuchas a "mousedown": un click sintético no lo despierta. */
const clicEnPunto = (grafico: number, selector: string, indice: number) =>
  pagina.evaluate(
    ([g, sel, i]) => {
      document
        .querySelectorAll(".apexcharts-canvas")[g as number]
        .querySelectorAll(sel as string)[i as number]
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    },
    [grafico, selector, indice] as const,
  );

assert.equal(await cuantasFilas(), GASTOS.length, "arrancan todos los gastos");
assert.deepEqual(await chips(), [], "y sin ningún filtro puesto");

// ── 2. Una porción de la dona filtra esa categoría ──────────────────────
const primeraCategoria = categorias[0];
await clicEnPunto(await indiceDe("En qué se va la plata"), ".apexcharts-pie-area", 0);
await esperarFilas(
  primeraCategoria.clave === ""
    ? cuantosCon({ estado: "sin_categoria" })
    : cuantosCon({ categoria: primeraCategoria.clave }),
);
assert.deepEqual(await chips(), [primeraCategoria.etiqueta]);
await quitarPrimerFiltro();

// ── 3. Una persona ──────────────────────────────────────────────────────
const graficoDeQuien = await indiceDe("Quién gasta");
await clicEnPunto(graficoDeQuien, ".apexcharts-bar-area", 0);
await esperarFilas(cuantosCon({ empleado: empleados[0].clave }));
assert.deepEqual(await chips(), [empleados[0].clave]);

// Volver a apretar lo mismo lo apaga: si no, no hay forma de deshacer sin ir al
// desplegable.
await clicEnPunto(graficoDeQuien, ".apexcharts-bar-area", 0);
await esperarFilas(GASTOS.length);
assert.deepEqual(await chips(), [], "el segundo clic en el mismo punto saca el filtro");

// ── 4. Un tipo de documento ─────────────────────────────────────────────
await clicEnPunto(await indiceDe("Con qué respaldo"), ".apexcharts-bar-area", 0);
await esperarFilas(cuantosCon({ tipoDocumento: documentos[0].clave }));
await quitarPrimerFiltro();

// ── 5. Un proveedor ─────────────────────────────────────────────────────
await clicEnPunto(await indiceDe("En quién se gasta"), ".apexcharts-bar-area", 0);
await esperarFilas(cuantosCon({ proveedor: proveedores[0].clave }));
assert.deepEqual(await chips(), [proveedores[0].clave]);
await quitarPrimerFiltro();

// ── 6. Un mes de la tendencia ───────────────────────────────────────────
const primerMes = meses[0].mes;
await clicEnPunto(await indiceDe("por mes"), ".apexcharts-bar-area", 0);
await esperarFilas(cuantosCon(rangoDelMes(primerMes)));
assert.deepEqual(await chips(), [primerMes]);
await quitarPrimerFiltro();

// ── 7. Un tramo viejo de la antigüedad filtra los olvidados ─────────────
//
// El último tramo, que es donde cayó el borrador del año pasado. Los dos primeros son
// trámite normal y no filtran nada: eso también se comprueba.
const graficoDeAntiguedad = await indiceDe("Hace cuánto esperan");
await clicEnPunto(graficoDeAntiguedad, ".apexcharts-bar-area", tramos.length - 1);
await esperarFilas(cuantosCon({ estado: "olvidados" }));
assert.deepEqual(
  await filasVisibles().locator("p").first().allTextContents(),
  ["Alexa Vasquez"],
  "es el borrador de hace 400 días",
);
await quitarPrimerFiltro();
await clicEnPunto(graficoDeAntiguedad, ".apexcharts-bar-area", 0);
await pagina.waitForTimeout(200);
assert.deepEqual(await chips(), [], "el tramo de esta semana es trámite normal: no filtra nada");

// ── 8. Los avisos son clickeables, y no desaparecen al filtrar ──────────
const avisoSinRespaldo = pagina.locator("text=sin respaldo adjunto en Odoo");
assert.ok(await avisoSinRespaldo.isVisible(), "el aviso de respaldos se ve arriba");
await avisoSinRespaldo.click();
await esperarFilas(cuantosCon({ estado: "sin_respaldo" }));
await quitarPrimerFiltro();

// Y se calcula sobre TODOS los gastos: buscando "Hotel" —un gasto rendido, con respaldo—
// el aviso tiene que seguir ahí. Si desapareciera, esconder el problema sería tan fácil
// como escribir en el buscador.
await pagina.fill("input[aria-label='Buscar gastos']", "Hotel");
await esperarFilas(cuantosCon({ texto: "Hotel" }));
assert.equal(
  cuantosCon({ texto: "Hotel", estado: "sin_respaldo" }),
  0,
  "el universo de prueba necesita que lo buscado SÍ tenga respaldo",
);
assert.ok(
  await avisoSinRespaldo.isVisible(),
  "el aviso no puede desaparecer al filtrar: se calcula sobre todos los gastos",
);

// ── 9. Los gráficos siguen a los filtros de arriba ──────────────────────
const categoriasALaVista = await pagina.evaluate(
  (i) => document.querySelectorAll(".apexcharts-canvas")[i].querySelectorAll(".apexcharts-pie-area").length,
  await indiceDe("En qué se va la plata"),
);
assert.equal(categoriasALaVista, 1, "filtrando por un solo gasto, la dona tiene que quedar con una sola porción");
await pagina.fill("input[aria-label='Buscar gastos']", "");
await esperarFilas(GASTOS.length);

// ── 10. Al apuntar una porción, nada se sale del panel ─────────────────
//
// Apex dibuja al pasar el mouse una banda POR FUERA del anillo (`showHoverOutline`, 8 px
// por omisión), que en esta caja no cabe y queda cortada -- el mismo defecto que se
// reportó en la tarjeta de Flota. Va apagada, y esto lo comprueba.
const indiceDona = await indiceDe("En qué se va la plata");
const alApuntar = await pagina.evaluate((i) => {
  const canvas = document.querySelectorAll(".apexcharts-canvas")[i];
  canvas
    .querySelector(".apexcharts-pie-area")!
    .dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, cancelable: true, view: window }));
  const caja = canvas.getBoundingClientRect();
  const seSalen = [...canvas.querySelectorAll("path")]
    .map((p) => p.getBoundingClientRect())
    .filter(
      (r) =>
        r.width > 0 &&
        (r.top < caja.top - 1 || r.bottom > caja.bottom + 1 || r.left < caja.left - 1 || r.right > caja.right + 1),
    ).length;
  return { seSalen, bandas: canvas.querySelectorAll(".apexcharts-pie-hover-outline-band").length };
}, indiceDona);
assert.equal(alApuntar.bandas, 0, "la banda de hover no cabe en esta caja: tiene que estar apagada");
assert.equal(alApuntar.seSalen, 0, "al apuntar una porción, lo que Apex dibuja se sale del panel y queda recortado");

// ── 11. El tooltip de la dona tiene que verse ──────────────────────────
//
// Con el mouse DE VERDAD sobre el anillo. Apex ubica el tooltip de una dona con
// `clientX/clientY` (`nonAxisChartsTooltips`), que en estos gráficos llegan en 0: se
// dibujaba con su contenido pero fuera de la pantalla. Se ancla con `tooltip.fixed`.
const puntoDelAnillo = await pagina.evaluate((i) => {
  const r = document.querySelectorAll(".apexcharts-canvas")[i].querySelector(".apexcharts-pie")!.getBoundingClientRect();
  const radio = (r.width / 2) * 0.79; // el medio del anillo
  return { x: r.left + r.width / 2 + radio * 0.7, y: r.top + r.height / 2 - radio * 0.7 };
}, indiceDona);
await pagina.mouse.move(puntoDelAnillo.x, puntoDelAnillo.y);
await pagina.waitForFunction(
  (i) => {
    const t = document.querySelectorAll(".apexcharts-canvas")[i].querySelector(".apexcharts-tooltip");
    return t !== null && t.classList.contains("apexcharts-active") && (t.textContent ?? "").length > 0;
  },
  indiceDona,
  { timeout: 5000 },
);
const tooltipDeLaDona = await pagina.evaluate((i) => {
  const canvas = document.querySelectorAll(".apexcharts-canvas")[i];
  const t = canvas.querySelector(".apexcharts-tooltip")!.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  return {
    texto: canvas.querySelector(".apexcharts-tooltip")!.textContent ?? "",
    aLaVista: t.left >= 0 && t.top >= 0 && t.width > 0 && t.height > 0,
    donde: [Math.round(t.left), Math.round(t.top)],
    pegado: t.left < c.right && t.top < c.bottom + 40,
  };
}, indiceDona);
assert.ok(
  tooltipDeLaDona.aLaVista,
  `el tooltip de la dona quedó fuera de la pantalla, en ${tooltipDeLaDona.donde.join(", ")}`,
);
assert.ok(tooltipDeLaDona.pegado, "el tooltip de la dona quedó lejos de su gráfico");
assert.ok(tooltipDeLaDona.texto.includes("gasto"), `y tiene que decir cuántos gastos: "${tooltipDeLaDona.texto}"`);
await pagina.mouse.move(0, 0);

// ── 12. Los fondos por rendir se muestran ──────────────────────────────
const fondos = (await pagina.locator("text=Fondos por rendir").first().textContent()) ?? "";
assert.ok(fondos.length > 0, "los fondos entregados son plata de la empresa afuera: tienen que verse");
assert.ok(
  ((await pagina.locator("text=Sin cerrar").first().textContent()) ?? "").includes("1"),
  "y decir cuántos siguen abiertos",
);

// ── 13. La ficha del gasto dice lo que hay que arreglar ────────────────
await pagina.locator("table tbody tr", { hasText: "Del año pasado" }).click();
await pagina.waitForSelector("div.max-h-\\[85vh\\]", { timeout: 5000 });
const ficha = (await pagina.locator("div.max-h-\\[85vh\\]").textContent()) ?? "";
assert.ok(ficha.includes("Sin respaldo adjunto en Odoo"), "la ficha marca que no tiene respaldo");
assert.ok(ficha.includes("En borrador hace 400 días"), `y hace cuánto espera (decía: ${ficha.slice(0, 200)})`);
await pagina.keyboard.press("Escape");

await pagina.waitForTimeout(900);
if (process.env.CAPTURA) await pagina.screenshot({ path: process.env.CAPTURA, fullPage: true });

assert.deepEqual(errores, [], `ningún error en toda la interacción: ${errores.join(" · ")}`);
await navegador.close();
console.log(
  "Los 6 gráficos de Gastos se dibujan, la categoría, la persona, el documento, el proveedor, el mes y el tramo " +
    "de antigüedad filtran la tabla, los avisos son clickeables y los gráficos siguen a los filtros.",
);
