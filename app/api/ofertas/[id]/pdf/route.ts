import { exigirAccesoOfertas, marcarEmitida, obtenerOferta } from "@/lib/ofertas/datos";
import { ofertaAHtmlConEmpresa, ofertaAPdf } from "@/lib/ofertas/pdf";

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
 *
 * `?formato=html` devuelve la misma maqueta sin pasar por Chromium. Es para mirar
 * mientras se corrige: arranca al instante en vez de esperar a que levante el
 * navegador, y el resultado es el mismo HTML que después se imprime, así que no
 * hay dos maquetas que puedan separarse. Va con `sandbox` en la CSP: el contenido
 * sale de un borrador que escribió otra persona y, aunque todo se escapa al
 * armarlo, no hay razón para que ese documento pueda ejecutar nada.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirAccesoOfertas();
  const { id } = await params;

  const oferta = await obtenerOferta(id);
  if (!oferta) return new Response("La oferta no existe.", { status: 404 });

  const parametros = new URL(request.url).searchParams;

  try {
    if (parametros.get("formato") === "html") {
      const html = await ofertaAHtmlConEmpresa(oferta.contenido, oferta.empresa, oferta.maestroId);
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "sandbox",
          "cache-control": "private, no-store",
        },
      });
    }

    const pdf = await ofertaAPdf(oferta.contenido, oferta.empresa, oferta.maestroId);

    if (parametros.get("emitir") === "1" && oferta.estado !== "emitida") {
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
