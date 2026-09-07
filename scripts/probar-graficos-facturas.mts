/**
 * Los gráficos de facturas (ApexCharts), en un navegador de verdad.
 *
 * Correr con:  npm run probar-graficos
 *
 * Lo que se cambió no es el dibujo: es que los gráficos AHORA FILTRAN. Un clic en un mes,
 * en una porción de la dona o en una barra de contraparte tiene que dejar la tabla de
 * abajo mostrando exactamente eso. Nada de eso se prueba leyendo el archivo ni con las
 * series puras (que ya se prueban en probar-panel-odoo): hay que montar el componente,
 * esperar a que Apex pinte el SVG, hacer clic en un elemento del gráfico y mirar la tabla.
 *
 * Y se prueba el modo oscuro, que es el defecto propio de esta biblioteca: Apex escribe
 * los colores COMO ATRIBUTOS del SVG, así que una variable CSS no lo sigue. Si el gráfico
 * no se redibuja al cambiar el tema, las etiquetas de los ejes quedan en gris casi negro
 * sobre fondo casi negro.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const carpeta = mkdtempSync(join(tmpdir(), "graficos-facturas-"));

execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", join(carpeta, "estilos.css")], {
  stdio: "pipe",
});

/**
 * `next/dynamic`, de mentira.
 *
 * Los gráficos entran por dynamic({ ssr: false }) y eso no funciona fuera de Next. El
 * stub hace lo mismo que importa acá —cargar el módulo en el navegador y dibujar— con
 * React.lazy, y con su propio Suspense adentro para no tener que envolver el componente.
 */
writeFileSync(
  join(carpeta, "dinamico.ts"),
  `import { lazy, Suspense, createElement } from "react";
   export default function dynamic(cargar: () => Promise<any>) {
     const Perezoso = lazy(() => cargar().then((c: any) => ({ default: c })));
     return (props: any) => createElement(Suspense, { fallback: null }, createElement(Perezoso, props));
   }`,
);

// Dos clientes, tres meses (con julio vacío a propósito), una vencida, una cedida y una
// pagada: lo mínimo para que los cinco gráficos tengan algo que mostrar.
const factura = (o: {
  id: number;
  cliente: string;
  fecha: string;
  vence: string;
  total: number;
  pendiente: number;
  pago?: string;
  cedida?: string;
}) => `{
  odoo_id: ${o.id}, move_type: "out_invoice", state: "posted",
  payment_state: "${o.pago ?? "not_paid"}", numero: "FAC ${o.id}",
  partner_nombre: "${o.cliente}", fecha_factura: "${o.fecha}", fecha_vencimiento: "${o.vence}",
  monto_total: ${o.total}, monto_pendiente: ${o.pendiente}, diario: "Ventas",
  cedida: ${o.cedida ? `"${o.cedida}"` : "null"}, cedida_a_odoo_id: null,
  dte_estado: "accepted", dte_aceptacion: null, reclamo: null,
  tipo_documento: "(33) Electronic Invoice", monto_neto: null, monto_impuesto: null,
  vendedor: null, condicion_pago: null, referencia: null, origen: null,
  rut_contraparte: "76929210-1", moneda: "CLP", edp_nombre: null, edp_estado: null,
}`;

writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import DetalleFacturas from "${process.cwd()}/components/panel-odoo/DetalleFacturas";

createRoot(document.getElementById("raiz")!).render(
  <DetalleFacturas
    facturas={[
      ${factura({ id: 1, cliente: "Minera Uno", fecha: "2026-06-10", vence: "2026-07-10", total: 1000000, pendiente: 1000000 })},
      ${factura({ id: 2, cliente: "Minera Uno", fecha: "2026-06-20", vence: "2026-07-20", total: 500000, pendiente: 0, pago: "paid" })},
      ${factura({ id: 3, cliente: "Constructora Dos", fecha: "2026-08-05", vence: "2026-12-05", total: 3000000, pendiente: 3000000, cedida: "yielded" })},
      ${factura({ id: 4, cliente: "Constructora Dos", fecha: "2026-08-25", vence: "2026-12-25", total: 250000, pendiente: 250000 })},
    ] as never}
  />,
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
<body class="bg-crema text-tinta"><div id="raiz" style="max-width:900px"></div>
<script src="panel.js"></script></body></html>`,
);

const navegador = await chromium.launch({ headless: true });
const pagina = await navegador.newPage({ viewport: { width: 1000, height: 1400 } });
const errores: string[] = [];
pagina.on("pageerror", (e) => errores.push(e.message));
pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errores.push(`[${m.type()}] ${m.text()}`); });

const ORIGEN = "http://panel.local";
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

// ── 1. Los cinco gráficos se dibujan de verdad ───────────────────────────
await pagina.waitForSelector(".apexcharts-canvas", { timeout: 15000 });
await pagina.waitForFunction(() => document.querySelectorAll(".apexcharts-canvas").length === 5, null, {
  timeout: 15000,
});
assert.deepEqual(errores, [], `los gráficos no pueden lanzar al montarse: ${errores.join(" · ")}`);

/** Un clic sobre un elemento del gráfico N, donde Apex tiene sus escuchas. */
const clicEnPath = (grafico: number, selector: string, indice: number) =>
  pagina.evaluate(
    ([g, sel, i]) => {
      const canvas = document.querySelectorAll(".apexcharts-canvas")[g as number];
      const nodo = canvas.querySelectorAll(sel as string)[i as number];
      // "mousedown" y no "click": es el evento con el que Apex ata pathMouseDown, que es
      // quien dispara dataPointSelection. Un "click" sintético no lo despierta.
      nodo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    },
    [grafico, selector, indice] as const,
  );

/** Las filas de la tabla: el número de factura de cada una. */
const filas = () =>
  pagina.evaluate(() =>
    [...document.querySelectorAll("tbody tr")].map((f) => f.querySelector("p")?.textContent ?? ""),
  );
const chips = () =>
  pagina.evaluate(() =>
    [...document.querySelectorAll("button[aria-label^='Quitar filtro']")].map(
      (b) => b.parentElement?.textContent?.replace("✕", "").trim() ?? "",
    ),
  );

assert.equal((await filas()).length, 4, "arranca con las cuatro facturas");
assert.deepEqual(await chips(), [], "y sin ningún filtro puesto");

// ── 2. Un mes de la tendencia filtra ese mes ─────────────────────────────
//
// El eje tiene junio, julio (vacío) y agosto. Se hace clic en la primera columna dibujada.
const barras = pagina.locator(".apexcharts-canvas").first().locator(".apexcharts-bar-area");
assert.ok((await barras.count()) >= 3, "la tendencia dibuja una columna por mes, julio incluido");
await barras.first().click({ force: true });
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, null, { timeout: 5000 });
assert.deepEqual(
  await filas(),
  ["Minera Uno", "Minera Uno"],
  "el clic en junio deja solo las dos facturas de junio",
);
assert.deepEqual(await chips(), ["2026-06"], "y se ve QUÉ está filtrado, con su × para sacarlo");

// Volver a apretar el mismo mes lo saca: si no, no hay forma de deshacer sin buscar el
// filtro de fechas.
await barras.first().click({ force: true });
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 4, null, { timeout: 5000 });
assert.deepEqual(await chips(), [], "el segundo clic en el mismo mes apaga el filtro");

// ── 3. La × del chip también lo saca ─────────────────────────────────────
await barras.first().click({ force: true });
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, null, { timeout: 5000 });
await pagina.locator("button[aria-label^='Quitar filtro']").first().click();
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 4, null, { timeout: 5000 });

// ── 4. Una porción de la dona filtra ese estado ──────────────────────────
//
// La de "Estado de cobro": la porción "Pagadas" tiene una sola factura.
const porciones = pagina.locator(".apexcharts-canvas").nth(1).locator(".apexcharts-pie-area");
assert.ok((await porciones.count()) >= 2, "la dona reparte en al menos dos porciones");
// Un clic de mouse en el centro del rectángulo de una porción cae en el agujero de la
// dona: se despacha el evento sobre el path, que es donde Apex escucha.
await clicEnPath(1, ".apexcharts-pie-area", 0);
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1, null, { timeout: 5000 });
assert.deepEqual(await chips(), ["Pagadas"], "la primera porción es Pagadas y filtra por eso");
await pagina.locator("button[aria-label^='Quitar filtro']").first().click();
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 4, null, { timeout: 5000 });

// ── 5. Una barra de contraparte busca ese cliente ────────────────────────
await clicEnPath(3, ".apexcharts-bar-area", 0);
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, null, { timeout: 5000 });
assert.deepEqual(
  await filas(),
  ["Constructora Dos", "Constructora Dos"],
  "la barra más alta es Constructora Dos ($3.250.000) y el clic busca ese nombre",
);
await pagina.locator("button[aria-label^='Quitar filtro']").first().click();
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 4, null, { timeout: 5000 });

// ── 6. Los gráficos siguen a los filtros de arriba ───────────────────────
//
// No es decorativo: si el gráfico se queda con el histórico entero mientras la tabla
// muestra cuatro filas, la pantalla dice dos cosas distintas a la vez.
await pagina.fill("input[aria-label='Buscar facturas']", "Minera");
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, null, { timeout: 5000 });
// Los rótulos del eje del primer gráfico. Se leen los tspan y no el <text>: Apex mete
// también un <title> con el mismo texto y el textContent del <text> saldría duplicado.
const rotulosDelEje = () =>
  pagina.evaluate(() =>
    [
      ...document
        .querySelectorAll(".apexcharts-canvas")[0]
        .querySelectorAll(".apexcharts-xaxis-texts-g text tspan"),
    ].map((t) => t.textContent ?? ""),
  );
await pagina
  .waitForFunction(
    () =>
      document.querySelectorAll(".apexcharts-canvas")[0].querySelectorAll(".apexcharts-xaxis-texts-g text tspan")
        .length === 1,
    null,
    { timeout: 5000 },
  )
  .catch(() => {});
const mesesConDatos = await rotulosDelEje();
assert.deepEqual(
  mesesConDatos,
  ["jun 26"],
  `filtrando "Minera" la tendencia se queda solo con junio (decía: ${mesesConDatos.join(", ")})`,
);
await pagina.fill("input[aria-label='Buscar facturas']", "");
await pagina.waitForFunction(() => document.querySelectorAll("tbody tr").length === 4, null, { timeout: 5000 });

// Las animaciones de Apex duran ~300 ms y una captura a mitad de camino muestra barras a
// medio mover, que no es lo que hay que mirar.
await pagina.waitForTimeout(900);

// Una captura del resultado en claro, antes de tocar el tema: es donde se vieron el
// desalineado de las columnas y los rótulos del eje superpuestos.
if (process.env.CAPTURA) await pagina.screenshot({ path: process.env.CAPTURA, fullPage: true });

// ── 7. Modo oscuro: el gráfico se redibuja ───────────────────────────────
const colorDeEje = () =>
  pagina.evaluate(() => {
    const texto = document
      .querySelectorAll(".apexcharts-canvas")[0]
      .querySelector(".apexcharts-xaxis-texts-g text");
    return texto ? getComputedStyle(texto).fill : null;
  });
const claro = await colorDeEje();
await pagina.evaluate(() => {
  document.documentElement.setAttribute("data-theme", "dark");
  window.dispatchEvent(new Event("core-tema-cambio"));
});
await pagina.waitForFunction(
  (antes) => {
    const t = document
      .querySelectorAll(".apexcharts-canvas")[0]
      .querySelector(".apexcharts-xaxis-texts-g text");
    return t !== null && getComputedStyle(t).fill !== antes;
  },
  claro,
  { timeout: 5000 },
);
const oscuro = await colorDeEje();
assert.notEqual(
  oscuro,
  claro,
  "al cambiar el tema el gráfico tiene que redibujarse: Apex pinta el color como atributo del SVG y una variable CSS no lo sigue",
);

if (process.env.CAPTURA_OSCURA) await pagina.screenshot({ path: process.env.CAPTURA_OSCURA, fullPage: true });
assert.deepEqual(errores, [], `ningún error de consola en toda la interacción: ${errores.join(" · ")}`);

await navegador.close();
console.log(
  `Los 5 gráficos de ApexCharts se dibujan, cada clic filtra la tabla (mes ${claro} → ${oscuro} al cambiar de tema), ` +
    "los filtros se ven y se sacan, y los gráficos siguen a los filtros.",
);
