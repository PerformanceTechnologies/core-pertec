import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel, eliminarComentario } from "@/lib/proyectos";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "comentar")) {
    return NextResponse.json({ error: "No tienes permiso para eliminar comentarios." }, { status: 403 });
  }

  const { id } = await params;
  try {
    await eliminarComentario(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[comentarios] Error al eliminar:", error);
    return NextResponse.json({ error: "No pudimos eliminar el comentario." }, { status: 500 });
  }
}
