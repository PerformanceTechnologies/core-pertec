import type { NextConfig } from "next";

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
  outputFileTracingIncludes: {
    "/api/cron/finanzas-sii": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
    "/api/cron/finanzas-historico": ["./node_modules/pdf-parse/**/*"],
    // La lectura de un borrador en PDF extrae el texto con pdf-parse en vez de
    // mandar una imagen por pagina, asi que necesita los mismos archivos.
    "/api/ofertas/analizar": ["./node_modules/pdf-parse/**/*"],
    // Las claves son route globs (picomatch) contra el pathname, no rutas de
    // archivo -- un segmento dinamico como [id] hay que escaparlo (\\[id\\])
    // o picomatch lo interpreta como una clase de caracteres del glob y la
    // ruta nunca hace match, dejando la funcion sin estos archivos igual.
    "/api/cotizador/\\[id\\]/eco-pdf": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
    // La oferta tecnica imprime con el mismo Chromium, asi que necesita los
    // mismos archivos: sin esta entrada la ruta compila y falla en runtime en
    // Vercel con "Cannot find module .../playwright-core/browsers.json".
    "/api/ofertas/\\[id\\]/pdf": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
    // Emitir imprime el MISMO PDF que la ruta de arriba —una sola vez, para
    // descargarlo, guardarlo en SharePoint y adjuntarlo al correo— asi que necesita
    // los mismos archivos. Sin esta entrada compila igual y falla recien en Vercel
    // con "Cannot find module .../playwright-core/browsers.json": cualquier ruta
    // nueva que imprima necesita la suya, y scripts/probar-ofertas.mts lo comprueba.
    "/api/ofertas/\\[id\\]/emitir": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
    // Releer un periodo del SII desde la pantalla usa el MISMO scraper con navegador que
    // el cron, y una Server Action se empaqueta con la RUTA QUE LA IMPORTA, no con una
    // ruta propia: por eso la clave es la pagina. Sin esta entrada la accion falla en
    // Vercel con "Cannot find module .../playwright-core/browsers.json", y en produccion
    // eso se ve solo como "An error occurred in the Server Components render" sin decir
    // cual fue el modulo. Paso una tarde por esto.
    "/finanzas/sii": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
  },
};

export default nextConfig;
