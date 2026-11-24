import { NextResponse } from "next/server";
import { contextoFinApi } from "@/lib/fin/datos";
import { archivoEmitido } from "@/lib/fin/dte/servicio";

export const runtime = "nodejs";

/**
 * PDF o XML de un documento emitido por el Core: /api/finanzas/dte/<emisión>/pdf o /xml.
 * Lo entrega SimpleFactura en el momento (el Core no guarda copia). Solo de la empresa activa.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; archivo: string }> }) {
  const { id, archivo } = await params;
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id) || (archivo !== "pdf" && archivo !== "xml")) return NextResponse.json({ error: "No existe" }, { status: 404 });
  try {
    const { nombre, contenido } = await archivoEmitido(ctx, id, archivo);
    return new NextResponse(new Uint8Array(contenido), {
      headers: {
        "Content-Type": archivo === "pdf" ? "application/pdf" : "application/xml; charset=iso-8859-1",
        "Content-Disposition": `${archivo === "pdf" ? "inline" : "attachment"}; filename="${nombre}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo obtener el archivo." }, { status: 502 });
  }
}
