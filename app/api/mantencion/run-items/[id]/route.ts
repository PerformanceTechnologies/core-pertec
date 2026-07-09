import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { obtenerRunItem, obtenerRun, alternarRunItemHecho, actualizarRunItemEvidencia } from "@/lib/mantencion";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  const { id } = await params;

  try {
    const item = await obtenerRunItem(id);
    if (!item) return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
    const run = await obtenerRun(item.run_id);
    if (!run) return NextResponse.json({ error: "Inspección no encontrada." }, { status: 404 });

    // Cerrada → solo admin edita; abierta → cualquiera con run_checklist.
    const cerrada = !!run.cerrado_en;
    const editable = puedeEnPanel(rol, "run_checklist") && (!cerrada || rol === "admin");
    if (!editable) {
      return NextResponse.json({ error: "No tienes permiso para editar este ítem." }, { status: 403 });
    }

    const body = await request.json();
    const esSoloToggle = Object.keys(body).length === 1 && "hecho" in body;
    if (esSoloToggle) {
      await alternarRunItemHecho(id, !!body.hecho);
      return NextResponse.json({ ok: true });
    }

    const patch: { notas?: string | null; fotos?: unknown[]; medicion?: Record<string, string> | null } = {};
    if ("notas" in body) patch.notas = body.notas;
    if ("fotos" in body) patch.fotos = body.fotos;
    if ("medicion" in body) patch.medicion = body.medicion;
    await actualizarRunItemEvidencia(id, patch as Parameters<typeof actualizarRunItemEvidencia>[1]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mantencion] Error al actualizar ítem:", error);
    return NextResponse.json({ error: "No pudimos guardar los cambios." }, { status: 500 });
  }
}
