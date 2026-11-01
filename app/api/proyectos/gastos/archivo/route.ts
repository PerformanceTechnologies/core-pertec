import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { resolverRolPanel, puedeEditarGastos, subirArchivoGasto, TIPOS_ARCHIVO_GASTO } from "@/lib/proyectos";
import { validarSubidaPublica } from "@/lib/subidas";

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

  // El bucket "gastos" es público: sin esto se podía subir un .html o .svg y servirlo
  // desde el dominio de Supabase.
  const validacion = validarSubidaPublica(
    archivo,
    TIPOS_ARCHIVO_GASTO,
    "imágenes (JPG, PNG, WEBP, GIF, HEIC), PDF, Word y Excel",
  );
  if (validacion.extension === null) {
    return NextResponse.json({ error: validacion.error }, { status: validacion.status });
  }

  try {
    const archivoSubido = await subirArchivoGasto(archivo, validacion.extension);
    return NextResponse.json({ archivo: archivoSubido });
  } catch (error) {
    console.error("[proyectos] Error al subir archivo de gasto:", error);
    return NextResponse.json({ error: "No pudimos subir el archivo." }, { status: 500 });
  }
}
