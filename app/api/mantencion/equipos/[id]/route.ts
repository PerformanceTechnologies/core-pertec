import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { actualizarEquipo, eliminarEquipo } from "@/lib/mantencion";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

async function exigirPermiso() {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return { error: acceso.error, status: acceso.status };
  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "run_checklist")) {
    return { error: "No tienes permiso para modificar equipos.", status: 403 as const };
  }
  return { error: null, status: null };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirPermiso();
  if (permiso.error) return NextResponse.json({ error: permiso.error }, { status: permiso.status });

  const { id } = await params;
  const body = await request.json();
  if (!body.nombre?.trim()) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  try {
    await actualizarEquipo(id, {
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
      estado: body.estado || "operativo",
      secciones_activas: Array.isArray(body.secciones_activas) ? body.secciones_activas : [],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mantencion] Error al actualizar equipo:", error);
    return NextResponse.json({ error: "No pudimos guardar el equipo." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirPermiso();
  if (permiso.error) return NextResponse.json({ error: permiso.error }, { status: permiso.status });

  const { id } = await params;
  try {
    await eliminarEquipo(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mantencion] Error al eliminar equipo:", error);
    return NextResponse.json({ error: "No pudimos eliminar el equipo." }, { status: 500 });
  }
}
