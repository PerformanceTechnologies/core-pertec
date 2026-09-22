import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { responderConsulta } from "@/lib/consulta-ia/responder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Una pregunta se contesta en una o dos vueltas de herramienta; el tope de seis
// es para el caso feo. 60 s alcanza y corta antes del techo de la plataforma.
export const maxDuration = 60;

/**
 * Contesta una pregunta en lenguaje natural sobre los datos del core.
 *
 * NO lleva slug de app: la pregunta puede cruzar módulos y el filtro real está
 * más adentro —cada herramienta revalida el acceso de esta persona a SU módulo
 * (ver lib/consulta-ia/herramientas.ts)—. Acá alcanza con exigir una sesión de
 * alguien activo: sin app asignada, la lista de herramientas le sale vacía y el
 * modelo no tiene con qué contestar.
 *
 * Va por route handler y no por Server Action porque lo llama un input mientras
 * se escribe, y una action arrastra un round-trip de RSC que acá no sirve.
 */
export async function POST(request: Request) {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const cuerpo = (await request.json().catch(() => null)) as { pregunta?: unknown } | null;
  const pregunta = typeof cuerpo?.pregunta === "string" ? cuerpo.pregunta.trim() : "";
  if (!pregunta) {
    return NextResponse.json({ error: "Falta la pregunta." }, { status: 400 });
  }
  // Tope de largo: el buscador manda lo que alguien escribe en un input, y un
  // pegado de 40 KB no es una pregunta, es otra cosa.
  if (pregunta.length > 500) {
    return NextResponse.json({ error: "La pregunta es demasiado larga." }, { status: 400 });
  }

  try {
    const respuesta = await responderConsulta(pregunta, usuario);
    return NextResponse.json(respuesta);
  } catch (error) {
    // El detalle al log, no a la pantalla: puede traer el mensaje crudo de la
    // API, y del otro lado no hay nada que hacer con eso.
    console.error("[consulta-ia] Falló la consulta:", error);
    return NextResponse.json(
      { error: "No se pudo consultar en este momento. Probá de nuevo en un rato." },
      { status: 500 },
    );
  }
}
