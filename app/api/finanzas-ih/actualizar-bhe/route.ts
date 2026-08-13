import { NextResponse } from "next/server";
import { verificarAccesoFinanzasIhApi } from "@/lib/finanzas-ih/autorizacion";
import { sincronizarBoletasHonorariosIh } from "@/lib/finanzas-ih/sincronizar";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Segunda mitad del boton "Actualizar con SII ahora" -- separada de
// app/api/finanzas-ih/actualizar/route.ts por el mismo motivo que el cron
// (ver lib/finanzas-ih/sincronizar.ts): juntas superaban el maxDuration=60s
// de Vercel Hobby en produccion.
export async function POST() {
  const acceso = await verificarAccesoFinanzasIhApi();
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  try {
    const resultado = await sincronizarBoletasHonorariosIh({ cargaInicial: false });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
