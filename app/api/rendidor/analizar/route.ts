import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { analizarComprobante } from "@/lib/rendidor/analizar";

const SLUG_APP = "rendir-gastos";

export const runtime = "nodejs";
// El análisis con visión puede tardar; sin esto Vercel corta antes.
export const maxDuration = 60;

// Un comprobante por request, a propósito: 16 boletas no caben en una sola
// llamada dentro del límite de 60s de Vercel, y así la UI puede mostrar avance
// real en vez de dejar al rendidor esperando a ciegas.
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }

  const TIPOS_ACEPTADOS = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    return NextResponse.json(
      {
        error: `"${archivo.name}" es de tipo ${archivo.type || "desconocido"}. Se aceptan PDF, JPEG, PNG, GIF y WEBP.`,
      },
      { status: 400 },
    );
  }

  // Techo de tamaño explícito: el límite de body de Vercel (~4,5 MB) lo
  // contendría igual, pero con un error genérico que no le dice nada al usuario.
  const MAX_MB = 4;
  if (archivo.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `"${archivo.name}" pesa más de ${MAX_MB} MB. Reducilo antes de subirlo.` },
      { status: 400 },
    );
  }

  try {
    const contenido = Buffer.from(await archivo.arrayBuffer());
    const leido = await analizarComprobante(contenido, archivo.type, archivo.name);
    return NextResponse.json({ leido });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[rendidor] Error al analizar comprobante:", error);
    // Este mensaje sí se devuelve porque es accionable para quien rinde
    // (falta la API key, tipo no soportado, comprobante rechazado).
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
