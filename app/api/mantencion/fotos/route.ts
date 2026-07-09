import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { subirFotoEvidencia } from "@/lib/mantencion";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "run_checklist")) {
    return NextResponse.json({ error: "No tienes permiso para subir fotos." }, { status: 403 });
  }

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }

  try {
    const foto = await subirFotoEvidencia(archivo);
    return NextResponse.json({ foto });
  } catch (error) {
    console.error("[mantencion] Error al subir foto:", error);
    return NextResponse.json({ error: "No pudimos subir la foto." }, { status: 500 });
  }
}
