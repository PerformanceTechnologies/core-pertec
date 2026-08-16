import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoFinanzasIhApi } from "@/lib/finanzas-ih/autorizacion";
import { descargarBinarioArchivoIh } from "@/lib/finanzas-ih/sharepoint-ih";

const TIPOS_CONTENIDO: Record<string, string> = {
  pdf: "application/pdf",
  xml: "application/xml",
};

// Sirve el PDF o XML de un documento como proxy (via Graph, con las
// credenciales de la app) en vez de embeber el webUrl de SharePoint directo
// en un iframe -- mismo motivo que app/api/finanzas/facturas-compra/archivo:
// el navegador del usuario no tiene sesion en ese tenant, asi que el iframe
// termina redirigiendo a login.microsoftonline.com, que rechaza mostrarse
// dentro de un iframe. Con descarga=1 fuerza la descarga (Content-Disposition:
// attachment) en vez de mostrarlo inline -- lo usan el icono de descarga de
// la tabla y los botones "Descargar" de los popups de detalle.
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoFinanzasIhApi();
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta el parametro id" }, { status: 400 });
  }
  const tipo = request.nextUrl.searchParams.get("tipo") === "xml" ? "xml" : "pdf";
  const descarga = request.nextUrl.searchParams.get("descarga") === "1";
  const nombre = (request.nextUrl.searchParams.get("nombre") ?? `documento.${tipo}`).replace(/["\r\n]/g, "");

  try {
    const buffer = await descargarBinarioArchivoIh(id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": TIPOS_CONTENIDO[tipo],
        "Content-Disposition": descarga ? `attachment; filename="${nombre}"` : "inline",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
