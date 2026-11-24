import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pdfDesdeDte } from "@/lib/dte-pdf";
import type { FacturaVentaFila } from "@/lib/facturas-historicas";

/**
 * El PDF de una factura de venta para el visor de Facturas Históricas. Las ventas se archivan como
 * XML y el índice del Core ya tiene todos sus datos (emisor, receptor, ítems y totales), así que el
 * PDF se arma desde ahí, sin bajar el archivo de SharePoint: abre al instante.
 */
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi("finanzas");
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  if (acceso.usuario.rol !== "admin" && !(await usuarioPuedeVerSubpanelFinanzas(acceso.usuario.id, "facturas-historicas"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el parametro id" }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("facturas_venta_historico").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No existe esa factura" }, { status: 404 });
  const f = data as FacturaVentaFila;

  const pdf = await pdfDesdeDte({
    tipoDte: f.tipo_dte,
    folio: f.folio,
    fechaEmision: f.fecha_emision,
    rutReceptor: f.rut_receptor,
    razonSocialReceptor: f.razon_social_receptor,
    montoExento: f.monto_exento,
    montoNeto: f.monto_neto,
    montoIva: f.monto_iva,
    montoTotal: f.monto_total,
    datos: f.datos,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600" },
  });
}
