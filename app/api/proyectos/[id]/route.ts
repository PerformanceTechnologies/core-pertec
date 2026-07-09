import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel, obtenerProyecto, actualizarProyecto, eliminarProyecto } from "@/lib/proyectos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_APP = "proyectos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const { id } = await params;
  try {
    const proyecto = await obtenerProyecto(id);
    if (!proyecto) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    return NextResponse.json({ proyecto });
  } catch (error) {
    console.error("[proyectos] Error al obtener:", error);
    return NextResponse.json({ error: "No pudimos cargar el proyecto." }, { status: 500 });
  }
}

async function exigirPermisoProyecto() {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return { error: acceso.error, status: acceso.status };

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "create_objetivo")) {
    return { error: "No tienes permiso para modificar proyectos.", status: 403 as const };
  }
  return { error: null, status: null };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirPermisoProyecto();
  if (permiso.error) return NextResponse.json({ error: permiso.error }, { status: permiso.status });

  const { id } = await params;
  const body = await request.json();
  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (body.fecha_inicio && body.fecha_fin && body.fecha_fin < body.fecha_inicio) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior al inicio." }, { status: 400 });
  }

  try {
    await actualizarProyecto(id, {
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
      color: body.color || "cobre",
      fecha_inicio: body.fecha_inicio || null,
      fecha_fin: body.fecha_fin || null,
      estado: body.estado || "en_curso",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[proyectos] Error al actualizar:", error);
    return NextResponse.json({ error: "No pudimos guardar los cambios." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirPermisoProyecto();
  if (permiso.error) return NextResponse.json({ error: permiso.error }, { status: permiso.status });

  const { id } = await params;
  try {
    await eliminarProyecto(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[proyectos] Error al eliminar:", error);
    return NextResponse.json({ error: "No pudimos eliminar el proyecto." }, { status: 500 });
  }
}
