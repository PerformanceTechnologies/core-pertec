import type { NextConfig } from "next";

/**
 * El visor de traces de playwright, que el tracing trae por su cuenta.
 *
 * Son 3,7 MB de interfaz web —la que abre `playwright show-trace`— que algo de lib/server
 * requiere, asi que sacarlo del include de abajo no alcanza. Aca el exclude SI funciona,
 * porque ningun include lo vuelve a meter.
 */
const SIN_VISOR_DE_TRACES = ["./node_modules/playwright-core/lib/vite/**/*"];

/**
 * La version de pdf.js que usa pdf-parse por dentro.
 *
 * pdf-parse trae CUATRO copias de pdf.js (v1.9.426, v1.10.88, v1.10.100 y v2.0.550, 29 MB
 * en total) y carga una sola, por require dinamico:
 * `require("./pdf.js/" + options.version + "/build/pdf.js")`. Nadie en el proyecto le pasa
 * `version`, asi que usa su DEFAULT_OPTIONS -- esta. Traer las otras tres es peso muerto.
 *
 * Si pdf-parse cambia su version por omision, esto queda apuntando a una carpeta que no
 * es la que carga: scripts/probar-ofertas.mts lee DEFAULT_OPTIONS del propio pdf-parse y
 * lo compara con este valor, asi que el build avisa en vez de romperse en runtime.
 */
export const VERSION_PDFJS = "v1.10.100";

/** Lo que necesita en runtime una funcion que lee PDFs (ver VERSION_PDFJS). */
const LECTOR_DE_PDF = [
  "./node_modules/pdf-parse/index.js",
  "./node_modules/pdf-parse/package.json",
  "./node_modules/pdf-parse/lib/pdf-parse.js",
  `./node_modules/pdf-parse/lib/pdf.js/${VERSION_PDFJS}/build/pdf.js`,
  `./node_modules/pdf-parse/lib/pdf.js/${VERSION_PDFJS}/build/pdf.worker.js`,
];


/**
 * Lo que necesita en runtime una funcion que lanza Chromium.
 *
 * Se enumera en vez de traer `playwright-core/**` completo, y por peso: en Vercel el
 * tamano de las funciones de CADA deployment guardado se suma contra la cuota de
 * Function Storage (10 GB en el plan gratis), y esto viaja en las 6 rutas que imprimen o
 * scrapean. Quedan afuera, a proposito:
 *
 *  - `types/`: 1,8 MB de .d.ts. TypeScript no existe en runtime.
 *  - `lib/vite/`: 3,7 MB del visor de traces y del recorder -- la interfaz web que abre
 *    `playwright show-trace`. Nada de eso corre al imprimir un PDF headless.
 *
 * 5,5 MB menos por funcion, ~33 MB menos por deployment.
 *
 * Lo demas se enumera carpeta por carpeta y NO se recorta mas fino: los archivos que
 * playwright carga dinamicamente no se pueden adivinar leyendo imports (browsers.json fue
 * uno, y el sintoma en Vercel es "Cannot find module" recien en runtime). Si manana
 * playwright agrega una carpeta de lib, hay que agregarla aca: scripts/probar-ofertas.mts
 * comprueba que ninguna ruta con navegador se quede sin su entrada, y
 * scripts/probar-bundle-navegador.mts que con SOLO estos archivos un Chromium levanta y
 * imprime.
 *
 * `outputFileTracingExcludes` no sirve para esto: el include se aplica DESPUES, asi que
 * volvia a meter las dos carpetas. Un patron negado (`!.../vite/**`) tampoco: se ignora.
 */
const NAVEGADOR = [
  "./node_modules/playwright-core/*.js",
  "./node_modules/playwright-core/*.mjs",
  "./node_modules/playwright-core/*.json",
  "./node_modules/playwright-core/bin/**/*",
  "./node_modules/playwright-core/lib/*.js",
  "./node_modules/playwright-core/lib/*.LICENSE",
  "./node_modules/playwright-core/lib/entry/**/*",
  "./node_modules/playwright-core/lib/server/**/*",
  "./node_modules/playwright-core/lib/tools/**/*",
  "./node_modules/playwright-core/lib/xdg-open/**/*",
  "./node_modules/@sparticuz/chromium-min/**/*",
];

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs-dist) necesita resolver su propio pdf.worker.mjs vía
  // require/import normal de Node en tiempo de ejecucion -- si Turbopack/
  // webpack lo empaqueta como cualquier otro modulo, ese archivo deja de
  // existir como tal y falla con "Setting up fake worker failed".
  serverExternalPackages: ["pdf-parse"],
  // playwright-core carga browsers.json y otros archivos internos de forma
  // dinamica, y el file tracing de Vercel no los detecta solo — sin esto la
  // funcion serverless del cron falla en runtime con "Cannot find module
  // .../playwright-core/browsers.json". Mismo motivo para pdf-parse/
  // pdfjs-dist en el cron de facturas historicas (necesita pdf.worker.mjs
  // presente en el bundle serverless de Vercel).
  // `lib/vite` de playwright-core lo trae el file tracing POR SU CUENTA (algo de
  // lib/server lo requiere), así que sacarlo del include no alcanza: son 3,7 MB del
  // visor de traces y del recorder —la interfaz web que abre `playwright show-trace`—
  // y nada de eso corre al lanzar un Chromium headless. Acá sí funciona el exclude,
  // porque ahora ningún include lo vuelve a meter.
  outputFileTracingExcludes: {
    "/api/cron/finanzas-sii": SIN_VISOR_DE_TRACES,
    "/api/cotizador/\\[id\\]/eco-pdf": SIN_VISOR_DE_TRACES,
    "/api/ofertas/\\[id\\]/pdf": SIN_VISOR_DE_TRACES,
    "/api/ofertas/\\[id\\]/emitir": SIN_VISOR_DE_TRACES,
    "/finanzas/sii": SIN_VISOR_DE_TRACES,
  },
  outputFileTracingIncludes: {
    "/api/cron/finanzas-sii": NAVEGADOR,
    "/api/cron/finanzas-historico": LECTOR_DE_PDF,
    // La lectura de un borrador en PDF extrae el texto con pdf-parse en vez de
    // mandar una imagen por pagina, asi que necesita los mismos archivos.
    "/api/ofertas/analizar": LECTOR_DE_PDF,
    // Las claves son route globs (picomatch) contra el pathname, no rutas de
    // archivo -- un segmento dinamico como [id] hay que escaparlo (\\[id\\])
    // o picomatch lo interpreta como una clase de caracteres del glob y la
    // ruta nunca hace match, dejando la funcion sin estos archivos igual.
    "/api/cotizador/\\[id\\]/eco-pdf": NAVEGADOR,
    // La oferta tecnica imprime con el mismo Chromium, asi que necesita los
    // mismos archivos: sin esta entrada la ruta compila y falla en runtime en
    // Vercel con "Cannot find module .../playwright-core/browsers.json".
    "/api/ofertas/\\[id\\]/pdf": NAVEGADOR,
    // Emitir imprime el MISMO PDF que la ruta de arriba —una sola vez, para
    // descargarlo, guardarlo en SharePoint y adjuntarlo al correo— asi que necesita
    // los mismos archivos. Sin esta entrada compila igual y falla recien en Vercel
    // con "Cannot find module .../playwright-core/browsers.json": cualquier ruta
    // nueva que imprima necesita la suya, y scripts/probar-ofertas.mts lo comprueba.
    "/api/ofertas/\\[id\\]/emitir": NAVEGADOR,
    // Releer un periodo del SII desde la pantalla usa el MISMO scraper con navegador que
    // el cron, y una Server Action se empaqueta con la RUTA QUE LA IMPORTA, no con una
    // ruta propia: por eso la clave es la pagina. Sin esta entrada la accion falla en
    // Vercel con "Cannot find module .../playwright-core/browsers.json", y en produccion
    // eso se ve solo como "An error occurred in the Server Components render" sin decir
    // cual fue el modulo. Paso una tarde por esto.
    "/finanzas/sii": NAVEGADOR,
  },
};

export default nextConfig;
