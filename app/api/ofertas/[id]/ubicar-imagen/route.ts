import { NextResponse } from "next/server";
import { guardarContenido, obtenerOferta, verificarAccesoOfertasApi } from "@/lib/ofertas/datos";
import { conLaImagenEn } from "@/lib/ofertas/normalizar";
import { SECCIONES_CON_IMAGENES, type SeccionConImagenes } from "@/lib/ofertas/tipos";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Poner una imagen en una sección del documento, o sacarla.
 *
 * Es lo que ocurre al arrastrar una foto sobre el documento y soltarla. Guarda al
 * instante, sin pasar por "Guardar cambios", y es a propósito: soltar una foto en un
 * lugar ES la decisión, no el borrador de una decisión. Lo mismo hacía el botón
 * "Aplicar al documento" del panel de imágenes, que sigue existiendo y escribe
 * exactamente este mismo campo.
 *
 * Guarda SOLO la ubicación: lee el contenido de la base y le cambia ese campo. Así no
 * puede pisar lo que alguien esté escribiendo en el documento sin guardar, que viaja
 * por otro camino (ver `conElRepartoDe`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoOfertasApi();
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const { id } = await params;

  const oferta = await obtenerOferta(id);
  if (!oferta) return NextResponse.json({ error: "La oferta no existe." }, { status: 404 });
  if (oferta.estado === "emitida") {
    return NextResponse.json({ error: "La oferta ya está emitida." }, { status: 409 });
  }

  const cuerpo = (await request.json().catch(() => null)) as { indice?: unknown; seccion?: unknown } | null;

  const indice = Number(cuerpo?.indice);
  if (!oferta.imagenes.some((imagen) => imagen.indice === indice)) {
    return NextResponse.json({ error: "Esa imagen no está en la oferta." }, { status: 404 });
  }

  // null saca la imagen del documento; cualquier otra cosa tiene que ser una sección
  // que exista, no la que venga escrita en el cuerpo del request.
  const pedida = cuerpo?.seccion;
  if (pedida !== null && !SECCIONES_CON_IMAGENES.includes(pedida as SeccionConImagenes)) {
    return NextResponse.json({ error: "Esa sección no existe." }, { status: 400 });
  }
  const seccion = pedida === null ? null : (pedida as SeccionConImagenes);

  await guardarContenido(id, conLaImagenEn(oferta.contenido, indice, seccion), oferta.archivoOrigen);
  return NextResponse.json({ indice, seccion });
}
