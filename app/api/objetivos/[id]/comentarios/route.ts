import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel, listarComentarios, crearComentario } from "@/lib/proyectos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_APP = "proyectos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const { id } = await params;
  try {
    const comentarios = await listarComentarios(id);
    return NextResponse.json({ comentarios });
  } catch (error) {
    console.error("[comentarios] Error al listar:", error);
    return NextResponse.json({ error: "No pudimos cargar los comentarios." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "comentar")) {
    return NextResponse.json({ error: "No tienes permiso para comentar." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const contenido = String(body.contenido ?? "").trim();
  if (!contenido) return NextResponse.json({ error: "El comentario no puede estar vacío." }, { status: 400 });

  try {
    await crearComentario(id, acceso.usuario.correo, contenido);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[comentarios] Error al crear:", error);
    return NextResponse.json({ error: "No pudimos guardar el comentario." }, { status: 500 });
  }
}
