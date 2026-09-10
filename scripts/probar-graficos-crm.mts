/**
 * Los gráficos de CRM (ApexCharts), en un navegador de verdad.
 *
 * Correr con:  npm run probar-graficos-crm
 *
 * Igual que en Facturas, lo que hay que probar no es el dibujo sino que los gráficos
 * FILTREN: un clic en una etapa del embudo, en una porción del reparto, en un mes o en un
 * vendedor tiene que dejar la tabla de abajo mostrando exactamente eso. Y que los
 * gráficos sigan a los filtros de arriba, o la pantalla dice dos cosas a la vez.
 *
 * Las series puras ya se prueban en probar-crm; acá se mide el cableado, que es donde
 * están los errores que no se ven leyendo el archivo.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";
import type { FilaLead } from "../lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  filtrarLeads,
  hoyEnChileIso,
  type Criterios,
} from "../lib/panel-odoo/crm-filtro";
import {
  antiguedadDelPipeline,
  embudo,
  porEstado,
  porVendedor,
  rangoDelMes,
  tendenciaMensual,
} from "../lib/panel-odoo/crm-series";

const carpeta = mkdtempSync(join(tmpdir(), "graficos-crm-"));

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

/**
 * El universo de prueba, con fechas RELATIVAS a hoy.
 *
 * Relativas y no fijas porque el componente compara contra el día de hoy de verdad
 * (hoyEnChileIso): con fechas escritas a mano, "estancada" y "este mes" van cambiando de
 * significado solo, y la prueba empieza a fallar sin que nadie toque el código.
 */
const HOY = hoyEnChileIso();
const haceDias = (n: number): string =>
  new Date(Date.parse(`${HOY}T00:00:00Z`) - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const base = {
  tipo: "opportunity",
  contacto: null,
  activa: true,
  motivo_perdida: null,
  monto_ponderado: 500000,
  probabilidad: 50,
  equipo: "Ventas",
  prioridad: null,
  origen: null,
  medio: null,
  campana: null,
  etiquetas: null,
  correo: null,
  telefono: null,
  ciudad: null,
  fecha_cierre_estimada: null,
  fecha_cierre_real: null,
  dias_para_cerrar: null,
  actividad_proxima: haceDias(-10),
  actividad_resumen: null,
  actividad_tipo: null,
};

const LEADS: FilaLead[] = [
  // Dos abiertas nuevas en New.
  { ...base, odoo_id: 1, nombre: "Op 1", partner_nombre: "Minera Uno", etapa: "New", etapa_secuencia: 1, estado: "abierta", monto_esperado: 1000000, vendedor: "Harris Gallardo", fecha_creacion: `${haceDias(2)} 10:00:00+00`, fecha_ultimo_movimiento: `${haceDias(2)} 10:00:00+00` },
  { ...base, odoo_id: 2, nombre: "Op 2", partner_nombre: "Minera Uno", etapa: "New", etapa_secuencia: 1, estado: "abierta", monto_esperado: 1000000, vendedor: "Harris Gallardo", fecha_creacion: `${haceDias(3)} 10:00:00+00`, fecha_ultimo_movimiento: `${haceDias(3)} 10:00:00+00` },
  // Una en Proposition que SÍ se movió hace poco: vieja pero viva.
  { ...base, odoo_id: 3, nombre: "Op 3", partner_nombre: "Constructora Dos", etapa: "Proposition", etapa_secuencia: 2, estado: "abierta", monto_esperado: 4000000, vendedor: "Harris Gallardo", fecha_creacion: `${haceDias(40)} 10:00:00+00`, fecha_ultimo_movimiento: `${haceDias(4)} 10:00:00+00` },
  // Y una que no se mueve desde hace 100 días: la única estancada.
  { ...base, odoo_id: 4, nombre: "Op 4", partner_nombre: "Cuarta Ltda", etapa: "Proposition", etapa_secuencia: 2, estado: "abierta", monto_esperado: 1000000, vendedor: "Harris Gallardo", fecha_creacion: `${haceDias(100)} 10:00:00+00`, fecha_ultimo_movimiento: `${haceDias(100)} 10:00:00+00` },
  // Una ganada y una perdida, cerradas en un mes distinto al de creación.
  { ...base, odoo_id: 5, nombre: "Op 5", partner_nombre: "Tercera SpA", etapa: "Won", etapa_secuencia: 3, estado: "ganada", monto_esperado: 9000000, vendedor: "Alfonso Hachim", fecha_creacion: `${haceDias(70)} 10:00:00+00`, fecha_cierre_real: `${haceDias(25)} 10:00:00+00`, fecha_ultimo_movimiento: `${haceDias(25)} 10:00:00+00` },
  { ...base, odoo_id: 6, nombre: "Op 6", partner_nombre: "Quinta SA", etapa: "Proposition", etapa_secuencia: 2, estado: "perdida", activa: false, motivo_perdida: "Precio", monto_esperado: 1000000, vendedor: "Harris Gallardo", fecha_creacion: `${haceDias(65)} 10:00:00+00`, fecha_cierre_real: `${haceDias(20)} 10:00:00+00`, fecha_ultimo_movimiento: `${haceDias(20)} 10:00:00+00` },
];

// Las expectativas NO se escriben a mano: se calculan con las mismas funciones puras que
// ya prueba probar-crm. Así la prueba mide el CABLEADO —que el clic aplique el filtro que
// corresponde— sin volver a discutir cuántas oportunidades hay en cada grupo, que es lo
// que se rompía cada vez que se tocaba el universo de prueba.
const cuantasCon = (criterios: Partial<Criterios>) =>
  filtrarLeads(LEADS, { ...CRITERIOS_INICIALES, ...criterios }, HOY).length;

const escalones = embudo(LEADS);
const meses = tendenciaMensual(LEADS);
const estados = porEstado(LEADS);
const vendedores = porVendedor(LEADS);
const tramos = antiguedadDelPipeline(LEADS, HOY);

// Y el universo tiene que dar de qué hablar: si alguna de estas fuera 0, la prueba de más
// abajo pasaría sin medir nada.
assert.ok(escalones.length >= 2, "el embudo necesita al menos dos etapas");
assert.ok(meses.length >= 3, "la tendencia necesita varios meses");
assert.equal(cuantasCon({ estado: "estancadas" }), 1, "el universo tiene UNA estancada");
assert.equal(cuantasCon({ estado: "ganada" }), 1);
assert.equal(cuantasCon({ estado: "perdida" }), 1);
assert.ok(tramos.some((t) => t.cantidad > 0));

writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import DetalleCrm from "${process.cwd()}/components/panel-odoo/DetalleCrm";

createRoot(document.getElementById("raiz")!).render(
  <DetalleCrm leads={${JSON.stringify(LEADS)} as never} />,
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

const ORIGEN = "http://crm.local";
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

const filas = () =>
  pagina.evaluate(() => [...document.querySelectorAll("tbody tr")].map((f) => f.querySelector("p")?.textContent ?? ""));
const chips = () =>
  pagina.evaluate(() =>
    [...document.querySelectorAll("button[aria-label^='Quitar filtro']")].map(
      (b) => b.parentElement?.textContent?.replace("✕", "").trim() ?? "",
    ),
  );
/** Espera a que la tabla tenga exactamente esa cantidad de filas. */
const esperarFilas = (cuantas: number) =>
  pagina.waitForFunction(
    (n) => document.querySelectorAll("tbody tr").length === n,
    cuantas,
    { timeout: 5000 },
  );

/** La × del primer chip, y esperar a que la tabla vuelva a mostrar todo. */
const quitarPrimerFiltro = async () => {
  await pagina.locator("button[aria-label^='Quitar filtro']").first().click();
  await esperarFilas(LEADS.length);
};

/** Apex ata sus escuchas a "mousedown", no a "click": un click sintético no lo despierta. */
const clicEnPunto = (grafico: number, selector: string, indice: number) =>
  pagina.evaluate(
    ([g, sel, i]) => {
      const canvas = document.querySelectorAll(".apexcharts-canvas")[g as number];
      canvas
        .querySelectorAll(sel as string)[i as number]
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    },
    [grafico, selector, indice] as const,
  );

assert.equal((await filas()).length, LEADS.length, "arrancan todas las oportunidades");
assert.deepEqual(await chips(), [], "y sin ningún filtro puesto");

// ── 2. El embudo filtra por etapa ───────────────────────────────────────
//
// El primer escalón es el de la etapa con MENOR secuencia en Odoo, no el de más monto.
const primeraEtapa = escalones[0].etapa;
const enPrimeraEtapa = cuantasCon({ etapa: primeraEtapa });
await clicEnPunto(0, ".apexcharts-bar-area", 0);
await esperarFilas(enPrimeraEtapa);
assert.deepEqual(await chips(), ["Nuevo"], "el chip muestra la etapa traducida al español");
assert.equal(primeraEtapa, "New", "y el primer escalón es New, que es la secuencia 1");

// Volver a apretar la misma etapa la saca.
await clicEnPunto(0, ".apexcharts-bar-area", 0);
await esperarFilas(LEADS.length);
assert.deepEqual(await chips(), []);

// ── 3. Un mes de la tendencia filtra por creación ───────────────────────
//
// El primer mes de la serie es el más viejo. Se filtra por CREACIÓN, así que lo que tiene
// que quedar es lo creado en ese mes -- que no es lo mismo que lo que cerró ahí.
const primerMes = meses[0].mes;
await clicEnPunto(1, ".apexcharts-bar-area", 0);
await esperarFilas(cuantasCon(rangoDelMes(primerMes)));
assert.deepEqual(await chips(), [primerMes]);
await quitarPrimerFiltro();

// ── 4. La dona de estados ───────────────────────────────────────────────
await clicEnPunto(2, ".apexcharts-pie-area", 0);
await esperarFilas(cuantasCon({ estado: estados[0].filtro }));
assert.deepEqual(await chips(), [estados[0].etiqueta]);
await quitarPrimerFiltro();

// ── 5. El ranking de vendedores busca ese nombre ────────────────────────
//
// El gráfico 4 es "Por vendedor", ordenado por monto abierto. Ojo: el ranking se ordena
// por lo ABIERTO, pero el filtro trae TODO lo de esa persona —también sus cerradas—, que
// es lo que uno quiere al hacer clic en su barra.
const primerVendedor = vendedores[0].nombre;
await clicEnPunto(4, ".apexcharts-bar-area", 0);
await esperarFilas(cuantasCon({ vendedor: primerVendedor }));
assert.deepEqual(await chips(), [primerVendedor]);
await quitarPrimerFiltro();

// ── 6. Los avisos de datos son clickeables ──────────────────────────────
//
// La #4 no se movió desde junio: el aviso de estancadas tiene que estar y filtrarla.
const avisoEstancadas = pagina.locator("text=sin moverse de etapa hace más de un mes");
assert.ok(await avisoEstancadas.isVisible(), "el aviso de estancadas se ve arriba");
await avisoEstancadas.click();
await esperarFilas(cuantasCon({ estado: "estancadas" }));
assert.deepEqual(await filas(), ["Cuarta Ltda"], "la estancada es la que no se mueve desde hace 100 días");
// La pastilla se busca DENTRO de la fila y no con un `text=` global: "Estancada" también
// está en el <option> del desplegable de estados, que no es visible, y un selector de
// texto suelto encuentra ese primero y contesta que no se ve.
const pastillas = await pagina.evaluate(() =>
  [...(document.querySelector("tbody tr")?.querySelectorAll("span") ?? [])].map((s) => s.textContent ?? ""),
);
assert.ok(
  pastillas.includes("Estancada"),
  `la fila tiene que quedar marcada como estancada, no solo filtrada (tenía: ${pastillas.join(", ")})`,
);
await quitarPrimerFiltro();

// Y los avisos se calculan sobre TODO, no sobre lo filtrado: son la tarea pendiente del
// CRM completo. Filtrando por una etapa donde la estancada NO está, el aviso tiene que
// seguir ahí y con el mismo número — si desapareciera, esconder el problema sería tan
// fácil como escribir en el buscador.
await pagina.selectOption("select[aria-label='Etapa']", escalones[0].etapa);
await esperarFilas(cuantasCon({ etapa: escalones[0].etapa }));
assert.equal(
  await pagina.locator("text=sin moverse de etapa hace más de un mes").isVisible(),
  true,
  "el aviso de estancadas no puede desaparecer al filtrar: se calcula sobre todo el CRM",
);
await pagina.selectOption("select[aria-label='Etapa']", "");
await esperarFilas(LEADS.length);

// ── 7. Los gráficos siguen a los filtros de arriba ──────────────────────
//
// Si el gráfico se queda con todo el pipeline mientras la tabla muestra dos filas, la
// pantalla dice dos cosas distintas a la vez.
await pagina.fill("input[aria-label='Buscar oportunidades']", "Minera");
await esperarFilas(cuantasCon({ texto: "Minera" }));
await pagina
  .waitForFunction(
    () =>
      document.querySelectorAll(".apexcharts-canvas")[0].querySelectorAll(".apexcharts-yaxis-texts-g text").length === 1,
    null,
    { timeout: 5000 },
  )
  .catch(() => {});
const etapasALaVista = await pagina.evaluate(() =>
  [
    ...document.querySelectorAll(".apexcharts-canvas")[0].querySelectorAll(".apexcharts-yaxis-texts-g text tspan"),
  ].map((t) => t.textContent ?? ""),
);
assert.deepEqual(
  etapasALaVista,
  ["New"],
  `filtrando "Minera" el embudo se queda solo con New (decía: ${etapasALaVista.join(", ")})`,
);
await pagina.fill("input[aria-label='Buscar oportunidades']", "");
await esperarFilas(LEADS.length);

// ── 8. El resumen cuenta lo que se ve ───────────────────────────────────
assert.ok(await pagina.isVisible("text=Conversión"), "la conversión se muestra");
const resumen = await pagina.evaluate(() => document.body.textContent ?? "");
assert.ok(
  resumen.includes("50%"),
  "con una ganada y una perdida la conversión es 50%: es el número que resume la pantalla",
);

// Las animaciones duran ~300 ms; la captura a mitad de camino muestra barras a medio mover.
await pagina.waitForTimeout(900);
if (process.env.CAPTURA) await pagina.screenshot({ path: process.env.CAPTURA, fullPage: true });

assert.deepEqual(errores, [], `ningún error en toda la interacción: ${errores.join(" · ")}`);
await navegador.close();
console.log(
  "Los 6 gráficos de CRM se dibujan, el embudo, la tendencia, la dona y el ranking filtran la tabla, " +
    "los avisos de datos son clickeables y los gráficos siguen a los filtros.",
);
