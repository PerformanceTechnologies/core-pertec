import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { analizarComprobante } from "@/lib/rendidor/analizar";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import { subirRespaldo } from "@/lib/rendidor/almacenamiento";

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

  // La rendición hace falta para agrupar el respaldo en el bucket, y se verifica
  // que sea de quien la está subiendo: sin esto se podría escribir en la carpeta
  // de la rendición de otra persona.
  const rendicionId = String(formulario.get("rendicionId") ?? "");
  if (!rendicionId) {
    return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
  }
  const rendicion = await obtenerRendicion(rendicionId);
  if (!rendicion) {
    return NextResponse.json({ error: "No encontramos esa rendición." }, { status: 404 });
  }
  if (rendicion.creadoPor !== acceso.usuario.id && acceso.usuario.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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

    // El respaldo se guarda ANTES de analizar. Si el análisis falla, el archivo
    // ya está a salvo y el gasto se puede completar a mano sin volver a subirlo;
    // al revés se perdería justo en el caso en que hay que reintentar.
    const archivoPath = await subirRespaldo(rendicionId, contenido, archivo.type);

    const leido = await analizarComprobante(contenido, archivo.type, archivo.name);
    return NextResponse.json({ leido, archivoPath });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[rendidor] Error al analizar comprobante:", error);
    // Este mensaje sí se devuelve porque es accionable para quien rinde
    // (falta la API key, tipo no soportado, comprobante rechazado).
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
