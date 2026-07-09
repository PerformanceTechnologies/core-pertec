import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { crearEquipo } from "@/lib/mantencion";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "run_checklist")) {
    return NextResponse.json({ error: "No tienes permiso para registrar equipos." }, { status: 403 });
  }

  const body = await request.json();
  if (!body.nombre?.trim() || !body.checklist_id) {
    return NextResponse.json({ error: "Nombre y plantilla son obligatorios." }, { status: 400 });
  }

  try {
    await crearEquipo({
      checklist_id: body.checklist_id,
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
      estado: body.estado || "operativo",
      secciones_activas: Array.isArray(body.secciones_activas) ? body.secciones_activas : [],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mantencion] Error al crear equipo:", error);
    return NextResponse.json({ error: "No pudimos registrar el equipo." }, { status: 500 });
  }
}
