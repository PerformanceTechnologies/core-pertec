import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { eliminarPostulacion } from "@/lib/reclutamiento";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario || usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  try {
    await eliminarPostulacion(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[postulaciones] Error al eliminar:", error);
    return NextResponse.json({ error: "No pudimos eliminar la postulación." }, { status: 500 });
  }
}
