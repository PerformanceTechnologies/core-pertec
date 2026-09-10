/**
 * Los gráficos de Ventas y Arriendo (ApexCharts), en un navegador de verdad.
 *
 * Correr con:  npm run probar-graficos-ventas
 *
 * Las series puras ya se prueban en probar-ventas; acá se mide el CABLEADO: que un clic en
 * un estado de arriendo, en una porción de "dónde está la plata", en un mes o en un
 * vendedor deje la tabla mostrando exactamente eso, que los avisos de arriba sean
 * clickeables, y que los gráficos sigan a los filtros —o la pantalla dice dos cosas a la
 * vez—.
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
import type { FilaVenta } from "../lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  filtrarVentas,
  hoyEnChileIso,
  type Criterios,
} from "../lib/panel-odoo/ventas-filtro";
import {
  arriendosPorEstado,
  dondeEstaLaPlata,
  porVendedor,
  rangoDelMes,
  tendenciaMensual,
  vencimientosDeArriendo,
} from "../lib/panel-odoo/ventas-series";

const carpeta = mkdtempSync(join(tmpdir(), "graficos-ventas-"));

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
  monto_neto: null,
  monto_impuesto: null,
  monto_facturado: 0,
  monto_por_facturar: 0,
  facturas: 0,
  estado_facturacion: "no",
  equipo: "Ventas",
  referencia_cliente: null,
  origen: null,
  oportunidad: null,
  condicion_pago: null,
  validez_hasta: null,
  fecha_compromiso: null,
  margen: null,
  margen_porcentaje: null,
  margen_bajo: false,
  margen_aprobado: false,
  estado_entrega: null,
  etiquetas: null,
  es_arriendo: false,
  estado_arriendo: "draft",
  fecha_inicio_arriendo: null,
  fecha_fin_arriendo: null,
  fecha_devolucion: null,
  dias_arriendo: null,
  dias_atraso: null,
  tiene_danos: false,
  costo_danos: 0,
  total_liquidacion: 0,
  producto_devuelto: false,
  garantia_estado: null,
  garantia_documento: null,
};

const VENTAS: FilaVenta[] = [
  // Dos cotizaciones de este mes y una vieja.
  { ...base, odoo_id: 1, numero: "S01", partner_nombre: "Minera Uno", estado: "sent", monto_total: 5000000, vendedor: "Harris Gallardo", fecha_orden: `${haceDias(2)} 10:00:00+00` },
  { ...base, odoo_id: 2, numero: "S02", partner_nombre: "Minera Uno", estado: "draft", monto_total: 3000000, vendedor: "Harris Gallardo", fecha_orden: `${haceDias(3)} 10:00:00+00` },
  { ...base, odoo_id: 3, numero: "S03", partner_nombre: "Constructora Dos", estado: "sent", monto_total: 2000000, vendedor: "Harris Gallardo", fecha_orden: `${haceDias(60)} 10:00:00+00`, validez_hasta: haceDias(20) },
  // Una confirmada sin facturar y una ya facturada.
  { ...base, odoo_id: 4, numero: "S04", partner_nombre: "Tercera SpA", estado: "sale", estado_facturacion: "to invoice", monto_total: 8000000, monto_por_facturar: 8000000, vendedor: "Alfonso Hachim", fecha_orden: `${haceDias(40)} 10:00:00+00` },
  { ...base, odoo_id: 5, numero: "S05", partner_nombre: "Cuarta Ltda", estado: "sale", estado_facturacion: "invoiced", monto_total: 4000000, monto_facturado: 4000000, vendedor: "Alfonso Hachim", fecha_orden: `${haceDias(45)} 10:00:00+00` },
  // Un arriendo pasado de fecha, uno por vencer y uno devuelto con daños.
  { ...base, odoo_id: 6, numero: "S06", partner_nombre: "Minera Cinco", estado: "sale", es_arriendo: true, estado_arriendo: "delivered", monto_total: 12000000, vendedor: "Harris Gallardo", fecha_orden: `${haceDias(70)} 10:00:00+00`, fecha_inicio_arriendo: `${haceDias(70)} 10:00:00+00`, fecha_fin_arriendo: `${haceDias(10)} 10:00:00+00` },
  { ...base, odoo_id: 7, numero: "S07", partner_nombre: "Minera Seis", estado: "sale", es_arriendo: true, estado_arriendo: "confirmed", monto_total: 6000000, vendedor: "Harris Gallardo", fecha_orden: `${haceDias(20)} 10:00:00+00`, fecha_inicio_arriendo: `${haceDias(20)} 10:00:00+00`, fecha_fin_arriendo: `${haceDias(-10)} 10:00:00+00` },
  { ...base, odoo_id: 8, numero: "S08", partner_nombre: "Séptima SA", estado: "sale", es_arriendo: true, estado_arriendo: "returned", producto_devuelto: true, tiene_danos: true, costo_danos: 350000, monto_total: 2000000, vendedor: "Alfonso Hachim", fecha_orden: `${haceDias(80)} 10:00:00+00`, fecha_fin_arriendo: `${haceDias(30)} 10:00:00+00` },
];

// Las expectativas se calculan con las mismas funciones puras que ya prueba
// probar-ventas: así esto mide el cableado y no vuelve a discutir cuántas hay en cada
// grupo, que es lo que se rompe cada vez que se toca el universo de prueba.
const cuantasCon = (criterios: Partial<Criterios>) =>
  filtrarVentas(VENTAS, { ...CRITERIOS_INICIALES, ...criterios }, HOY).length;

const meses = tendenciaMensual(VENTAS);
const plata = dondeEstaLaPlata(VENTAS);
const estados = arriendosPorEstado(VENTAS);
const vendedores = porVendedor(VENTAS);
const tramos = vencimientosDeArriendo(VENTAS, HOY);

assert.ok(meses.length >= 3, "la tendencia necesita varios meses");
assert.ok(plata.length === 3, "las tres formas de plata tienen que estar");
assert.ok(estados.length >= 2, "el gráfico de arriendos necesita al menos dos estados");
assert.equal(cuantasCon({ estado: "arriendos_atrasados" }), 1);
assert.equal(cuantasCon({ estado: "por_facturar" }), 1);
assert.equal(tramos[0].cantidad, 1, "hay un arriendo pasado de fecha");

writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import DetalleVentas from "${process.cwd()}/components/panel-odoo/DetalleVentas";

createRoot(document.getElementById("raiz")!).render(
  <DetalleVentas ventas={${JSON.stringify(VENTAS)} as never} />,
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
const pagina = await navegador.newPage({ viewport: { width: 1400, height: 1600 } });
const errores: string[] = [];
pagina.on("pageerror", (e) => errores.push(e.message));

const ORIGEN = "http://ventas.local";
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

// ── 1. Los cinco gráficos se dibujan ────────────────────────────────────
await pagina.waitForSelector(".apexcharts-canvas", { timeout: 15000 });
await pagina.waitForFunction(() => document.querySelectorAll(".apexcharts-canvas").length === 5, null, {
  timeout: 15000,
});
assert.deepEqual(errores, [], `los gráficos no pueden lanzar al montarse: ${errores.join(" · ")}`);

const filas = () =>
  pagina.evaluate(() => [...document.querySelectorAll("tbody tr")].map((f) => f.querySelector("p")?.textContent ?? ""));
const chips = () =>
  pagina.evaluate(() =>
    [...document.querySelectorAll("button[aria-label^='Quitar filtro']")].map(
      (b) => b.parentElement?.textContent?.replace("✕", "").trim() ?? "",
    ),
  );
const esperarFilas = (cuantas: number) =>
  pagina.waitForFunction((n) => document.querySelectorAll("tbody tr").length === n, cuantas, { timeout: 5000 });
const quitarPrimerFiltro = async () => {
  await pagina.locator("button[aria-label^='Quitar filtro']").first().click();
  await esperarFilas(VENTAS.length);
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

assert.equal((await filas()).length, VENTAS.length, "arrancan todas las órdenes");
assert.deepEqual(await chips(), [], "y sin ningún filtro puesto");

// ── 2. Un estado de arriendo filtra los arriendos ───────────────────────
const graficoDeArriendos = await indiceDe("Arriendos por estado");
await clicEnPunto(graficoDeArriendos, ".apexcharts-bar-area", 0);
await esperarFilas(cuantasCon({ estado: "arriendos" }));
assert.deepEqual(await chips(), ["Solo arriendos"]);

// Volver a apretar lo mismo lo apaga: si no, no hay forma de deshacer sin ir al
// desplegable.
await clicEnPunto(graficoDeArriendos, ".apexcharts-bar-area", 0);
await esperarFilas(VENTAS.length);
assert.deepEqual(await chips(), [], "el segundo clic en el mismo punto saca el filtro");

// ── 3. Una porción de "dónde está la plata" ─────────────────────────────
//
// La primera porción es lo cotizado.
await clicEnPunto(await indiceDe("Dónde está la plata"), ".apexcharts-pie-area", 0);
await esperarFilas(cuantasCon({ estado: plata[0].filtro }));
assert.deepEqual(await chips(), ["Cotizaciones abiertas"]);
await quitarPrimerFiltro();

// ── 4. Un mes de la tendencia ───────────────────────────────────────────
const primerMes = meses[0].mes;
await clicEnPunto(await indiceDe("por mes"), ".apexcharts-bar-area", 0);
await esperarFilas(cuantasCon(rangoDelMes(primerMes)));
assert.deepEqual(await chips(), [primerMes]);
await quitarPrimerFiltro();

// ── 5. Un vendedor ──────────────────────────────────────────────────────
const primerVendedor = vendedores[0].nombre;
await clicEnPunto(await indiceDe("por vendedor"), ".apexcharts-bar-area", 0);
await esperarFilas(cuantasCon({ vendedor: primerVendedor }));
assert.deepEqual(await chips(), [primerVendedor]);
await quitarPrimerFiltro();

// ── 6. El tramo de atraso del calendario ────────────────────────────────
await clicEnPunto(await indiceDe("Cuándo terminan"), ".apexcharts-bar-area", 0);
await esperarFilas(cuantasCon({ estado: "arriendos_atrasados" }));
assert.deepEqual(await chips(), ["Arriendos pasados de fecha"]);
assert.deepEqual(await filas(), ["Minera Cinco"], "es el arriendo que terminó hace 10 días");
await quitarPrimerFiltro();

// ── 7. Los avisos son clickeables, y no desaparecen al filtrar ──────────
const avisoDeFacturar = pagina.locator("text=confirmada(s) con saldo sin facturar");
assert.ok(await avisoDeFacturar.isVisible(), "el aviso de facturar se ve arriba");
await avisoDeFacturar.click();
await esperarFilas(cuantasCon({ estado: "por_facturar" }));
assert.deepEqual(await filas(), ["Tercera SpA"]);
await quitarPrimerFiltro();

// Y se calcula sobre TODAS las órdenes: buscando "Minera Uno" —dos cotizaciones de venta,
// ninguna por facturar— el aviso tiene que seguir ahí. Si desapareciera, esconder el
// problema sería tan fácil como escribir en el buscador.
await pagina.fill("input[aria-label='Buscar órdenes']", "Minera Uno");
await esperarFilas(cuantasCon({ texto: "Minera Uno" }));
assert.equal(
  cuantasCon({ texto: "Minera Uno", estado: "por_facturar" }),
  0,
  "el universo de prueba necesita que lo buscado NO tenga nada por facturar",
);
assert.ok(
  await avisoDeFacturar.isVisible(),
  "el aviso no puede desaparecer al filtrar: se calcula sobre todas las órdenes",
);
await pagina.fill("input[aria-label='Buscar órdenes']", "");
await esperarFilas(VENTAS.length);

// ── 8. Los gráficos siguen a los filtros de arriba ──────────────────────
await pagina.fill("input[aria-label='Buscar órdenes']", "Minera Uno");
await esperarFilas(cuantasCon({ texto: "Minera Uno" }));
const arriendosALaVista = await pagina.evaluate(
  (i) => document.querySelectorAll(".apexcharts-canvas")[i].querySelectorAll(".apexcharts-bar-area").length,
  await indiceDe("Arriendos por estado"),
);
assert.equal(
  arriendosALaVista,
  0,
  "las dos órdenes de Minera Uno son cotizaciones de venta: el gráfico de arriendos tiene que quedar vacío",
);
await pagina.fill("input[aria-label='Buscar órdenes']", "");
await esperarFilas(VENTAS.length);

// ── 9. El resumen y la ficha ────────────────────────────────────────────
const resumen = (await pagina.locator("text=Por facturar").first().textContent()) ?? "";
assert.ok(resumen.length > 0, "el resumen menciona lo que falta facturar");

// La ficha del arriendo atrasado dice lo que pasó, no solo dos fechas.
await pagina.locator("tbody tr", { hasText: "Minera Cinco" }).click();
// La ficha se reconoce por su contenedor con scroll, que es lo único estable: los
// grupos aparecen y desaparecen según lo que la orden tenga cargado.
await pagina.waitForSelector("div.max-h-\\[88vh\\]", { timeout: 5000 });
const ficha = (await pagina.locator("div.max-h-\\[88vh\\]").textContent()) ?? "";
assert.ok(ficha.includes("Pasado de fecha"), "la ficha marca el arriendo pasado de fecha");
assert.ok(ficha.includes("pasado de fecha hace 10 días"), `y dice cuántos días (decía: ${ficha.slice(0, 200)})`);
await pagina.keyboard.press("Escape");

await pagina.waitForTimeout(900);
if (process.env.CAPTURA) await pagina.screenshot({ path: process.env.CAPTURA, fullPage: true });

assert.deepEqual(errores, [], `ningún error en toda la interacción: ${errores.join(" · ")}`);
await navegador.close();
console.log(
  "Los 5 gráficos de Ventas y Arriendo se dibujan, el estado de arriendo, la plata, el mes, el vendedor y el " +
    "tramo de atraso filtran la tabla, los avisos son clickeables y los gráficos siguen a los filtros.",
);
