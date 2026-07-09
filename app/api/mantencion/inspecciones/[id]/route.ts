import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { cerrarInspeccion, reabrirInspeccion, eliminarInspeccion } from "@/lib/mantencion";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  const { id } = await params;
  const body = await request.json();

  try {
    if (body.accion === "reabrir") {
      // Reabrir una inspección cerrada: solo admin, igual que en el panel original.
      if (rol !== "admin") return NextResponse.json({ error: "Solo un admin puede reabrir." }, { status: 403 });
      await reabrirInspeccion(id);
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "cerrar") {
      if (!puedeEnPanel(rol, "run_checklist")) {
        return NextResponse.json({ error: "No tienes permiso para cerrar inspecciones." }, { status: 403 });
      }
      await cerrarInspeccion(id, { email: acceso.usuario.correo, nombre: acceso.usuario.nombre || acceso.usuario.correo });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    console.error("[mantencion] Error al actualizar inspección:", error);
    return NextResponse.json({ error: "No pudimos actualizar la inspección." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "run_checklist")) {
    return NextResponse.json({ error: "No tienes permiso para eliminar inspecciones." }, { status: 403 });
  }

  const { id } = await params;
  try {
    await eliminarInspeccion(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mantencion] Error al eliminar inspección:", error);
    return NextResponse.json({ error: "No pudimos eliminar la inspección." }, { status: 500 });
  }
}
