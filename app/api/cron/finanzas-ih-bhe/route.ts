import { NextRequest, NextResponse } from "next/server";
import { sincronizarBoletasHonorariosIh } from "@/lib/finanzas-ih/sincronizar";
import { enviarCorreoSoporte } from "@/lib/notificaciones";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Cron aparte de app/api/cron/finanzas-ih/route.ts a proposito: la BHE de IH
// usa un login totalmente distinto (RUT/clave propios de IH) y sumada a la
// sincronizacion principal superaba los 60s de maxDuration en produccion
// (FUNCTION_INVOCATION_TIMEOUT, 2026-08-13). Ver lib/finanzas-ih/sincronizar.ts.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cargaInicial = request.nextUrl.searchParams.get("cargaInicial") === "true";

  try {
    const resultado = await sincronizarBoletasHonorariosIh({ cargaInicial });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await enviarCorreoSoporte(
      "Panel Finanzas: fallo la actualizacion diaria de Boletas de Honorarios IH",
      `La corrida automatica de hoy no pudo actualizar las Boletas de Honorarios de IH.\n\nError: ${mensaje}\n\nRevisa el dashboard en core.pertec.cl/finanzas/facturas-ih y, si persiste, corre el scraper localmente para diagnosticar.`
    ).catch(() => {});
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
