import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core carga browsers.json y otros archivos internos de forma
  // dinamica, y el file tracing de Vercel no los detecta solo — sin esto la
  // funcion serverless del cron falla en runtime con "Cannot find module
  // .../playwright-core/browsers.json".
  outputFileTracingIncludes: {
    "/api/cron/finanzas-sii": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium-min/**/*",
    ],
  },
};

export default nextConfig;
