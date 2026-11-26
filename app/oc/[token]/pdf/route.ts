import { NextResponse } from "next/server";
import { ocPublica } from "@/lib/fin/oc-enlace";
import { ocAPdf } from "@/lib/fin/oc-pdf";
import { nombreArchivoOc } from "@/lib/fin/oc-documento";

export const runtime = "nodejs";
// Levanta Chromium para imprimir: igual que el PDF de la OC dentro del Core.
export const maxDuration = 60;

/** El PDF de la OC del enlace (para el proveedor, sin sesión: lo autoriza el código del enlace). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const oc = await ocPublica(token);
  if (!oc) return NextResponse.json({ error: "Este enlace no es válido." }, { status: 404 });
  try {
    const pdf = await ocAPdf(oc.documento);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombreArchivoOc(oc.documento))}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[oc-enlace] no se pudo imprimir la OC:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el PDF." }, { status: 500 });
  }
}
