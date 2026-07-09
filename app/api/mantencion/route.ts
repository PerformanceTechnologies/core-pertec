import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { listarMantencion, crearPlantilla } from "@/lib/mantencion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_APP = "proyectos";

export async function GET() {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  try {
    const bundle = await listarMantencion();
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("[mantencion] Error al listar:", error);
    return NextResponse.json({ error: "No pudimos cargar la mantención." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "run_checklist")) {
    return NextResponse.json({ error: "No tienes permiso para crear plantillas." }, { status: 403 });
  }

  const body = await request.json();
  if (!body.titulo?.trim()) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });

  try {
    const id = await crearPlantilla({ titulo: body.titulo, descripcion: body.descripcion ?? null });
    return NextResponse.json({ id });
  } catch (error) {
    console.error("[mantencion] Error al crear plantilla:", error);
    return NextResponse.json({ error: "No pudimos crear la plantilla." }, { status: 500 });
  }
}
