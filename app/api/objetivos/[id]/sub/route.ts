import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, obtenerObjetivo, crearSubObjetivo } from "@/lib/proyectos";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

// Alta de sub-objetivos: solo admin, igual que en el panel original.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (rol !== "admin") {
    return NextResponse.json({ error: "Solo un admin del panel puede agregar sub-objetivos." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const titulo = String(body.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });

  try {
    const padre = await obtenerObjetivo(id);
    if (!padre) return NextResponse.json({ error: "Objetivo padre no encontrado." }, { status: 404 });
    await crearSubObjetivo(padre, titulo);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[objetivos] Error al crear sub-objetivo:", error);
    return NextResponse.json({ error: "No pudimos crear el sub-objetivo." }, { status: 500 });
  }
}
