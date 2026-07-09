import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEnPanel } from "@/lib/proyectos";
import { obtenerEquipo, obtenerPlantilla, crearInspeccion } from "@/lib/mantencion";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEnPanel(rol, "run_checklist")) {
    return NextResponse.json({ error: "No tienes permiso para crear inspecciones." }, { status: 403 });
  }

  const body = await request.json();
  const equipoId = body.equipo_id as string | undefined;
  const checklistId = body.checklist_id as string | undefined;
  if (!equipoId || !checklistId) {
    return NextResponse.json({ error: "Equipo y plantilla son obligatorios." }, { status: 400 });
  }

  try {
    const [equipo, plantilla] = await Promise.all([obtenerEquipo(equipoId), obtenerPlantilla(checklistId)]);
    if (!equipo || !plantilla) return NextResponse.json({ error: "Equipo o plantilla no encontrados." }, { status: 404 });

    const id = await crearInspeccion(equipo, plantilla, {
      email: acceso.usuario.correo,
      nombre: acceso.usuario.nombre || acceso.usuario.correo,
    });
    return NextResponse.json({ id });
  } catch (error) {
    console.error("[mantencion] Error al crear inspección:", error);
    return NextResponse.json({ error: "No pudimos crear la inspección." }, { status: 500 });
  }
}
