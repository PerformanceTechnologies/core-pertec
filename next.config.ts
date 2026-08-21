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
  },
};

export default nextConfig;
