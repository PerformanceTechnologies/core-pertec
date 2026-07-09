import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel, listarObjetivos, crearObjetivo } from "@/lib/proyectos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_APP = "proyectos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const { id } = await params;
  try {
    const objetivos = await listarObjetivos(id);
    return NextResponse.json({ objetivos });
  } catch (error) {
    console.error("[objetivos] Error al listar:", error);
    return NextResponse.json({ error: "No pudimos cargar los objetivos." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "create_objetivo")) {
    return NextResponse.json({ error: "No tienes permiso para crear objetivos." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  if (!body.titulo?.trim() || !body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json({ error: "Título e inicio/fin son obligatorios." }, { status: 400 });
  }
  if (body.fecha_fin < body.fecha_inicio) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior al inicio." }, { status: 400 });
  }

  try {
    await crearObjetivo(id, {
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
    console.error("[objetivos] Error al crear:", error);
    return NextResponse.json({ error: "No pudimos crear el objetivo." }, { status: 500 });
  }
}
