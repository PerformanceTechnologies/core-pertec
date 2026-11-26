import { NextResponse } from "next/server";
import { cotizacionPublica } from "@/lib/fin/cotizacion-enlace";
import { cotizacionAPdf, nombreArchivoCotizacion } from "@/lib/fin/cotizacion-pdf";

export const runtime = "nodejs";
// Levanta Chromium para imprimir: igual que el PDF de la cotización dentro del Core.
export const maxDuration = 60;

/** El PDF de la cotización del enlace (para el cliente, sin sesión: lo autoriza el código del enlace). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cot = await cotizacionPublica(token);
  if (!cot) return NextResponse.json({ error: "Este enlace no es válido." }, { status: 404 });
  try {
    const d = cot.documento;
    const pdf = await cotizacionAPdf(d);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombreArchivoCotizacion(d.numero, d.version, d.cliente?.nombre ?? null))}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[cotizacion-enlace] no se pudo imprimir la cotización:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el PDF." }, { status: 500 });
  }
}
