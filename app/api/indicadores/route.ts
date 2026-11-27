import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerIndicadores } from "@/lib/indicadores";

export const runtime = "nodejs";

/**
 * Dólar, UF, UTM, IPC y TPM para la cartilla de Finanzas. Solo con sesión.
 * El servidor lee la fuente en cada consulta (ver lib/indicadores.ts); el navegador guarda la
 * respuesta 1 minuto (antes 10: dejaba el dato de ayer en pantalla aunque el servidor ya
 * tuviera el de hoy).
 */
export async function GET() {
  if (!(await auth())?.user?.email) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  try {
    const datos = await obtenerIndicadores();
    return NextResponse.json(datos, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    console.error("[indicadores]", e);
    return NextResponse.json({ error: "No se pudieron leer los indicadores." }, { status: 502 });
  }
}
