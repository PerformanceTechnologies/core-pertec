import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoFinanzasIhApi } from "@/lib/finanzas-ih/autorizacion";
import { descargarBinarioArchivoIh } from "@/lib/finanzas-ih/sharepoint-ih";

// Sirve el PDF de un documento recibido como proxy (via Graph, con las
// credenciales de la app) en vez de embeber el webUrl de SharePoint directo
// en un iframe -- mismo motivo que app/api/finanzas/facturas-compra/archivo:
// el navegador del usuario no tiene sesion en ese tenant, asi que el iframe
// termina redirigiendo a login.microsoftonline.com, que rechaza mostrarse
// dentro de un iframe.
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoFinanzasIhApi();
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta el parametro id" }, { status: 400 });
  }

  try {
    const buffer = await descargarBinarioArchivoIh(id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
