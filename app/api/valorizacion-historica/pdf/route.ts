import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { SLUG_APP_VH, nombrePdf } from "@/lib/valorizacion-historica-modelo";
import { credencialesGraphFacturasConfiguradas, descargarBinarioArchivo, descargarCompraDteSii } from "@/lib/sharepoint-facturas";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * El PDF de un documento del registro, servido desde la carpeta DTE_SII de SharePoint (como el
 * visor de Facturas históricas: el navegador no tiene sesión en ese SharePoint). Se pide por el N°
 * del documento o de la línea, nunca por ruta: la ruta sale de lo que se importó del Excel.
 */
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi(SLUG_APP_VH);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  if (!credencialesGraphFacturasConfiguradas()) {
    return NextResponse.json({ error: "El Core no tiene configurado el acceso a SharePoint." }, { status: 503 });
  }

  const p = request.nextUrl.searchParams;
  const doc = Number(p.get("doc")), linea = Number(p.get("linea"));
  const vista = await cargarVista();
  const ruta = Number.isInteger(doc) && doc > 0
    ? vista.datos.documentos.find((d) => d.n === doc)?.pdf
    : Number.isInteger(linea) && linea > 0
      ? vista.datos.lineas.find((l) => l.n === linea)?.pdf
      : null;
  if (!ruta) return NextResponse.json({ error: "Ese documento no tiene PDF." }, { status: 404 });

  try {
    let buffer: Buffer;
    try {
      buffer = await descargarCompraDteSii(ruta);
    } catch (e) {
      // Si alguien movió el archivo de carpeta, el índice de Facturas históricas lo puede tener igual.
      const { data } = await supabaseAdmin.from("facturas_compra_historico").select("drive_item_id").eq("nombre_archivo", nombrePdf(ruta)).limit(1).maybeSingle();
      if (!data?.drive_item_id) throw e;
      buffer = await descargarBinarioArchivo(data.drive_item_id as string);
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombrePdf(ruta)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: `No se encontró «${nombrePdf(ruta)}» en la carpeta DTE_SII de SharePoint.` }, { status: 404 });
  }
}
