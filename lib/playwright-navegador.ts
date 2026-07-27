import "server-only";

// Lanza un navegador Chromium vía Playwright, adaptado al entorno — extraído
// de lib/sii-rcv.ts (primer consumidor) para reutilizarlo en cualquier otra
// tarea que necesite renderizar HTML o automatizar un sitio (ej. generación
// de PDF del Cotizador, ver lib/cotizador/eco-pdf.ts).
export async function lanzarNavegador() {
  if (process.env.VERCEL) {
    // @sparticuz/chromium-min solo extrae las librerias de sistema que le
    // faltan al runtime de Vercel (libnss3.so y otras, empaquetadas en
    // al2023.tar.br) si detecta que corre "en AWS Lambda" via esta variable
    // — Vercel no la setea sola, aunque su runtime este basado en Lambda.
    process.env.AWS_LAMBDA_JS_RUNTIME ??= "nodejs20.x";

    const chromium = (await import("@sparticuz/chromium-min")).default;
    const { chromium: playwrightChromium } = await import("playwright-core");
    const executablePath = await chromium.executablePath(
      process.env.CHROMIUM_PACK_URL ||
        "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"
    );
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }
  // Desarrollo local: usa el paquete "playwright" completo (chromium ya
  // instalado via `npx playwright install chromium`).
  const { chromium: localChromium } = await import("playwright");
  return localChromium.launch({ headless: true });
}
