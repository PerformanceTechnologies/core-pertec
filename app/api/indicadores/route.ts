import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerIndicadores } from "@/lib/indicadores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UF, dólar, UTM, IPC y TPM para el panel de Finanzas. Solo con sesión; Vercel lo guarda 15 min. */
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
