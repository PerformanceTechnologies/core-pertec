import { NextResponse } from "next/server";
import { verificarAccesoFinanzasIhApi } from "@/lib/finanzas-ih/autorizacion";
import { obtenerEjecucionesDesdeIh } from "@/lib/finanzas-ih/finanzas-ih";

// Usado por el boton "Actualizar con SII ahora" para hacer polling y saber
// cuando el workflow de GitHub Actions realmente termino (en vez de asumir
// un tiempo fijo) -- ver lib/finanzas-ih/finanzas-ih.ts:obtenerEjecucionesDesdeIh.
export async function GET(request: Request) {
  const acceso = await verificarAccesoFinanzasIhApi();
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const desde = new URL(request.url).searchParams.get("desde");
  if (!desde) {
    return NextResponse.json({ error: "Falta el parametro 'desde'." }, { status: 400 });
  }

  const ejecuciones = await obtenerEjecucionesDesdeIh(desde);
  return NextResponse.json({ ejecuciones });
}
