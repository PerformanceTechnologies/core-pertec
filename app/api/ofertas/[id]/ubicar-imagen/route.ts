import { NextResponse } from "next/server";
import { accesoAOfertaApi, guardarContenido } from "@/lib/ofertas/datos";
import { conLaImagenEn } from "@/lib/ofertas/normalizar";
import { leerDestino } from "@/lib/ofertas/destino-imagen";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Poner una imagen donde va —una sección o la rúbrica de un firmante—, o sacarla.
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
  const { id } = await params;
  // Un solo guard: sesión, acceso a la app y que la oferta sea de quien la pide.
  const acceso = await accesoAOfertaApi(id);
  if (!acceso.oferta) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const oferta = acceso.oferta;
  if (oferta.estado === "emitida") {
    return NextResponse.json({ error: "La oferta ya está emitida." }, { status: 409 });
  }

  const cuerpo = (await request.json().catch(() => null)) as { indice?: unknown; destino?: unknown } | null;

  const indice = Number(cuerpo?.indice);
  if (!oferta.imagenes.some((imagen) => imagen.indice === indice)) {
    return NextResponse.json({ error: "Esa imagen no está en la oferta." }, { status: 404 });
  }

  // Vacío o nulo saca la imagen del documento; lo demás tiene que ser una sección
  // que exista o un firmante que exista en ESTA oferta, no lo que venga escrito en
  // el cuerpo del request. `undefined` es "no lo reconozco" y se rechaza: tratarlo
  // como "no usar" haría que un destino mal escrito saque la foto en silencio.
  const destino = leerDestino(
    typeof cuerpo?.destino === "string" ? cuerpo.destino : null,
    oferta.contenido.cierre?.firmantes.length ?? 0,
  );
  if (destino === undefined) {
    return NextResponse.json({ error: "Ese destino no existe en esta oferta." }, { status: 400 });
  }

  await guardarContenido(id, conLaImagenEn(oferta.contenido, indice, destino), oferta.archivoOrigen);
  return NextResponse.json({ indice, destino });
}
