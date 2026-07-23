import { NextRequest, NextResponse } from "next/server";
import { obtenerUfUtmVigentes } from "@/lib/cotizador/indicadores-mindicador";
import { actualizarUfUtmVigente } from "@/lib/parametros-legales";

export const maxDuration = 30;

// Protegido por CRON_SECRET, mismo patrón que los demás cron de este repo
// (ver app/api/cron/finanzas-sii/route.ts): Vercel Cron envía
// "Authorization: Bearer <CRON_SECRET>" automáticamente. También se puede
// invocar a mano con ese mismo header (ej. para probar el flujo).
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

// Actualiza SOLO uf/utm del set de parámetros legales vigente con los
// valores del día publicados en mindicador.cl — no toca ninguna otra tasa
// (esas se fijan por ley/decreto y no tienen una fuente "de hoy" real, se
// siguen editando a mano en /cotizador/parametros). No crea un set nuevo ni
// afecta cotizaciones ya creadas (usan su propio parametros_snapshot).
export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { uf, utm, fechaUf, fechaUtm } = await obtenerUfUtmVigentes();
    const resultado = await actualizarUfUtmVigente(uf, utm);

    if (!resultado.actualizado) {
      console.error("[cron cotizador-parametros]", resultado.motivo);
      return NextResponse.json({ ok: false, motivo: resultado.motivo }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      setId: resultado.setId,
      uf: { anterior: resultado.ufAnterior, nueva: resultado.ufNueva, fecha: fechaUf },
      utm: { anterior: resultado.utmAnterior, nueva: resultado.utmNueva, fecha: fechaUtm },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("[cron cotizador-parametros]", mensaje);
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
