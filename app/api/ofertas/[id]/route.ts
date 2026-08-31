import { NextResponse } from "next/server";
import { accesoAOfertaApi, guardarContenido } from "@/lib/ofertas/datos";
import type { OfertaCanonica } from "@/lib/ofertas/tipos";
import { conElRepartoDe } from "@/lib/ofertas/normalizar";

export const runtime = "nodejs";

/** Guarda las correcciones hechas en pantalla y devuelve los controles al día. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Un solo guard: sesión, acceso a la app y que la oferta sea de quien la pide.
  const acceso = await accesoAOfertaApi(id);
  if (!acceso.oferta) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const oferta = acceso.oferta;
  if (oferta.estado === "emitida") {
    return NextResponse.json(
      { error: "La oferta ya está emitida. Duplicala si necesitás cambiarla." },
      { status: 409 },
    );
  }

  const cuerpo = (await request.json()) as { contenido?: OfertaCanonica };
  if (!cuerpo.contenido || typeof cuerpo.contenido !== "object") {
    return NextResponse.json({ error: "Falta el contenido de la oferta." }, { status: 400 });
  }

  // El reparto de imágenes no viaja en este guardado aunque venga en el cuerpo: lo
  // manda el panel de imágenes, y la copia que tiene el editor puede ser anterior a
  // la última vez que se aplicó. Ver `conElRepartoDe`.
  const contenido = conElRepartoDe(cuerpo.contenido, oferta.contenido);

  try {
    const inconsistencias = await guardarContenido(id, contenido, oferta.archivoOrigen, oferta.tipo, oferta.revisadas);
    return NextResponse.json({ inconsistencias });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
