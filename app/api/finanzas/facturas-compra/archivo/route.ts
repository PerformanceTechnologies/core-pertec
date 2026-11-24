import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { descargarBinarioArchivo } from "@/lib/sharepoint-facturas";
import { parsearXmlDte } from "@/lib/xml-dte";
import { pdfDesdeDte } from "@/lib/dte-pdf";

const normalizarRut = (rut: string | null | undefined) => (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
const RUT_PROPIO = process.env.SII_RUT_EMPRESA ?? "77590967-6";

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

  // La página exige además el subpanel "facturas-historicas" (el admin pasa siempre):
  // sin esta misma regla acá, quien no lo tiene igual podía llamar la API a mano.
  if (
    acceso.usuario.rol !== "admin" &&
    !(await usuarioPuedeVerSubpanelFinanzas(acceso.usuario.id, "facturas-historicas"))
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta el parametro id" }, { status: 400 });
  }

  try {
    const buffer = await descargarBinarioArchivo(id);
    const esXml = buffer.subarray(0, 200).toString("latin1").trimStart().startsWith("<");

    const params = request.nextUrl.searchParams;
    // Un XML (los documentos que vienen de Odoo no traen PDF) se muestra como un PDF armado con
    // sus datos; con ?descargar=1 se entrega el XML original.
    if (esXml && params.get("descargar") !== "1") {
      const dtes = parsearXmlDte(buffer.toString("latin1"));
      const dte = dtes.find((d) => normalizarRut(d.rutReceptor) === normalizarRut(RUT_PROPIO)) ?? dtes[0];
      if (dte) {
        return new NextResponse(new Uint8Array(await pdfDesdeDte(dte)), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600" },
        });
      }
    }

    const nombre = params.get("nombre")?.replace(/[^\w.-]/g, "_") || "documento.xml";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": esXml ? "application/xml; charset=ISO-8859-1" : "application/pdf",
        // El XML se descarga; el PDF se muestra en el visor del navegador.
        "Content-Disposition": esXml ? `attachment; filename="${nombre}"` : "inline",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
