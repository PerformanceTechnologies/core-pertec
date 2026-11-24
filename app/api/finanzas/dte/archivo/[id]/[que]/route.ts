import { NextResponse } from "next/server";
import { contextoFinApi } from "@/lib/fin/datos";
import { refArchivo } from "@/lib/fin/dte/archivo";
import { abrirDeSharePoint } from "@/lib/archivos/sharepoint-core";

export const runtime = "nodejs";

/** PDF o XML archivado en SharePoint: /api/finanzas/dte/archivo/<fila>/pdf o /xml. Solo de la empresa activa. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; que: string }> }) {
  const { id, que } = await params;
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id) || (que !== "pdf" && que !== "xml")) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const r = await refArchivo(ctx.empresa.id, id, que);
  if (!r) return NextResponse.json({ error: "Ese documento no tiene ese archivo." }, { status: 404 });
  try {
    const a = await abrirDeSharePoint(r.ref);
    const nombre = encodeURIComponent(r.nombre);
    return new NextResponse(a.respuesta.body, {
      headers: {
        "Content-Type": que === "pdf" ? "application/pdf" : "application/xml",
        "Content-Disposition": `${que === "pdf" ? "inline" : "attachment"}; filename*=UTF-8''${nombre}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo abrir el archivo." }, { status: 502 });
  }
}
