import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { probarSharePoint } from "@/lib/archivos/sharepoint-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnóstico (solo admin): con la cuenta de quien lo abre, sube, lee y borra un archivo de
// prueba en «ARCHIVOS CORE/_prueba». Si falla, el motivo dice por qué.
export async function GET() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (usuario?.rol !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const motivo = await probarSharePoint();
  return NextResponse.json(motivo ? { ok: false, motivo } : { ok: true, mensaje: "SharePoint recibe, entrega y borra archivos con tu cuenta." });
}
