import { NextRequest, NextResponse } from "next/server";
import { sincronizarFinanzasIh } from "@/lib/finanzas-ih/sincronizar";
import { enviarCorreoSoporte } from "@/lib/notificaciones";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Mismo patron que app/api/cron/finanzas-sii/route.ts: protegido por
// CRON_SECRET, Vercel Cron envia "Authorization: Bearer <CRON_SECRET>" solo.
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
    const resultado = await sincronizarFinanzasIh({ cargaInicial });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await enviarCorreoSoporte(
      "Panel Finanzas: fallo la actualizacion diaria de Facturas IH",
      `La corrida automatica de hoy no pudo actualizar Facturas IH (IH/IL).\n\nError: ${mensaje}\n\nRevisa el dashboard en core.pertec.cl/finanzas/facturas-ih y, si persiste, corre el scraper localmente para diagnosticar.`
    ).catch(() => {});
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
