import { exigirAccesoOfertas, marcarEmitida, obtenerOferta } from "@/lib/ofertas/datos";
import { ofertaAPdf } from "@/lib/ofertas/pdf";

export const runtime = "nodejs";
// Chromium arranca, carga la plantilla e imprime: el ECO-1 del Cotizador usa el
// mismo margen.
export const maxDuration = 60;

/**
 * El PDF de la oferta, en el formato del maestro.
 *
 * `?emitir=1` además la marca como emitida. Sin eso solo imprime, así que se puede
 * mirar el resultado tantas veces como haga falta mientras se corrige, y el estado
 * cambia únicamente cuando la persona decide que está lista.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoOfertas();
  const { id } = await params;

  const oferta = await obtenerOferta(id);
  if (!oferta) return new Response("La oferta no existe.", { status: 404 });

  try {
    const pdf = await ofertaAPdf(oferta.contenido, oferta.empresa);

    if (new URL(request.url).searchParams.get("emitir") === "1" && oferta.estado !== "emitida") {
      await marcarEmitida(id);
    }

    const nombre = (oferta.numeroOferta ?? "oferta").replace(/[^\w.-]+/g, "_");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${nombre}.pdf"`,
        // Un documento comercial no se cachea en ningún intermediario.
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] la impresión falló:", detalle);
    return new Response(detalle, { status: 500 });
  }
}
