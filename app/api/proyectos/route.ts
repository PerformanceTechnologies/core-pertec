import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel, listarProyectos, listarObjetivosResumen, crearProyecto } from "@/lib/proyectos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_APP = "proyectos";

export async function GET() {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  try {
    const [proyectos, resumenObjetivos] = await Promise.all([listarProyectos(), listarObjetivosResumen()]);
    return NextResponse.json({ proyectos, resumenObjetivos });
  } catch (error) {
    console.error("[proyectos] Error al listar:", error);
    return NextResponse.json({ error: "No pudimos cargar los proyectos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "create_objetivo")) {
    return NextResponse.json({ error: "No tienes permiso para crear proyectos." }, { status: 403 });
  }

  const body = await request.json();
  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (body.fecha_inicio && body.fecha_fin && body.fecha_fin < body.fecha_inicio) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior al inicio." }, { status: 400 });
  }

  try {
    const proyecto = await crearProyecto({
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
      color: body.color || "cobre",
      fecha_inicio: body.fecha_inicio || null,
      fecha_fin: body.fecha_fin || null,
    });
    return NextResponse.json({ proyecto });
  } catch (error) {
    console.error("[proyectos] Error al crear:", error);
    return NextResponse.json({ error: "No pudimos crear el proyecto." }, { status: 500 });
  }
}
