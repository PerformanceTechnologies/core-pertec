import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { probarSharePoint, sharePointConfigurado } from "@/lib/archivos/sharepoint-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnóstico (solo admin): sube, lee y borra un archivo de prueba en «ARCHIVOS CORE/_prueba».
// Si falla, los archivos nuevos están quedando en Supabase y el motivo dice por qué.
export async function GET() {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (usuario?.rol !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!sharePointConfigurado()) return NextResponse.json({ ok: false, motivo: "Faltan las variables AZURE_* en Vercel." });
  const motivo = await probarSharePoint();
  return NextResponse.json(motivo
    ? { ok: false, motivo, sitio: process.env.SHAREPOINT_CORE_SITIO || "performancecl.sharepoint.com:/sites/COREPERTEC" }
    : { ok: true, mensaje: "SharePoint recibe, entrega y borra archivos." });
}
