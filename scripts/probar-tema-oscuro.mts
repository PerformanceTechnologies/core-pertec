/**
 * Que el modo oscuro no se rompa por un color que no sigue al tema.
 *
 * Correr con:  npm run probar-tema
 *
 * La paleta del core son variables CSS que se invierten con el tema (crema, tinta,
 * superficie, borde…), así que todo lo que use esos tokens funciona en los dos modos
 * sin hacer nada. El problema son los colores que NO son de la paleta:
 *
 *  - `bg-white`, que es blanco fijo y en oscuro es un parche encendido.
 *  - `bg-tinta` con texto claro encima: al invertirse, tinta pasa a ser casi blanco
 *    y el texto blanco arriba queda ilegible.
 *  - La escala de Tailwind (`bg-red-50`, `border-red-200`, `text-red-700`): pensada
 *    para fondo claro. En oscuro, la caja es un rosa encendido y el texto queda por
 *    debajo del contraste mínimo.
 *
 * Para todos esos hay una regla `[data-theme="dark"]` en globals.css que los retiñe
 * de una vez, sin tocar cada componente. Esta prueba comprueba que no aparezca un
 * uso nuevo SIN su regla: es exactamente el error que se reportó —placas blancas y
 * bordes raros en oscuro— y no se ve escribiendo la clase, se ve cambiando el tema.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const raiz = new URL("../", import.meta.url);
const css = readFileSync(new URL("app/globals.css", raiz), "utf8");

/** Todos los .tsx de la interfaz. */
function archivosDeInterfaz(): string[] {
  const salida: string[] = [];
  for (const carpeta of ["components", "app"]) {
    const entradas = readdirSync(new URL(carpeta, raiz), { recursive: true, withFileTypes: true });
    for (const entrada of entradas) {
      if (entrada.isFile() && entrada.name.endsWith(".tsx")) {
        salida.push(`${entrada.parentPath}/${entrada.name}`);
      }
    }
  }
  return salida;
}

/**
 * Las clases que no siguen al tema y por lo tanto necesitan su regla.
 *
 * No es toda la escala de Tailwind, son los tonos que dependen de que el fondo sea
 * claro:
 *
 *  - Fondos y líneas CLAROS (50–200, y 300 en bordes): en oscuro son parches y rayas
 *    encendidas.
 *  - Texto OSCURO (600–900): en oscuro queda por debajo del contraste mínimo.
 *
 * Lo que queda afuera está bien en los dos temas y por eso no se pide regla: un fondo
 * saturado (`bg-red-600` de un botón de borrar, con texto blanco encima) se lee igual
 * sobre claro que sobre oscuro, y un texto claro (50–500) se usa justamente sobre
 * esos fondos. También se ignora todo lo que lleve barra de opacidad
 * (`bg-red-600/10`): un tinte del 10% se comporta bien contra cualquier fondo.
 */
const FAMILIAS =
  "red|amber|yellow|green|emerald|teal|blue|sky|indigo|purple|pink|rose|slate|gray|zinc|neutral|stone";
const SOSPECHOSAS = new RegExp(
  [
    "\\bbg-white\\b(?!\\/)",
    "\\bbg-tinta\\b(?!\\/)",
    `\\b(?:bg|ring)-(?:${FAMILIAS})-(?:50|100|200)\\b(?!\\/)`,
    `\\b(?:border|divide)-(?:${FAMILIAS})-(?:50|100|200|300)\\b(?!\\/)`,
    `\\btext-(?:${FAMILIAS})-(?:600|700|800|900)\\b(?!\\/)`,
  ].join("|"),
  "g",
);

const encontradas = new Map<string, string>();
for (const archivo of archivosDeInterfaz()) {
  const fuente = readFileSync(archivo, "utf8");
  for (const [clase] of fuente.matchAll(SOSPECHOSAS)) {
    if (!encontradas.has(clase)) encontradas.set(clase, archivo.slice(archivo.indexOf("/components")).replace(/^\//, "") || archivo);
  }
}

assert.ok(encontradas.size > 0, "la búsqueda no encontró ninguna clase: el patrón se rompió");

// `divide-x-100` se aplica a los hijos, así que su regla lleva el selector de hijo;
// el resto se retiñe directo. Se busca la clase escapada como la escribe el CSS.
const sinRegla: string[] = [];
for (const [clase, donde] of encontradas) {
  // El nombre tiene que terminar ahí: buscar la cadena suelta daba por buena una
  // regla para `.bg-red-50X` cuando faltaba la de `.bg-red-50` —el primer intento de
  // esta prueba tenía justo ese error y por eso no avisaba nada—.
  const regla = new RegExp(`\\[data-theme="dark"\\][^{}]*\\.${clase}(?![\\w-])`);
  if (!regla.test(css)) sinRegla.push(`${clase}  (${donde})`);
}

assert.deepEqual(
  sinRegla,
  [],
  "Estas clases no siguen al tema y no tienen su regla en globals.css, así que en modo " +
    "oscuro van a verse como una placa clara o con texto ilegible:\n  " +
    sinRegla.join("\n  ") +
    "\n\nO se les agrega una regla [data-theme=\"dark\"] en globals.css, o se usa un token " +
    "de la paleta (bg-superficie, bg-crema, text-tinta…), que ya se invierte solo.",
);

console.log(`${encontradas.size} clases fuera de la paleta, todas con su regla de modo oscuro.`);
console.log("Todas las verificaciones pasaron.");
