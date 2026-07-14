import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { descargarBinarioArchivo } from "@/lib/sharepoint-facturas";

const SLUG_APP = "finanzas";

// Sirve el PDF como proxy (via Graph, con las credenciales de la app) en vez
// de embeber el webUrl de SharePoint directo en un iframe: el navegador del
// usuario no tiene sesion iniciada en ese tenant de SharePoint, asi que el
// iframe termina redirigiendo a login.microsoftonline.com -- y esa pagina
// de login rechaza ser mostrada dentro de un iframe (proteccion anti-phishing
// de Microsoft, no se puede desactivar). Sirviendo el binario nosotros
// mismos, el navegador lo renderiza con su visor nativo de PDF sin pasar por
// ningun login.
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta el parametro id" }, { status: 400 });
  }

  try {
    const buffer = await descargarBinarioArchivo(id);
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
