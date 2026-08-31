/**
 * Que la barra lateral no se descuadre al llegar al fondo de una página.
 *
 * Correr con:  npm run probar-navegacion
 *
 * El defecto que motivó esto: bajando hasta el final de Mi Día, la barra se soltaba
 * y subía un centenar de píxeles —el logo cortado arriba, un hueco abajo—. La causa
 * no está en la barra: era `position: sticky`, y un elemento sticky está atado a la
 * altura de su CONTENEDOR. El contenedor no cuenta a los elementos posicionados en
 * absoluto que sobresalen por abajo (los popover de Mi Día, que están siempre en el
 * DOM aunque se vean con opacidad 0), así que el documento scrollea más de lo que
 * mide el contenedor y, al llegar al fondo, la barra se suelta exactamente esos
 * píxeles.
 *
 * Por eso la prueba arma una página con ese popover al final: es la condición que lo
 * dispara. Con la barra FIJA a la ventana, el contenido de la página deja de
 * importar.
 *
 * Usa las clases REALES —importa BARRA_FIJA y HUECO_DE_BARRA de lib/estilos.ts y
 * compila el CSS del proyecto con Tailwind— así que si alguien vuelve a poner la
 * barra en el flujo, esto falla en vez de quedar como una prueba de una copia.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { BARRA_FIJA, HUECO_DE_BARRA } from "../lib/estilos";

const VENTANA = { width: 1476, height: 960 };
/** Lo que sobresale por abajo, como el popover de una fila al final de la página. */
const ALTO_POPOVER = 140;

const carpeta = mkdtempSync(join(tmpdir(), "navegacion-"));
// El CSS del proyecto, compilado con el Tailwind del proyecto: las utilidades de las
// constantes tienen que existir de verdad.
execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", join(carpeta, "estilos.css")], {
  stdio: "pipe",
});

const pagina = `<!doctype html><html class="h-full"><head><meta charset="utf-8">
<link rel="stylesheet" href="estilos.css"></head>
<body class="min-h-full flex flex-col bg-crema text-tinta">
  <div class="min-h-screen">
    <aside id="barra" class="${BARRA_FIJA} border-r border-borde bg-crema translate-x-0">
      <div class="flex h-full flex-col">
        <div id="logo" class="px-5 py-5">logo</div>
        <nav class="flex-1 overflow-y-auto px-3">nav</nav>
        <div id="pie" class="border-t border-borde px-3 py-4">pie</div>
      </div>
    </aside>
    <main class="min-w-0 py-8 ${HUECO_DE_BARRA}">
      <div id="contenido" style="height:2600px">contenido alto</div>
      <div class="group relative">
        <span>una fila con detalle</span>
        <div class="pointer-events-none absolute top-full z-30 w-64 rounded-lg border border-borde bg-superficie p-3 opacity-0"
             style="height:${ALTO_POPOVER}px">el popover que sobresale</div>
      </div>
    </main>
  </div>
</body></html>`;
writeFileSync(join(carpeta, "pagina.html"), pagina);

const navegador = await chromium.launch({ headless: true });
try {
  const p = await navegador.newPage({ viewport: VENTANA });
  await p.goto(`file://${join(carpeta, "pagina.html")}`);

  const medir = () =>
    p.evaluate(() => {
      const barra = document.getElementById("barra")!.getBoundingClientRect();
      const contenido = document.getElementById("contenido")!.getBoundingClientRect();
      return {
        barra: { top: Math.round(barra.top), bottom: Math.round(barra.bottom), ancho: Math.round(barra.width) },
        contenidoIzquierda: Math.round(contenido.left),
        ventana: window.innerHeight,
        documento: document.documentElement.scrollHeight,
        alturaContenedor: Math.round(document.querySelector("div.min-h-screen")!.getBoundingClientRect().height),
      };
    });

  // ── 1. Arriba: la barra ocupa toda la ventana y no tapa el contenido ──────
  const arriba = await medir();
  console.log("arriba:", arriba);
  assert.equal(arriba.barra.top, 0, "la barra arranca pegada arriba");
  assert.equal(arriba.barra.bottom, VENTANA.height, "y llega hasta abajo de la ventana");
  // No alcanza con que no se pise: el botón de colapsar sobresale 12 px de la barra,
  // así que sin aire de por medio cae encima del título de la página. Pasó, con el
  // contenido pegado al borde: `px-10` y `pl-[…]` competían por el mismo padding y
  // ganó el segundo, dejando el hueco en cero.
  const AIRE_MINIMO = 24;
  assert.ok(
    arriba.contenidoIzquierda >= arriba.barra.ancho + AIRE_MINIMO,
    `el contenido tiene que empezar al menos ${AIRE_MINIMO} px después de la barra: empieza en ` +
      `${arriba.contenidoIzquierda} y la barra termina en ${arriba.barra.ancho}`,
  );

  // El documento SÍ es más alto que el contenedor: es la condición del defecto, y si
  // dejara de cumplirse la prueba estaría pasando por el motivo equivocado.
  assert.ok(
    arriba.documento > arriba.alturaContenedor,
    `el popover tiene que hacer que el documento (${arriba.documento}) pase al contenedor (${arriba.alturaContenedor}): sin eso esta prueba no prueba nada`,
  );

  // ── 2. Al fondo: sigue exactamente igual ─────────────────────────────────
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(150);
  const abajo = await medir();
  console.log("al fondo:", abajo);
  assert.equal(
    abajo.barra.top,
    0,
    `la barra se soltó ${-abajo.barra.top} px al llegar al fondo: con eso el logo se corta arriba y queda un hueco abajo`,
  );
  assert.equal(abajo.barra.bottom, VENTANA.height, "y su pie sigue al ras de la ventana");

  // El pie de la barra —buscador, tema, usuario— es lo que se veía descuadrado.
  const pie = await p.evaluate(() => {
    const caja = document.getElementById("pie")!.getBoundingClientRect();
    return { bottom: Math.round(caja.bottom) };
  });
  assert.ok(
    Math.abs(pie.bottom - VENTANA.height) <= 1,
    `el pie de la barra tiene que quedar al ras de la ventana (quedó a ${VENTANA.height - pie.bottom} px)`,
  );

  // ── 3. Colapsada: el hueco acompaña ──────────────────────────────────────
  //
  // La barra publica su ancho en --ancho-barra y el contenido lo lee. Si se
  // desincronizan, el contenido queda debajo de la barra o con un hueco de más.
  await p.evaluate(() => document.documentElement.style.setProperty("--ancho-barra", "76px"));
  await p.evaluate(() => document.getElementById("barra")!.style.setProperty("width", "76px"));
  // Más que la transición de ancho de la barra (200 ms): medir en el medio da un
  // ancho a mitad de camino, que fue justo lo que pasó al escribir esta prueba.
  await p.waitForTimeout(450);
  const colapsada = await medir();
  console.log("colapsada:", colapsada);
  assert.equal(colapsada.barra.ancho, 76);
  assert.ok(
    colapsada.contenidoIzquierda >= colapsada.barra.ancho + AIRE_MINIMO,
    "colapsada, el contenido tampoco puede quedar pegado a la barra",
  );
  assert.ok(
    colapsada.contenidoIzquierda < arriba.contenidoIzquierda,
    "y el contenido tiene que aprovechar el espacio que la barra dejó libre",
  );

  console.log("\nLa barra lateral queda fija en su lugar, con la página al fondo y colapsada.");
} finally {
  await navegador.close();
}
