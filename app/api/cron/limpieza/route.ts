import { NextRequest, NextResponse } from "next/server";
import { limpiar } from "@/lib/limpieza/retencion";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Exactamente el mismo patron que los demas cron de este repo (ver
// app/api/cron/finanzas-sii): solo el header Bearer con el CRON_SECRET, que
// Vercel Cron manda solo cuando esa variable existe.
//
// A proposito NO se acepta el header x-vercel-cron como alternativa: este
// endpoint borra, y una sola forma de autorizarlo es una sola cosa que revisar.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

/**
 * Retencion semanal: purga el historial de sincronizaciones, los resumenes
 * diarios viejos y los respaldos del bucket que ya no cuelgan de ningun gasto.
 *
 * `?simular=1` reporta que se iria sin borrar nada. Conviene usarlo la primera
 * vez despues de cambiar cualquier ventana de retencion.
 *
 * Semanal y no diario porque en Hobby cada expresion de cron corre una vez al
 * dia como maximo y ya hay nueve: esto no necesita gastar una corrida diaria.
 */
export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const simular = request.nextUrl.searchParams.get("simular") === "1";

  try {
    const resultado = await limpiar(simular);
    console.log(
      `[limpieza] ${simular ? "simulacion" : "corrida"}: ` +
        `${resultado.sincronizaciones} sincronizaciones, ${resultado.resumenes} resumenes, ` +
        `${resultado.respaldos.borrados} respaldos (${Math.round(resultado.respaldos.bytes / 1024)} KB)`,
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[limpieza] Falló:", detalle);
    return NextResponse.json({ ok: false, error: detalle }, { status: 500 });
  }
}
