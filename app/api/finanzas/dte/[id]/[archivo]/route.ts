import { NextResponse } from "next/server";
import { contextoFinApi } from "@/lib/fin/datos";
import { archivoEmitido, configuracionDte, obtenerEmision } from "@/lib/fin/dte/servicio";
import { pdfDeBorrador } from "@/lib/fin/dte/vista-previa";
import { NOMBRE_DTE } from "@/lib/fin/dte/modelo";

export const runtime = "nodejs";

/**
 * PDF o XML de un documento emitido por el Core: /api/finanzas/dte/<emisión>/pdf o /xml.
 * Lo entrega SimpleFactura en el momento (el Core no guarda copia). Solo de la empresa activa.
 * /api/finanzas/dte/<emisión>/vista-previa: el PDF de un borrador (sin folio ni timbre, con marca BORRADOR), armado
 * con lo guardado. Solo lee.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; archivo: string }> }) {
  const { id, archivo } = await params;
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id) || (archivo !== "pdf" && archivo !== "xml" && archivo !== "vista-previa")) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (archivo === "vista-previa") {
    const [em, cfg] = await Promise.all([obtenerEmision(ctx.empresa.id, id), configuracionDte(ctx.empresa.id)]);
    if (!em) return NextResponse.json({ error: "No existe" }, { status: 404 });
    try {
      const pdf = await pdfDeBorrador(em.documento, cfg.emisor, cfg.tasaIva);
      const nombre = `${NOMBRE_DTE[em.tipoDte]} - borrador - ${em.receptorNombre ?? em.receptorRut ?? ""}`.replace(/[^\p{L}\p{N} .-]/gu, "").trim();
      return new NextResponse(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre)}.pdf`, "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo armar la vista previa." }, { status: 500 });
    }
  }
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
