/**
 * Que el bundle recortado alcance: un Chromium de verdad, con SOLO los archivos que
 * next.config.ts manda a la función serverless.
 *
 * Correr con:  npm run probar-bundle
 *
 * Por qué existe. El include de playwright-core traía la carpeta entera (12 MB) y el de
 * pdf-parse también (33 MB, con cuatro copias de pdf.js). En Vercel el peso de las
 * funciones de CADA deployment guardado se suma contra la cuota de Function Storage, y
 * con los 10 GB del plan gratis llenos no se puede desplegar más. Recortar es la
 * solución, pero recortar de menos no se nota nunca y recortar de más se nota SOLO EN
 * PRODUCCIÓN, con un "Cannot find module .../browsers.json" al primer uso — ya pasó, y
 * con la ruta de emitir tardó una tarde en encontrarse.
 *
 * Así que acá se hace de verdad lo que hace Vercel: se copia a una carpeta vacía
 * únicamente lo que dicen los patrones del config, y desde ESA copia se lanza un
 * Chromium, se imprime un PDF y se lee ese PDF con la copia recortada de pdf-parse. Si
 * falta un archivo que se carga dinámicamente, esto falla acá y no en producción.
 *
 * Los patrones se leen del propio next.config.ts: si alguien recorta más, esta prueba
 * mide el recorte nuevo, no una copia de los patrones de hoy.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chromium as chromiumCompleto } from "playwright";

const raiz = new URL("../", import.meta.url).pathname;
const config = readFileSync(join(raiz, "next.config.ts"), "utf8");

/** Los patrones de una constante del config: NAVEGADOR o LECTOR_DE_PDF. */
function patronesDe(constante: string): string[] {
  const desde = config.indexOf(`const ${constante} = [`);
  assert.notEqual(desde, -1, `next.config.ts ya no tiene ${constante}`);
  const hasta = config.indexOf("];", desde);
  const bloque = config.slice(desde, hasta);
  const version = /VERSION_PDFJS = "([^"]+)"/.exec(config)?.[1] ?? "";
  return [...bloque.matchAll(/["`]\.\/([^"`]+)["`]/g)].map((m) =>
    m[1].replace("${VERSION_PDFJS}", version),
  );
}

const carpeta = mkdtempSync(join(tmpdir(), "bundle-navegador-"));

/**
 * Copia a la carpeta de prueba lo que hace match, y devuelve cuánto pesa.
 *
 * Los patrones son de dos formas: `dir/**\/*` (la carpeta entera) o un glob de archivos
 * en un nivel (`lib/*.js`). No hace falta un motor de globs completo — hace falta que lo
 * que se copie sea exactamente lo que copiaría Vercel.
 */
function copiar(patrones: string[]): number {
  let bytes = 0;
  const traer = (relativo: string) => {
    const origen = join(raiz, relativo);
    if (!existsSync(origen)) return;
    const destino = join(carpeta, relativo);
    mkdirSync(dirname(destino), { recursive: true });
    cpSync(origen, destino, { recursive: true });
    const medir = (p: string): number => {
      const s = statSync(p);
      if (!s.isDirectory()) return s.size;
      return readdirTotal(p);
    };
    bytes += medir(origen);
  };
  for (const patron of patrones) {
    if (patron.endsWith("/**/*")) {
      traer(patron.slice(0, -"/**/*".length));
    } else if (patron.includes("*")) {
      // Un nivel: `lib/*.js`
      const carpetaDelPatron = patron.slice(0, patron.lastIndexOf("/"));
      const extension = patron.slice(patron.lastIndexOf("*") + 1);
      const dir = join(raiz, carpetaDelPatron);
      if (!existsSync(dir)) continue;
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        if (entrada.isFile() && entrada.name.endsWith(extension)) {
          traer(`${carpetaDelPatron}/${entrada.name}`);
        }
      }
    } else {
      traer(patron);
    }
  }
  return bytes;
}

function readdirTotal(dir: string): number {
  let total = 0;
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entrada.name);
    total += entrada.isDirectory() ? readdirTotal(p) : statSync(p).size;
  }
  return total;
}

import { readdirSync } from "node:fs";

const pesoNavegador = copiar(patronesDe("NAVEGADOR"));
const pesoLector = copiar(patronesDe("LECTOR_DE_PDF"));

// Lo que el file tracing de Vercel resuelve SOLO, porque son `require` normales: las
// dependencias de pdf-parse. No están en el include —no hace falta— pero sin ellas esta
// copia no es la que Vercel arma, y la prueba fallaría por un motivo que en producción no
// existe.
copiar(["node_modules/node-ensure/**/*", "node_modules/pdf-parse/node_modules/**/*"]);

// Los .d.ts y el visor de traces NO pueden haber viajado: son los 5,5 MB del recorte.
assert.ok(
  !existsSync(join(carpeta, "node_modules/playwright-core/types")),
  "los .d.ts de playwright volvieron al bundle",
);
assert.ok(
  !existsSync(join(carpeta, "node_modules/playwright-core/lib/vite")),
  "el visor de traces de playwright volvió al bundle",
);
// Y de pdf-parse tiene que haber viajado UNA sola copia de pdf.js, no cuatro.
const versiones = readdirSync(join(carpeta, "node_modules/pdf-parse/lib/pdf.js"));
assert.deepEqual(versiones.length, 1, `viajaron ${versiones.length} copias de pdf.js: ${versiones.join(", ")}`);

// ── El Chromium levanta desde la copia recortada ─────────────────────────
//
// El binario del navegador no viaja en el bundle (en Vercel lo baja
// @sparticuz/chromium-min en runtime), así que se le pasa el de este equipo: lo que se
// mide es playwright-core, no el navegador.
const pedir = createRequire(join(carpeta, "node_modules/playwright-core/index.js"));
const playwrightRecortado = pedir(join(carpeta, "node_modules/playwright-core/index.js"));

const navegador = await playwrightRecortado.chromium.launch({
  headless: true,
  executablePath: chromiumCompleto.executablePath(),
});
const pagina = await navegador.newPage();
await pagina.setContent(
  "<h1>Oferta técnica de prueba</h1><p>El bundle recortado imprime igual.</p>",
);
const pdf = await pagina.pdf({ format: "A4", printBackground: true });
await navegador.close();

assert.ok(pdf.length > 1000, `el PDF salió vacío (${pdf.length} bytes)`);
assert.equal(pdf.subarray(0, 4).toString(), "%PDF", "lo que salió no es un PDF");

// ── Y pdf-parse lee ese PDF desde su copia recortada ─────────────────────
const pedirPdf = createRequire(join(carpeta, "node_modules/pdf-parse/index.js"));
const pdfParse = pedirPdf(join(carpeta, "node_modules/pdf-parse/index.js"));
const leido = await pdfParse(pdf);
assert.match(
  leido.text,
  /Oferta técnica de prueba/,
  `pdf-parse no pudo leer el PDF con su copia recortada (texto: ${leido.text.slice(0, 80)})`,
);

console.log(
  `Con SOLO los archivos del include —playwright ${(pesoNavegador / 1e6).toFixed(1)} MB y ` +
    `pdf-parse ${(pesoLector / 1e6).toFixed(1)} MB— el Chromium levanta, imprime un PDF de ` +
    `${(pdf.length / 1024).toFixed(0)} KB y pdf-parse lo vuelve a leer.`,
);
