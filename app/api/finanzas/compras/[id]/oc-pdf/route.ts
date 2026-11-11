import { contextoFinApi } from "@/lib/fin/datos";
import { ocParaDocumento } from "@/lib/fin/oc-datos";
import { ocAPdf } from "@/lib/fin/oc-pdf";
import { nombreArchivoOc } from "@/lib/fin/oc-documento";

export const runtime = "nodejs";
export const maxDuration = 60;

/** El PDF de la OC de una solicitud de la empresa activa. `?descargar=1` lo baja en vez de abrirlo. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contextoFinApi();
  if (!ctx) return new Response("No autorizado", { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Solicitud inválida", { status: 400 });
  try {
    const { documento, formatoOc } = await ocParaDocumento(ctx, id);
    if (!formatoOc) return new Response("Esta compra es anterior al formato de OC: no tiene PDF.", { status: 409 });
    const pdf = await ocAPdf(documento);
    const nombre = nombreArchivoOc(documento);
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
    console.error("[fin] el PDF de la OC falló:", detalle);
    return new Response(detalle, { status: 500 });
  }
}
