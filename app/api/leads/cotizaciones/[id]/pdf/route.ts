import { contextoLeadsApi } from "@/lib/fin/datos";
import { cotizacionParaDocumento } from "@/lib/fin/cotizacion-datos";
import { cotizacionAPdf, nombreArchivoCotizacion } from "@/lib/fin/cotizacion-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

/** El PDF de una cotización de la empresa activa. `?descargar=1` lo baja en vez de abrirlo. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoLeadsApi();
  if (!ctx) return new Response("No autorizado", { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Cotización inválida", { status: 400 });
  try {
    const { documento } = await cotizacionParaDocumento(ctx, id);
    const pdf = await cotizacionAPdf(documento);
    const nombre = nombreArchivoCotizacion(documento.numero, documento.version, documento.cliente?.nombre ?? null);
    const ascii = nombre.replace(/[^\w.\- ]+/g, "_");
    const bajar = new URL(request.url).searchParams.get("descargar") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${bajar ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        // Un documento comercial no se cachea en ningún intermediario.
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message.replace(/^\[fin\]\s*/, "") : String(error);
    console.error("[leads] el PDF de la cotización falló:", detalle);
    return new Response(detalle, { status: 500 });
  }
}
