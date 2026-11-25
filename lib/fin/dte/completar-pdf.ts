import "server-only";
import { supabaseAdmin } from "../../supabase-admin";
import { bajarDeSharePoint, subirASharePoint } from "../../archivos/sharepoint-core";
import { carpetaDte, nombreDte } from "../../archivos/carpetas";
import { odooSearchRead } from "../../odoo/cliente";
import { pdfDesdeXmlDte } from "../../dte-pdf";

// -----------------------------------------------------------------------------
//  Completar el PDF de los documentos del archivo (fin_dte_archivo) que tienen XML pero no PDF.
//
//  De dónde sale el PDF:
//   - Emitidos de la empresa que factura en Odoo (PERTEC): el PDF oficial que generó Odoo, si existe.
//   - Todo lo demás (recibidos, histórico, emitidos sin PDF en Odoo): uno armado desde el XML
//     (lib/dte-pdf.ts), con los mismos datos del documento.
//  Se sube a la misma carpeta del documento en SharePoint y se anota en la fila (pdf_ref). Solo
//  completa lo que falta: nunca reemplaza ni borra un PDF que ya estaba.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const soloRut = (r: string | null | undefined) => (r ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
const RUT_ODOO = soloRut(process.env.SII_RUT_EMPRESA ?? "77590967-6");

export interface PendientesPdf {
  emitidos: number;
  recibidos: number;
}

/** Cuántos documentos de la empresa tienen XML pero no PDF. */
export async function contarSinPdf(empresaId: string): Promise<PendientesPdf> {
  const contar = async (clase: "emitido" | "recibido") => {
    const { count, error } = await supabaseAdmin
      .from("fin_dte_archivo")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("clase", clase)
      .not("xml_ref", "is", null)
      .is("pdf_ref", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [emitidos, recibidos] = await Promise.all([contar("emitido"), contar("recibido")]);
  return { emitidos, recibidos };
}

/** Los PDF que Odoo tiene de las ventas: «tipo|folio» → id del adjunto (y el RUT del cliente). */
async function pdfsDeOdoo(): Promise<Map<string, { adjunto: number; rut: string }>> {
  const movs = await odooSearchRead<{ l10n_latam_document_type_id_code: string | false; l10n_latam_document_number: string | false; partner_id_vat: string | false; invoice_pdf_report_id: [number, string] | false }>(
    "account.move",
    [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["invoice_pdf_report_id", "!=", false]],
    ["l10n_latam_document_type_id_code", "l10n_latam_document_number", "partner_id_vat", "invoice_pdf_report_id"],
  );
  const mapa = new Map<string, { adjunto: number; rut: string }>();
  for (const m of movs) {
    if (!m.invoice_pdf_report_id || !m.l10n_latam_document_type_id_code || !m.l10n_latam_document_number) continue;
    mapa.set(`${m.l10n_latam_document_type_id_code}|${Number(m.l10n_latam_document_number)}`, { adjunto: m.invoice_pdf_report_id[0], rut: soloRut(m.partner_id_vat || "") });
  }
  return mapa;
}

export interface ResultadoTanda {
  completados: number;
  deOdoo: number;
  armados: number;
  errores: string[];
  /** Para pedir la tanda siguiente; null si no quedan. */
  cursor: string | null;
}

/**
 * Completa el PDF de una tanda de documentos (los siguientes al `cursor`, en orden de id), cuidando
 * no pasarse del tiempo de la función. Los que fallan se anotan y se siguen saltando con el cursor.
 */
export async function completarPdfs(
  empresa: { id: string; nombre: string; rut: string | null },
  opciones: { clase: "emitido" | "recibido"; cursor?: string | null; lote?: number; hasta?: number },
): Promise<ResultadoTanda> {
  let q = supabaseAdmin
    .from("fin_dte_archivo")
    .select("id, clase, tipo_dte, folio, fecha, rut_contraparte, nombre_contraparte, xml_ref, ruta")
    .eq("empresa_id", empresa.id)
    .eq("clase", opciones.clase)
    .not("xml_ref", "is", null)
    .is("pdf_ref", null)
    .order("id")
    .limit(opciones.lote ?? 15);
  if (opciones.cursor) q = q.gt("id", opciones.cursor);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as any[];

  const r: ResultadoTanda = { completados: 0, deOdoo: 0, armados: 0, errores: [], cursor: null };
  const usaOdoo = opciones.clase === "emitido" && soloRut(empresa.rut) === RUT_ODOO;
  const odoo = usaOdoo ? await pdfsDeOdoo() : new Map<string, { adjunto: number; rut: string }>();

  for (const f of filas) {
    if (opciones.hasta && Date.now() > opciones.hasta) break;
    r.cursor = f.id;
    const nombre = nombreDte({ clase: f.clase, tipoDte: f.tipo_dte, folio: f.folio, fecha: f.fecha, contraparte: f.nombre_contraparte, rut: f.rut_contraparte || null });
    try {
      let pdf: Buffer | null = null;
      let deOdoo = false;
      const enOdoo = odoo.get(`${f.tipo_dte}|${Number(String(f.folio ?? "").replace(/\D/g, ""))}`);
      if (enOdoo && (!enOdoo.rut || !f.rut_contraparte || enOdoo.rut === soloRut(f.rut_contraparte))) {
        const [adj] = await odooSearchRead<{ datas: string | false }>("ir.attachment", [["id", "=", enOdoo.adjunto]], ["datas"]);
        if (adj?.datas) {
          pdf = Buffer.from(adj.datas, "base64");
          deOdoo = true;
        }
      }
      if (!pdf) {
        const xml = (await bajarDeSharePoint(f.xml_ref)).contenido;
        const armado = await pdfDesdeXmlDte(xml, { folio: f.folio, tipoDte: f.tipo_dte, rutPropio: empresa.rut });
        if (!armado) throw new Error("el XML no trae un documento legible");
        pdf = Buffer.from(armado);
      }
      const carpeta = f.ruta || carpetaDte(`Gestion financiera/${empresa.nombre}/Facturas`, f.clase, f.fecha);
      const ref = await subirASharePoint(carpeta, `${nombre}.pdf`, pdf, "application/pdf", false);
      const { error: e } = await supabaseAdmin.from("fin_dte_archivo").update({ pdf_ref: ref, actualizado_en: new Date().toISOString() }).eq("id", f.id).is("pdf_ref", null);
      if (e) throw new Error(`se subió pero no se pudo anotar: ${e.message}`);
      r.completados++;
      if (deOdoo) r.deOdoo++;
      else r.armados++;
    } catch (e) {
      r.errores.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Si la tanda vino llena (o se cortó por tiempo) puede quedar más; si no, se terminó.
  const cortada = r.cursor !== null && filas.length > 0 && r.cursor !== filas[filas.length - 1].id;
  if (!cortada && filas.length < (opciones.lote ?? 15)) r.cursor = null;
  return r;
}
