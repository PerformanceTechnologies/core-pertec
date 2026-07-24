import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEditarGastos, subirArchivoGasto } from "@/lib/proyectos";

export const runtime = "nodejs";

const SLUG_APP = "proyectos";

export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const rol = await resolverRolPanel(acceso.usuario);
  if (!puedeEditarGastos(rol)) {
    return NextResponse.json({ error: "No tienes permiso para editar los gastos." }, { status: 403 });
  }

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }

  try {
    const archivoSubido = await subirArchivoGasto(archivo);
    return NextResponse.json({ archivo: archivoSubido });
  } catch (error) {
    console.error("[proyectos] Error al subir archivo de gasto:", error);
    return NextResponse.json({ error: "No pudimos subir el archivo." }, { status: 500 });
  }
}
