import { NextResponse } from "next/server";
import { exigirVerDocumento, SinPermisoLegal } from "@/lib/repositorio-legal/datos";
import { enlaceDeDescarga, validarId, vistaPrevia } from "@/lib/repositorio-legal/sharepoint";

export const runtime = "nodejs";

/**
 * Un documento: `?vista=1` devuelve la URL de vista previa de SharePoint (para el visor), y sin
 * parámetros redirige a la descarga directa. Se valida el permiso (confidenciales) y que el archivo
 * esté dentro del repositorio antes de entregar nada.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = validarId((await params).id);
    await exigirVerDocumento(id);
    if (new URL(request.url).searchParams.get("vista") === "1") {
      return NextResponse.json({ url: await vistaPrevia(id) });
    }
    const { url } = await enlaceDeDescarga(id);
    return NextResponse.redirect(url, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo abrir el documento.";
    return NextResponse.json({ error: msg }, { status: e instanceof SinPermisoLegal ? 403 : 404 });
  }
}
