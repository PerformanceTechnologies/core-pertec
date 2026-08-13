// Punto de entrada para el workflow de GitHub Actions (.github/workflows/
// finanzas-ih-cron.yml). Corre con `npx tsx`, fuera de Vercel a proposito:
// la sincronizacion completa (RCV + Portal MIPYME + boletas de honorarios,
// cada una con su propio login al SII) pasaba los 60s de maxDuration del
// plan Hobby de Vercel y tiraba FUNCTION_INVOCATION_TIMEOUT en produccion
// (2026-08-13). GitHub Actions no tiene ese limite (hasta 6 horas por job).
//
// Reusa el codigo real de lib/finanzas-ih/*.ts via imports relativos (esos
// archivos no usan el alias "@/", asi que corren igual bajo tsx que dentro
// de Next.js) -- nada de logica duplicada.
import { sincronizarFinanzasIh, sincronizarBoletasHonorariosIh } from "../lib/finanzas-ih/sincronizar";

async function main() {
  const cargaInicial = process.argv.includes("--carga-inicial");

  console.log(`[finanzas-ih] Iniciando (cargaInicial=${cargaInicial})...`);

  const resultadoPrincipal = await sincronizarFinanzasIh({ cargaInicial });
  console.log("[finanzas-ih] RCV + Portal MIPYME:", resultadoPrincipal);

  const resultadoBhe = await sincronizarBoletasHonorariosIh({ cargaInicial });
  console.log("[finanzas-ih] Boletas de Honorarios IH:", resultadoBhe);

  console.log("[finanzas-ih] Listo.");
}

main().catch((err) => {
  console.error("[finanzas-ih] Error fatal:", err);
  process.exit(1);
});
