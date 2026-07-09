import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel, actualizarObjetivo, alternarObjetivoHecho, eliminarObjetivo } from "@/lib/proyectos";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  const { id } = await params;
  const body = await request.json();

  // Body con solo `hecho`: es el checkbox del Gantt/checklist, requiere
  // toggle_objetivo. Body completo: es el formulario de edición.
  const esSoloToggle = Object.keys(body).length === 1 && "hecho" in body;

  try {
    if (esSoloToggle) {
      if (!puedeEnPanel(rol, "toggle_objetivo")) {
        return NextResponse.json({ error: "No tienes permiso para marcar objetivos." }, { status: 403 });
      }
      await alternarObjetivoHecho(id, !!body.hecho);
      return NextResponse.json({ ok: true });
    }

    if (!puedeEnPanel(rol, "edit_objetivo")) {
      return NextResponse.json({ error: "No tienes permiso para editar objetivos." }, { status: 403 });
    }
    if (!body.titulo?.trim() || !body.fecha_inicio || !body.fecha_fin) {
      return NextResponse.json({ error: "Título e inicio/fin son obligatorios." }, { status: 400 });
    }
    if (body.fecha_fin < body.fecha_inicio) {
      return NextResponse.json({ error: "La fecha de fin no puede ser anterior al inicio." }, { status: 400 });
    }
    await actualizarObjetivo(id, {
      titulo: body.titulo,
      descripcion: body.descripcion ?? null,
      fecha_inicio: body.fecha_inicio,
      fecha_fin: body.fecha_fin,
      color: body.color || "cobre",
      hecho: !!body.hecho,
      responsables: Array.isArray(body.responsables) ? body.responsables : [],
      parent_id: body.parent_id || null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[objetivos] Error al actualizar:", error);
    return NextResponse.json({ error: "No pudimos guardar los cambios." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "delete_objetivo")) {
    return NextResponse.json({ error: "No tienes permiso para eliminar objetivos." }, { status: 403 });
  }

  const { id } = await params;
  try {
    await eliminarObjetivo(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[objetivos] Error al eliminar:", error);
    return NextResponse.json({ error: "No pudimos eliminar el objetivo." }, { status: 500 });
  }
}
