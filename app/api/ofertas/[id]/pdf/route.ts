import { accesoAOfertaApi, marcarEmitida } from "@/lib/ofertas/datos";
import { ofertaAHtmlConEmpresa, ofertaAPdf } from "@/lib/ofertas/pdf";
import { nombreDeArchivoDeOferta } from "@/lib/ofertas/emision";
import { leerPdfEmitido } from "@/lib/ofertas/pdf-archivo";

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
  const { id } = await params;
  // Un solo guard: sesión, acceso a la app y que la oferta sea de quien la pide.
  // Esta ruta devuelve un PDF o HTML, no JSON: el error va en texto plano.
  const acceso = await accesoAOfertaApi(id);
  if (!acceso.oferta) return new Response(acceso.error, { status: acceso.status });
  const oferta = acceso.oferta;

  const parametros = new URL(request.url).searchParams;

  try {
    if (parametros.get("formato") === "html") {
      const html = await ofertaAHtmlConEmpresa(
        oferta.contenido,
        oferta.empresa,
        oferta.maestroId,
        oferta.logoClienteRuta,
        oferta.imagenes,
      );
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "sandbox",
          "cache-control": "private, no-store",
        },
      });
    }

    // Una oferta emitida devuelve el PDF QUE SE EMITIÓ, no una reimpresión. Es lo que
    // hace que "de solo lectura" valga también para el archivo: si alguien ajusta un
    // maestro, el documento que el cliente recibió no cambia. Sin copia guardada —las
    // emitidas antes de que esto existiera— se imprime, que es lo único posible.
    const congelado = oferta.emision?.pdfRuta ? await leerPdfEmitido(oferta.emision.pdfRuta) : null;
    const pdf =
      congelado ??
      (await ofertaAPdf(
        oferta.contenido,
        oferta.empresa,
        oferta.maestroId,
        oferta.logoClienteRuta,
        oferta.imagenes,
      ));

    if (parametros.get("emitir") === "1" && oferta.estado !== "emitida") {
      await marcarEmitida(id);
    }

    // `?descargar=1` baja el archivo en vez de abrirlo, y con el nombre que sirve
    // para archivarlo: "OS 009-2026 — AXINNTUS.pdf" y no "OS_009_2026.pdf". El
    // nombre va también en RFC 5987 porque los guiones largos y los acentos no
    // sobreviven un `filename=` a secas.
    const nombre = nombreDeArchivoDeOferta(oferta.numeroOferta, oferta.cliente);
    const ascii = nombre.replace(/[^\w.\- ]+/g, "_");
    const disposicion =
      parametros.get("descargar") === "1"
        ? `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`
        : `inline; filename="${ascii}"`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": disposicion,
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
