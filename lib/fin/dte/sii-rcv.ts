import "server-only";
import { supabaseAdmin } from "../../supabase-admin";
import { claveDocumento, registrarEnLibros, rutLimpio, type DocExterno } from "./libros";

// -----------------------------------------------------------------------------
//  El Registro de Compras y Ventas que el Core lee del SII (facturas_sii, cron /api/cron/finanzas-sii) entra a
//  Facturación: compras a la bandeja de Recibidos (con su plazo de reclamo), ambos al Archivo y, desde el corte, a
//  los libros. Corre al final de cada lectura del SII; no lanza (un problema aquí no tumba la lectura del SII).
//  facturas_sii no tiene empresa: es la del RUT SII_RUT_EMPRESA.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

async function empresaDelSii(): Promise<{ id: string; nombre: string } | null> {
  const propio = rutLimpio(process.env.SII_RUT_EMPRESA ?? "77590967-6");
  const { data } = await supabaseAdmin.from("empresas").select("id, nombre, rut");
  const e = (data ?? []).find((x: any) => rutLimpio(x.rut) === propio);
  return e ? { id: e.id, nombre: e.nombre } : null;
}

export async function integrarRcvSii(): Promise<{ recibidos: number; archivo: number; libros: number } | { error: string }> {
  try {
    const empresa = await empresaDelSii();
    if (!empresa) return { error: "No hay una empresa con el RUT del SII." };
    const filas: any[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await supabaseAdmin.from("facturas_sii").select("*").range(i, i + 999);
      if (error) return { error: error.message };
      filas.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    const docs: DocExterno[] = filas
      .filter((f) => f.estado !== "no_incluir" && f.folio && f.codigo_dte)
      .map((f) => ({
        direccion: f.tipo_documento === "venta" ? "emitido" : "recibido",
        tipoDte: Number(f.codigo_dte),
        folio: String(f.folio),
        fecha: String(f.fecha_docto).slice(0, 10),
        rut: f.rut_contraparte,
        nombre: f.razon_social,
        neto: Number(f.monto_neto ?? 0),
        exento: Number(f.monto_exento ?? 0),
        iva: Number(f.monto_iva_recuperable ?? 0) + Number(f.monto_iva_no_recuperable ?? 0),
        total: Number(f.monto_total ?? 0),
        fechaRecepcion: f.fecha_recepcion ?? null,
      }));

    // 1) Libros (desde el corte).
    const { ids } = await registrarEnLibros(empresa.id, docs, { origen: "sii_rcv", quien: "SII (Registro de Compras y Ventas)" });

    // 2) Bandeja de recibidos (compras), sin pisar la respuesta ni lo que ya trajo el proveedor.
    const compras = docs.filter((d) => d.direccion === "recibido");
    const { data: contactos } = await supabaseAdmin.from("finanzas_contactos").select("id, rut");
    const contactoDe = new Map((contactos ?? []).filter((c: any) => c.rut).map((c: any) => [rutLimpio(c.rut), c.id as string]));
    const bandeja = compras.map((d) => ({
      empresa_id: empresa.id, ambiente: "produccion", tipo_dte: d.tipoDte, folio: d.folio, rut_emisor: rutLimpio(d.rut), razon_social: d.nombre,
      fecha_emision: d.fecha, fecha_recepcion: d.fechaRecepcion, neto: Math.round(d.neto), exento: Math.round(d.exento), iva: Math.round(d.iva), total: Math.round(d.total),
      contraparte_id: contactoDe.get(rutLimpio(d.rut)) ?? null,
      documento_id: ids.get(claveDocumento("recibido", d.tipoDte, d.folio, d.rut)) ?? null, sincronizado_en: new Date().toISOString(),
    }));
    for (let i = 0; i < bandeja.length; i += 500) {
      const { error } = await supabaseAdmin.from("fin_dte_recibidos").upsert(bandeja.slice(i, i + 500), { onConflict: "empresa_id,ambiente,tipo_dte,folio,rut_emisor", ignoreDuplicates: true });
      if (error) return { error: `bandeja: ${error.message}` };
    }

    // 3) Archivo: los que no estén (sin PDF/XML todavía; llegan con SimpleFactura o subiéndolos).
    const { data: ya } = await supabaseAdmin.from("fin_dte_archivo").select("clase, tipo_dte, folio, rut_contraparte, documento_id, id").eq("empresa_id", empresa.id);
    const enArchivo = new Map((ya ?? []).map((x: any) => [claveDocumento(x.clase, x.tipo_dte, x.folio, x.rut_contraparte), x]));
    const nuevas: any[] = [];
    for (const d of docs) {
      const k = claveDocumento(d.direccion, d.tipoDte, d.folio, d.rut);
      const docId = ids.get(k) ?? null;
      const x = enArchivo.get(k);
      if (x) {
        if (!x.documento_id && docId) await supabaseAdmin.from("fin_dte_archivo").update({ documento_id: docId }).eq("id", x.id);
        continue;
      }
      nuevas.push({
        empresa_id: empresa.id, clase: d.direccion, tipo_dte: d.tipoDte, folio: d.folio, fecha: d.fecha, rut_contraparte: rutLimpio(d.rut), nombre_contraparte: d.nombre,
        neto: d.neto, iva: d.iva, exento: d.exento, total: d.total, documento_id: docId, origen: "sii_rcv",
      });
    }
    for (let i = 0; i < nuevas.length; i += 500) {
      const { error } = await supabaseAdmin.from("fin_dte_archivo").insert(nuevas.slice(i, i + 500));
      if (error) return { error: `archivo: ${error.message}` };
    }
    return { recibidos: bandeja.length, archivo: nuevas.length, libros: ids.size };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
