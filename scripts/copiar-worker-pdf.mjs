/**
 * Copia el worker de pdf.js a public/ antes de compilar.
 *
 * react-pdf (pdfjs-dist) hace el trabajo pesado en un Web Worker y necesita el archivo
 * servido por HTTP, no empaquetado como un módulo más: `pdfjs.GlobalWorkerOptions.workerSrc`
 * es una URL. Se copia en cada build en vez de dejar el archivo comiteado para que no pueda
 * quedar desincronizado de la versión de pdfjs-dist que hay en node_modules — un worker de
 * otra versión falla con "The API version does not match the Worker version", y eso se ve
 * como un visor en blanco, sin ningún error visible.
 *
 * Corre desde el script `build` y `dev` de package.json. El archivo copiado está en
 * .gitignore.
 */

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const raiz = dirname(require.resolve("pdfjs-dist/package.json"));
const version = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).version;

const destino = join(process.cwd(), "public", "pdfjs");
mkdirSync(destino, { recursive: true });
copyFileSync(join(raiz, "build", "pdf.worker.min.mjs"), join(destino, "pdf.worker.min.mjs"));

console.log(`[pdfjs] worker ${version} copiado a public/pdfjs/`);
