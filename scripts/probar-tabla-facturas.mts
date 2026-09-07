/**
 * Que las filas de la tabla de facturas tengan todas la misma altura.
 *
 * Correr con:  npm run probar-tabla
 *
 * El defecto: la pastilla de estado decía "Reclamada/rechazada", partía en dos líneas y
 * estiraba SOLO las filas reclamadas. La tabla quedaba con filas de dos alturas, y la
 * columna ensanchada apretaba a las vecinas hasta cortar el RUT con el dígito
 * verificador solo en la segunda línea.
 *
 * Se mide en un navegador con el CSS del proyecto compilado por su propio Tailwind, y con
 * las clases REALES importadas de lib/estilos.ts: si alguien vuelve a poner una etiqueta
 * de dos palabras, o le saca el nowrap, esto falla en vez de quedar como la prueba de una
 * copia. Lo que no se puede medir así es el JSX del componente, así que la estructura de
 * la tabla se replica acá y las etiquetas se leen del componente de verdad.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { CELDA_SIN_CORTE, PASTILLA_ESTADO } from "../lib/estilos";

const carpeta = mkdtempSync(join(tmpdir(), "tabla-facturas-"));
execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", join(carpeta, "estilos.css")], {
  stdio: "pipe",
});

// Las etiquetas del componente de verdad: si mañana alguien vuelve a alargar una, la
// prueba la mide igual. Se leen del fuente porque el componente es de cliente y no se
// puede importar desde un script de Node sin montar React.
const panel = readFileSync(new URL("../components/finanzas/PanelFinanzas.tsx", import.meta.url), "utf8");
const bloque = panel.slice(
  panel.indexOf("const ETIQUETAS_ESTADO"),
  panel.indexOf("const TITULO_ESTADO"),
);
const etiquetas = [...bloque.matchAll(/^\s{2}\w+: "([^"]+)"/gm)].map((m) => m[1]);
assert.ok(etiquetas.length >= 5, `se esperaban las 5 etiquetas de estado, hay ${etiquetas.length}`);

// El RUT más largo que existe: nueve caracteres con guion y dígito verificador K. Es el
// que se cortaba.
const RUT = "77590822-K";

const fila = (etiqueta: string, i: string) => `
  <tr id="fila-${i}" class="border-b border-borde">
    <td class="px-4 py-3"><span class="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase bg-teal/10 text-teal">venta</span></td>
    <td class="px-4 py-3 text-tinta/60">Factura</td>
    <td class="px-4 py-3 ${CELDA_SIN_CORTE} text-tinta/60"><span id="rut-${i}">${RUT}</span></td>
    <td class="px-4 py-3 font-medium text-tinta">EMPRESA DE MANTENCIONES Y SERVICIOS SALFA S.A.</td>
    <td class="px-4 py-3 ${CELDA_SIN_CORTE} text-tinta/60">198</td>
    <td class="px-4 py-3 ${CELDA_SIN_CORTE} text-tinta/60">12-08-2026</td>
    <td class="px-4 py-3 ${CELDA_SIN_CORTE} text-right text-tinta">$42.358.564</td>
    <!-- El color no importa acá —todas van con el del reclamo— porque lo que se mide es
         el largo del texto y el ancho que ocupa. El color de cada estado lo pone
         CLASES_ESTADO en el componente. -->
    <td class="px-4 py-3"><span id="pastilla-${i}" class="${PASTILLA_ESTADO} bg-red-500/10 text-red-600">${etiqueta}</span></td>
  </tr>`;

// El ancho mínimo que la tabla declara, leído del componente: por debajo de eso el panel
// scrollea en horizontal a propósito, así que el defecto no es el scroll —es que el
// CONTENIDO no quepa en ese mínimo, porque entonces las columnas se aprietan entre sí y
// ahí es donde el RUT se partía en dos líneas.
// La del <table>, no la del buscador —que también tiene un min-w y estaba primero—.
const minimo = /<table[^>]*min-w-\[(\d+)px\]/.exec(panel);
assert.ok(minimo, "no se encontró el min-w de la tabla en el componente");
const MIN_DECLARADO = Number(minimo[1]);

// Dos anchos: el de la pantalla donde se vio el defecto (ventana de 1476 menos la barra
// de 16rem y el aire del contenido) y uno estrecho, para medir cuánto mide la tabla
// cuando ya no le sobra nada.
const ANCHOS = [1476 - 256 - 80, 400];

const pagina = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="estilos.css"></head>
<body class="bg-crema text-tinta">
  ${ANCHOS.map(
    (ancho, n) => `<div id="caja-${n}" class="overflow-x-auto" style="width:${ancho}px">
    <table id="tabla-${n}" class="w-full min-w-[${MIN_DECLARADO}px] text-left text-sm"><tbody>
      ${etiquetas.map((e, i) => fila(e, `${n}-${i}`)).join("")}
    </tbody></table>
  </div>`,
  ).join("")}
</body></html>`;
writeFileSync(join(carpeta, "index.html"), pagina);

const navegador = await chromium.launch({ headless: true });
const page = await navegador.newPage({ viewport: { width: 1476, height: 960 } });
await page.goto(`file://${join(carpeta, "index.html")}`);

// Sin funciones declaradas adentro: tsx las compila agregándoles un __name que no existe
// en la página, y page.evaluate revienta con "__name is not defined".
const medidas = await page.evaluate(
  (ids: string[]) =>
    ids.map((id) => ({
      id,
      alto: document.getElementById(`fila-${id}`)!.getBoundingClientRect().height,
      // getClientRects() devuelve un rectángulo por línea: dos significa que el texto se
      // partió, que es exactamente el defecto.
      lineasPastilla: document.getElementById(`pastilla-${id}`)!.getClientRects().length,
      lineasRut: document.getElementById(`rut-${id}`)!.getClientRects().length,
      texto: document.getElementById(`pastilla-${id}`)!.textContent ?? "",
    })),
  ANCHOS.flatMap((_, n) => etiquetas.map((_e, i) => `${n}-${i}`)),
);

// Cuánto mide la tabla cuando ya no le sobra ancho. Si eso supera el min-w que declara,
// el mínimo es una promesa que no se cumple: las columnas se aprietan entre sí incluso en
// una pantalla grande, y ahí es donde el RUT se partió con el dígito verificador abajo.
const intrinseco = await page.evaluate(() => document.getElementById("tabla-1")!.scrollWidth);
assert.ok(
  intrinseco <= MIN_DECLARADO,
  `la tabla necesita ${intrinseco} px y declara un mínimo de ${MIN_DECLARADO}: no cabe en ` +
    "su propio mínimo, así que las columnas se aprietan entre sí. Una etiqueta de estado " +
    "larga no parte la fila —el nowrap lo evita— pero se come el ancho de las vecinas",
);

console.log(medidas);

for (const m of medidas) {
  assert.equal(
    m.lineasPastilla,
    1,
    `la pastilla "${m.texto}" ocupa ${m.lineasPastilla} líneas (tabla ${m.id}): una etiqueta ` +
      "de estado tiene que entrar en una línea, y lo que haya que explicar va en su title",
  );
  assert.equal(
    m.lineasRut,
    1,
    `el RUT se partió en ${m.lineasRut} líneas en la fila "${m.texto}" (tabla ${m.id})`,
  );
}

// Dentro de una misma tabla, todas las filas del mismo alto: es lo que se veía mal, una
// fila más alta que las otras porque su estado no entraba en una línea.
//
// Con un píxel de tolerancia y no exactamente iguales, porque el layout de tabla reparte
// los bordes con medio píxel de diferencia en la primera fila (45,20 contra 45,70) y eso
// no se ve. Lo que se ve es una línea de texto de más: son catorce.
for (const [n, ancho] of ANCHOS.entries()) {
  const altos = medidas.filter((m) => m.id.startsWith(`${n}-`)).map((m) => m.alto);
  const desvio = Math.max(...altos) - Math.min(...altos);
  assert.ok(
    desvio <= 1,
    `a ${ancho} px de ancho hay ${Math.round(desvio)} px de diferencia entre la fila más ` +
      "alta y la más baja: la tabla se ve descuadrada, y la culpable es la fila cuyo " +
      "estado no entra en una línea",
  );
}

// Una captura para mirar el resultado con ojos, no solo con números. Es donde se vio que
// la pastilla partía en dos: los números lo confirman, pero el defecto se reportó mirando.
if (process.env.CAPTURA) await page.screenshot({ path: process.env.CAPTURA, fullPage: true });

await navegador.close();
console.log(
  `Las ${etiquetas.length} filas miden lo mismo en los dos anchos, nada se parte en dos, y ` +
    `la tabla entra en su mínimo (${intrinseco} de ${MIN_DECLARADO} px).`,
);
