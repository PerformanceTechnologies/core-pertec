import { NextRequest, NextResponse } from "next/server";
import { bearerCoincide } from "@/lib/cron-bearer";
import { avisarVencimientosLegales } from "@/lib/repositorio-legal/alertas";

export const maxDuration = 60;

// Mismo patrón que los demás cron: solo el Bearer con CRON_SECRET.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return bearerCoincide(request.headers.get("authorization"), secreto);
}

/** Una vez al día: avisos al Buzón de lo legal vencido o por vencer (30 días, 7 días y al vencer). */
export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const r = await avisarVencimientosLegales();
    console.log(`[repositorio-legal] avisos: ${r.creados} nuevos de ${r.revisados} documentos en alerta`);
    return NextResponse.json(r);
  } catch (e) {
    console.error("[repositorio-legal] cron falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Falló la revisión de vencimientos." }, { status: 500 });
  }
}
