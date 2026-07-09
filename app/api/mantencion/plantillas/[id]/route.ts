import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { actualizarPlantilla } from "@/lib/mantencion";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "run_checklist")) {
    return NextResponse.json({ error: "No tienes permiso para editar plantillas." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  if (!body.titulo?.trim()) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });

  try {
    await actualizarPlantilla(id, {
      titulo: body.titulo,
      descripcion: body.descripcion ?? null,
      items: Array.isArray(body.items) ? body.items : [],
      itemsExistentesIds: Array.isArray(body.itemsExistentesIds) ? body.itemsExistentesIds : [],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mantencion] Error al actualizar plantilla:", error);
    return NextResponse.json({ error: "No pudimos guardar la plantilla." }, { status: 500 });
  }
}
