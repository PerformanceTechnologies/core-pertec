/**
 * Los cinco gráficos de las tarjetas de Panel Odoo, después de pasarlos a ApexCharts.
 *
 * Correr con:  npm run probar-graficos-panel
 *
 * Es un cambio de biblioteca a props iguales: el riesgo no es que se vea distinto, es que
 * alguno de los cinco deje de dibujar o pierda una capacidad que ninguna otra prueba
 * cubre. Se montan los cinco con las MISMAS props con las que los llaman las tarjetas de
 * verdad —incluidas las combinaciones raras: `mostrarDetalle` con su lista de vehículos,
 * `mostrarLeyenda`, `formato="dinero"`, `expandido`— y se comprueba que cada uno pinte, y
 * que lo que se perdía al cambiar de biblioteca siga estando:
 *
 *  - el degradado bajo la línea de la tendencia (fue una decisión estética explícita);
 *  - el tooltip que lista CUÁLES vehículos hay en un grupo, no solo cuántos;
 *  - la fila de rótulos de la dona, que tiene que leerse sin pasar el mouse;
 *  - el total arriba de la barra apilada;
 *  - los nombres largos cortados con "…" en vez de partidos en dos líneas;
 *  - y los dos mensajes de vacío, que son la mitad de los casos en un panel recién
 *    sincronizado.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const carpeta = mkdtempSync(join(tmpdir(), "graficos-panel-"));

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

// Las props son las de las tarjetas reales: serie mensual de Facturas/Ventas/Compras,
// ingreso/gasto de Contabilidad, etapas del CRM, estados y documentación de Flota,
// categorías y fondos de Gastos.
writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import {
  GraficoAreaSimple,
  GraficoBarrasDobles,
  GraficoDona,
  GraficoBarrasRanking,
  GraficoBarraApilada,
} from "${process.cwd()}/components/panel-odoo/graficos";

const serie = [
  { mes: "2026-05", monto: 12000000 },
  { mes: "2026-06", monto: 18500000 },
  { mes: "2026-07", monto: 9000000 },
  { mes: "2026-08", monto: 42358564 },
];

const flota = [
  { estado: "Activo", cantidad: 4, detalle: ["Hino/XZU 617 DC (SZZJ79)", "Maxus/T60 4x4 DX (VPWF87)", "Maxus/T60 4x4 DX (VPWF97)", "Maxus/T60 GLX (TTWZ84)"] },
];

const documentacion = [
  { estado: "Vigente", cantidad: 12, detalle: ["Permiso de circulación SZZJ79", "SOAP VPWF87"] },
  { estado: "Vencida", cantidad: 1, detalle: ["Revisión técnica TTWZ84"] },
];

createRoot(document.getElementById("raiz")!).render(
  <div>
    <section id="area-chica"><GraficoAreaSimple datos={serie} /></section>
    <section id="area-grande"><GraficoAreaSimple datos={serie} expandido /></section>
    <section id="area-corta"><GraficoAreaSimple datos={[{ mes: "2026-08", monto: 1000 }]} /></section>
    <section id="dobles"><GraficoBarrasDobles datos={[{ mes: "2026-07", ingreso: 8000000, gasto: 5000000 }, { mes: "2026-08", ingreso: 12000000, gasto: 9000000 }]} expandido /></section>
    <section id="dona-crm"><GraficoDona datos={[{ etapa: "Nuevo", cantidad: 5 }, { etapa: "Propuesta", cantidad: 6 }, { etapa: "Propuesta 2", cantidad: 1 }]} /></section>
    <section id="dona-flota"><GraficoDona datos={documentacion} nameKey="estado" mostrarDetalle mostrarLeyenda /></section>
    <section id="dona-dinero"><GraficoDona datos={[{ categoria: "Alojamiento", monto: 250000 }, { categoria: "Traslados", monto: 90000 }]} dataKey="monto" nameKey="categoria" formato="dinero" expandido /></section>
    <section id="ranking"><GraficoBarrasRanking datos={flota} nameKey="estado" mostrarDetalle /></section>
    <section id="ranking-grande"><GraficoBarrasRanking datos={[{ etapa: "Un nombre larguísimo de bodega", cantidad: 9 }, { etapa: "Corta", cantidad: 3 }]} expandido /></section>
    <section id="apilada"><GraficoBarraApilada datos={[{ estado: "Aprobado", monto: 685896 }, { estado: "Rendido", monto: 314104 }]} dataKey="monto" nameKey="estado" formato="dinero" /></section>
    <section id="vacio"><GraficoDona datos={[]} /></section>
  </div>,
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
<body class="bg-crema text-tinta"><div id="raiz" style="max-width:420px"></div>
<script src="panel.js"></script></body></html>`,
);

const navegador = await chromium.launch({ headless: true });
const pagina = await navegador.newPage({ viewport: { width: 500, height: 3000 } });
const errores: string[] = [];
pagina.on("pageerror", (e) => errores.push(e.message));

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

// ── 1. Los diez gráficos con datos dibujan ──────────────────────────────
const CON_GRAFICO = [
  "area-chica",
  "area-grande",
  "dobles",
  "dona-crm",
  "dona-flota",
  "dona-dinero",
  "ranking",
  "ranking-grande",
  "apilada",
];
await pagina.waitForFunction(
  (ids) => ids.every((id) => document.querySelector(`#${id} .apexcharts-canvas svg`) !== null),
  CON_GRAFICO,
  { timeout: 20000 },
);
assert.deepEqual(errores, [], `ningún gráfico puede lanzar al montarse: ${errores.join(" · ")}`);

// Y ya no queda nada de Recharts en la página: es el objetivo del cambio.
assert.equal(
  await pagina.locator(".recharts-wrapper, .recharts-surface").count(),
  0,
  "las tarjetas de Panel Odoo ya no dibujan con Recharts",
);

/** Que un gráfico tenga píxeles pintados, no solo el <svg> vacío. */
const tienePixeles = (id: string) =>
  pagina.evaluate((selector) => {
    const svg = document.querySelector(`#${selector} .apexcharts-canvas svg`);
    if (!svg) return false;
    // Las series de Apex son <path> o <rect> con relleno o trazo de color.
    return (
      [...svg.querySelectorAll("path, rect")].filter((n) => {
        const relleno = n.getAttribute("fill") ?? "";
        const trazo = n.getAttribute("stroke") ?? "";
        return (relleno.startsWith("#") || relleno.startsWith("url") || trazo.startsWith("#")) && relleno !== "none";
      }).length > 0
    );
  }, id);

for (const id of CON_GRAFICO) {
  assert.ok(await tienePixeles(id), `#${id} dibujó un SVG vacío`);
}

// ── 2. Los mensajes de vacío ────────────────────────────────────────────
//
// La mitad de las tarjetas de un panel recién sincronizado no tiene datos, así que este
// camino se ve más que el otro.
assert.equal(
  (await pagina.locator("#vacio").textContent())?.trim(),
  "Sin datos suficientes todavía.",
  "sin datos se dice, no se deja un hueco",
);
assert.equal(
  (await pagina.locator("#area-corta").textContent())?.trim(),
  "Falta historial para ver la tendencia.",
  "con un solo punto una serie de área no dibuja nada: se dice en vez de mostrar un gráfico roto",
);
assert.equal(
  await pagina.locator("#area-corta .apexcharts-canvas").count(),
  0,
  "y no se monta el gráfico al aire",
);

// ── 2b. La tarjeta chica tiene que APROVECHAR sus 96 px ─────────────────
//
// Apex reserva ~35 px sobre el área de dibujo para el título y la barra de herramientas,
// que acá están apagados. Sin corregirlo, en una tarjeta de 96 px la serie quedaba con 27
// px de alto y la tendencia se veía casi plana: el gráfico "funcionaba" y no decía nada.
const espacio = await pagina.evaluate(() => {
  const caja = document.querySelector("#area-chica")!.getBoundingClientRect();
  const grilla = document.querySelector("#area-chica .apexcharts-grid")!.getBoundingClientRect();
  const serie = document.querySelector("#area-chica .apexcharts-area")!.getBoundingClientRect();
  const ejeX = document.querySelector("#area-chica .apexcharts-xaxis")!.getBoundingClientRect();
  return {
    alto: Math.round(caja.height),
    grilla: Math.round(grilla.height),
    serie: Math.round(serie.height),
    // Los rótulos de los meses tienen que seguir DENTRO de la tarjeta: el padding
    // negativo que gana ese espacio no puede empujarlos afuera.
    ejeAdentro: ejeX.bottom <= caja.bottom + 1,
  };
});
assert.ok(
  espacio.grilla >= espacio.alto * 0.6,
  `el área de dibujo de la tarjeta chica es ${espacio.grilla} px de ${espacio.alto}: se está desperdiciando el alto`,
);
assert.ok(
  espacio.serie >= 40,
  `la serie de 12M a 42M dibuja ${espacio.serie} px de amplitud: la tendencia se ve plana`,
);
assert.ok(espacio.ejeAdentro, "los meses tienen que quedar dentro de la tarjeta");

// Y los rótulos de los extremos tienen que entrar ENTEROS: sin eje Y que los corra, el
// del primer mes queda centrado en x=0 y se corta por la mitad ("6-05" por "2026-05").
const rotulosDelEje = await pagina.evaluate(() => {
  const caja = document.querySelector("#area-chica")!.getBoundingClientRect();
  return [...document.querySelectorAll("#area-chica .apexcharts-xaxis-texts-g text")].map((t) => {
    const r = t.getBoundingClientRect();
    return { texto: t.textContent ?? "", entero: r.left >= caja.left - 1 && r.right <= caja.right + 1 };
  });
});
assert.ok(rotulosDelEje.length >= 2, "el eje de meses se dibuja");
assert.deepEqual(
  rotulosDelEje.filter((r) => !r.entero).map((r) => r.texto),
  [],
  "ningún rótulo del eje puede quedar cortado por el borde de la tarjeta",
);

// ── 2c. La dona compacta tiene que llenar su tarjeta ────────────────────
//
// Con el padding negativo que necesitan los gráficos de eje, Apex dibujaba la dona del
// tamaño de una moneda en medio de un hueco de 96 px.
const dona = await pagina.evaluate(() => {
  const caja = document.querySelector("#dona-crm")!.getBoundingClientRect();
  // El grupo entero, no un solo arco: el bbox de una porción de tres es siempre chico.
  const rueda = document.querySelector("#dona-crm .apexcharts-pie")!.getBoundingClientRect();
  return { alto: Math.round(caja.height), diametro: Math.round(Math.max(rueda.width, rueda.height)) };
});
assert.ok(
  dona.diametro >= dona.alto * 0.8,
  `la dona mide ${dona.diametro} px en una tarjeta de ${dona.alto}: está dibujada como una moneda`,
);

// ── 3. El degradado de la tendencia ─────────────────────────────────────
//
// Fue una decisión estética explícita del área de tendencia; al cambiar de biblioteca es
// lo primero que se pierde sin que nadie lo note.
const conDegradado = await pagina.evaluate(() => {
  const svg = document.querySelector("#area-chica .apexcharts-canvas svg")!;
  const gradientes = svg.querySelectorAll("linearGradient").length;
  const rellenoDeSerie = svg.querySelector(".apexcharts-area")?.getAttribute("fill") ?? "";
  return { gradientes, usaGradiente: rellenoDeSerie.startsWith("url(") };
});
assert.ok(conDegradado.gradientes > 0 && conDegradado.usaGradiente, "el área tiene que seguir con su degradado");

// ── 4. El tooltip que lista CUÁLES, no solo cuántos ─────────────────────
//
// Es la capacidad menos obvia de los gráficos viejos y la más fácil de perder: en Flota
// lo útil es ver qué vehículos hay en el grupo.
await pagina.hover("#ranking .apexcharts-bar-area");
await pagina.waitForFunction(
  () => (document.querySelector("#ranking .apexcharts-tooltip")?.textContent ?? "").includes("SZZJ79"),
  null,
  { timeout: 5000 },
);
const tooltip = await pagina.locator("#ranking .apexcharts-tooltip").textContent();
assert.ok(tooltip?.includes("Activo (4)"), `el tooltip encabeza con el grupo y su total (decía: ${tooltip})`);
assert.ok(tooltip?.includes("Maxus/T60 4x4 DX (VPWF87)"), "y lista los vehículos del grupo");

// ── 5. La leyenda propia de la dona ─────────────────────────────────────
//
// Tiene que leerse SIN pasar el mouse: es el caso de "Vigente / Vencida" en Flota.
const leyenda = (await pagina.locator("#dona-flota").textContent()) ?? "";
assert.ok(leyenda.includes("Vigente (12)"), `la fila de rótulos se ve sola (decía: ${leyenda})`);
assert.ok(leyenda.includes("Vencida (1)"));

// La dona de dinero, expandida, muestra los montos formateados en su leyenda.
const enDinero = (await pagina.locator("#dona-dinero").textContent()) ?? "";
assert.ok(enDinero.includes("$250.000"), `formato="dinero" formatea con money() (decía: ${enDinero})`);

// ── 6. El total de la barra apilada ─────────────────────────────────────
const apilada = (await pagina.locator("#apilada").textContent()) ?? "";
assert.ok(apilada.startsWith("Total: $1.000.000"), `el total va arriba y sumado (decía: ${apilada})`);
assert.equal(
  await pagina.evaluate(() => document.querySelectorAll("#apilada .apexcharts-bar-area").length),
  2,
  "los dos estados se dibujan como una sola barra compuesta",
);

// ── 6b. Las barras horizontales no pueden ser lingotes ──────────────────
//
// Apex pide el grosor en porcentaje del espacio de cada fila, así que con una o dos filas
// las barras salían de 40 o 50 px de alto y el gráfico se veía como dos bloques. Recharts
// lo limitaba con `maxBarSize` en píxeles; grosorDeBarra hace la misma cuenta.
const grosores = await pagina.evaluate(() =>
  ["ranking", "ranking-grande", "apilada"].map((id) => ({
    id,
    alto: Math.round(document.querySelector(`#${id}`)!.getBoundingClientRect().height),
    barra: Math.round(
      Math.max(
        ...[...document.querySelectorAll(`#${id} .apexcharts-bar-area`)].map(
          (b) => b.getBoundingClientRect().height,
        ),
      ),
    ),
  })),
);
for (const g of grosores) {
  assert.ok(g.barra > 4, `#${g.id} dibujó una barra de ${g.barra} px: no se ve`);
  assert.ok(
    g.barra <= 42,
    `#${g.id} dibujó una barra de ${g.barra} px en una tarjeta de ${g.alto}: es un lingote, no una barra`,
  );
}

// ── 7. Los nombres largos se cortan, no se parten ───────────────────────
const rotulos = await pagina.evaluate(() =>
  [...document.querySelectorAll("#ranking-grande .apexcharts-yaxis-texts-g text")].map((t) => ({
    texto: t.textContent ?? "",
    lineas: t.querySelectorAll("tspan").length,
  })),
);
assert.ok(rotulos.length > 0, "el eje de categorías se dibuja");
assert.ok(
  rotulos.every((r) => r.lineas <= 1),
  "un nombre largo no puede partirse en dos líneas: descuadra la fila",
);
assert.ok(
  rotulos.some((r) => r.texto.endsWith("…")),
  `el nombre que no cabe se corta con "…" (había: ${rotulos.map((r) => r.texto).join(" / ")})`,
);

// ── 8. El tema oscuro los redibuja ──────────────────────────────────────
const colorDeEje = () =>
  pagina.evaluate(() => {
    const t = document.querySelector("#dobles .apexcharts-xaxis-texts-g text");
    return t ? getComputedStyle(t).fill : null;
  });
const claro = await colorDeEje();
await pagina.evaluate(() => {
  document.documentElement.setAttribute("data-theme", "dark");
  window.dispatchEvent(new Event("core-tema-cambio"));
});
await pagina.waitForFunction(
  (antes) => {
    const t = document.querySelector("#dobles .apexcharts-xaxis-texts-g text");
    return t !== null && getComputedStyle(t).fill !== antes;
  },
  claro,
  { timeout: 5000 },
);

await pagina.evaluate(() => {
  document.documentElement.removeAttribute("data-theme");
  window.dispatchEvent(new Event("core-tema-cambio"));
});
await pagina.waitForTimeout(900);
if (process.env.CAPTURA) await pagina.screenshot({ path: process.env.CAPTURA, fullPage: true });

assert.deepEqual(errores, [], `ningún error en toda la interacción: ${errores.join(" · ")}`);
await navegador.close();
console.log(
  `Los ${CON_GRAFICO.length} gráficos de las tarjetas dibujan con ApexCharts (nada de Recharts), con su degradado, ` +
    "el tooltip que lista cuáles, la leyenda legible sin mouse, el total de la apilada, los nombres cortados " +
    `y el redibujado al cambiar de tema (${claro} → oscuro).`,
);
