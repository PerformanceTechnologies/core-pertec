import { NextResponse } from "next/server";
import { verificarAccesoFinanzasIhApi } from "@/lib/finanzas-ih/autorizacion";
import { sincronizarFinanzasIh } from "@/lib/finanzas-ih/sincronizar";

export const maxDuration = 60; // limite del plan Hobby de Vercel

// Boton "Actualizar ahora" de la UI: dispara el mismo proceso que el cron
// diario (lib/finanzas-ih/sincronizar.ts), de forma sincrona.
export async function POST() {
  const acceso = await verificarAccesoFinanzasIhApi();
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  try {
    const resultado = await sincronizarFinanzasIh({ cargaInicial: false });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
