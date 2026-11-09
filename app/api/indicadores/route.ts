import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerIndicadores } from "@/lib/indicadores";

export const runtime = "nodejs";

/**
 * Dólar, UF, UTM, IPC y TPM para la cartilla de Finanzas. Solo con sesión.
 * El servidor guarda lo que lee de la fuente por 30 minutos (ver lib/indicadores.ts); el
 * navegador, 10.
 */
export async function GET() {
  if (!(await auth())?.user?.email) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  try {
    const datos = await obtenerIndicadores();
    return NextResponse.json(datos, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    console.error("[indicadores]", e);
    return NextResponse.json({ error: "No se pudieron leer los indicadores." }, { status: 502 });
  }
}
