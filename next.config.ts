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
  },
};

export default nextConfig;
