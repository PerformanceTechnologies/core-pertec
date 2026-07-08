import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { obtenerAplicacionPorSlug } from "@/lib/aplicaciones";
import { credencialesGraphConfiguradas, listarPostulaciones } from "@/lib/reclutamiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_APP = "panel-de-postulacion-laboral";

export async function GET() {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (usuario.rol !== "admin") {
    const app = await obtenerAplicacionPorSlug(SLUG_APP);
    if (!app || !usuario.aplicacionIds.includes(app.id)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  if (!credencialesGraphConfiguradas()) {
    return NextResponse.json({ error: "SharePoint no está configurado." }, { status: 503 });
  }

  try {
    const postulaciones = await listarPostulaciones();
    return NextResponse.json({ postulaciones, actualizadoEn: new Date().toISOString() });
  } catch (error) {
    console.error("[postulaciones] Error al listar:", error);
    return NextResponse.json({ error: "No pudimos cargar las postulaciones." }, { status: 500 });
  }
}
