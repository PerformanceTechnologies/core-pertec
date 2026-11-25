import "server-only";
import { odooSearchRead } from "./odoo/cliente";
import { supabaseAdmin } from "./supabase-admin";
import { listarArchivosDeCarpeta, listarCarpetasAnioMes, type ArchivoCarpeta } from "./sharepoint-facturas";
import { nombreArchivoMigrado, nombrePdfMigrado, type MovimientoOdoo, type TipoMigracion } from "./migracion-odoo-facturas";

/**
 * Revisa que la migración desde Odoo (lib/migracion-odoo-facturas.ts) haya quedado bien: por cada
 * documento de Odoo desde una fecha, que su XML esté en SharePoint (y no vacío) y que esté en el
 * índice del Core con los mismos datos que en Odoo (folio, tipo, fecha, RUT y monto), y que su PDF
 * esté al lado (no vacío). Solo lee.
 */

const ETIQUETA_TIPO_COMPRA: Record<string, string> = { "33": "Factura", "34": "Factura", "46": "Factura", "56": "Nota de Débito", "61": "Nota de Crédito", "52": "Guía de Despacho", "39": "Boleta", "41": "Boleta" };
const rutNormal = (r: unknown) => String(r ?? "").replace(/[^0-9kK]/g, "").toUpperCase().replace(/^0+/, "");

interface MovimientoVerificar extends MovimientoOdoo {
  name: string;
  amount_total: number;
  partner_id: [number, string] | false;
}

export interface Diferencia {
  campo: string;
  odoo: string;
  core: string;
}

export interface FilaVerificacion {
  odooId: number;
  documento: string;
  socio: string;
  fecha: string;
  monto: number;
  archivo: string;
  estado: "ok" | "falta en SharePoint" | "archivo vacío" | "falta el PDF" | "falta en el Core" | "datos distintos";
  diferencias: Diferencia[];
}

export interface ResultadoVerificacion {
  tipo: TipoMigracion;
  desde: string;
  enOdoo: number;
  odooSinXml: number;
  ok: number;
  problemas: FilaVerificacion[];
  /** Por mes: cuántos hay en Odoo, en SharePoint (de la migración) y en el Core. */
  porMes: { mes: string; odoo: number; sharepoint: number; core: number; montoOdoo: number; montoCore: number }[];
  /** Archivos de la carpeta de esos meses que no corresponden a ningún documento de Odoo (informativo). */
  extrasEnSharepoint: string[];
}

export async function verificarMigracionOdoo(tipo: TipoMigracion, desde: string): Promise<ResultadoVerificacion> {
  const tipos = tipo === "ventas" ? ["out_invoice", "out_refund"] : ["in_invoice", "in_refund"];
  const estado = tipo === "ventas" ? ["state", "=", "posted"] : ["state", "!=", "cancel"];
  const base = [["move_type", "in", tipos], estado, ["invoice_date", ">=", desde]];

  const [movs, sinXml] = await Promise.all([
    odooSearchRead<MovimientoVerificar>(
      "account.move",
      [...base, ["l10n_cl_dte_file", "!=", false]],
      ["name", "invoice_date", "amount_total", "partner_id", "l10n_latam_document_type_id_code", "l10n_latam_document_number", "partner_id_vat", "l10n_cl_dte_file"],
      { order: "invoice_date asc, id asc" },
    ),
    odooSearchRead<{ id: number }>("account.move", [...base, ["l10n_cl_dte_file", "=", false]], ["id"]),
  ]);

  // SharePoint: los archivos de cada mes desde la fecha.
  const [anioDesde, mesDesde] = desde.split("-").map(Number);
  const carpetas = (await listarCarpetasAnioMes(tipo)).filter((c) => c.anio * 100 + c.mes >= anioDesde * 100 + mesDesde);
  const archivos = new Map<string, ArchivoCarpeta & { mes: string }>();
  await Promise.all(
    carpetas.map(async (c) => {
      for (const a of await listarArchivosDeCarpeta(c.itemId)) archivos.set(a.nombre, { ...a, mes: `${c.anio}-${String(c.mes).padStart(2, "0")}` });
    }),
  );

  // Core: las filas del índice de esos archivos.
  const tabla = tipo === "ventas" ? "facturas_venta_historico" : "facturas_compra_historico";
  const columnas =
    tipo === "ventas" ? "drive_item_id, folio, tipo_dte, fecha_emision, monto_total, rut_receptor" : "drive_item_id, folio, tipo_documento_detectado, fecha_emision, monto_total, rut_emisor";
  const ids = [...archivos.values()].map((a) => a.id);
  const filasCore = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseAdmin.from(tabla).select(columnas).in("drive_item_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as unknown as Record<string, unknown>[]) filasCore.set(String(f.drive_item_id), f);
  }

  const resultado: ResultadoVerificacion = { tipo, desde, enOdoo: movs.length, odooSinXml: sinXml.length, ok: 0, problemas: [], porMes: [], extrasEnSharepoint: [] };
  const meses = new Map<string, ResultadoVerificacion["porMes"][number]>();
  const mesDe = (k: string) => {
    if (!meses.has(k)) meses.set(k, { mes: k, odoo: 0, sharepoint: 0, core: 0, montoOdoo: 0, montoCore: 0 });
    return meses.get(k)!;
  };
  const usados = new Set<string>();

  for (const m of movs) {
    const nombre = nombreArchivoMigrado(tipo, m);
    const fecha = String(m.invoice_date || "");
    const mes = mesDe(fecha.slice(0, 7));
    mes.odoo++;
    mes.montoOdoo += m.amount_total;
    const fila: FilaVerificacion = {
      odooId: m.id,
      documento: m.name,
      socio: m.partner_id ? m.partner_id[1] : "-",
      fecha,
      monto: m.amount_total,
      archivo: nombre,
      estado: "ok",
      diferencias: [],
    };
    const archivo = archivos.get(nombre);
    if (!archivo) {
      fila.estado = "falta en SharePoint";
      resultado.problemas.push(fila);
      continue;
    }
    usados.add(nombre);
    mes.sharepoint++;
    if (!archivo.tamano) {
      fila.estado = "archivo vacío";
      resultado.problemas.push(fila);
      continue;
    }
    const pdf = archivos.get(nombrePdfMigrado(nombre));
    if (pdf) usados.add(pdf.nombre);
    if (!pdf || !pdf.tamano) {
      fila.estado = "falta el PDF";
      resultado.problemas.push(fila);
      continue;
    }
    const core = filasCore.get(archivo.id);
    if (!core) {
      fila.estado = "falta en el Core";
      resultado.problemas.push(fila);
      continue;
    }
    mes.core++;
    mes.montoCore += Number(core.monto_total ?? 0);

    const comparar = (campo: string, odoo: unknown, enCore: unknown, iguales: boolean) => {
      if (!iguales) fila.diferencias.push({ campo, odoo: String(odoo ?? "-"), core: String(enCore ?? "-") });
    };
    const folioOdoo = Number(m.l10n_latam_document_number);
    comparar("Folio", folioOdoo, core.folio, Number(core.folio) === folioOdoo);
    if (tipo === "ventas") {
      comparar("Tipo", m.l10n_latam_document_type_id_code, core.tipo_dte, String(core.tipo_dte) === String(m.l10n_latam_document_type_id_code));
      comparar("RUT cliente", m.partner_id_vat, core.rut_receptor, rutNormal(core.rut_receptor) === rutNormal(m.partner_id_vat));
    } else {
      const etiqueta = ETIQUETA_TIPO_COMPRA[String(m.l10n_latam_document_type_id_code)] ?? "Factura";
      comparar("Tipo", etiqueta, core.tipo_documento_detectado, core.tipo_documento_detectado === etiqueta);
      comparar("RUT proveedor", m.partner_id_vat, core.rut_emisor, rutNormal(core.rut_emisor) === rutNormal(m.partner_id_vat));
    }
    comparar("Fecha", fecha, core.fecha_emision, String(core.fecha_emision ?? "").slice(0, 10) === fecha);
    comparar("Monto total", Math.round(m.amount_total), core.monto_total, Math.round(Number(core.monto_total)) === Math.round(m.amount_total));

    if (fila.diferencias.length > 0) {
      fila.estado = "datos distintos";
      resultado.problemas.push(fila);
    } else resultado.ok++;
  }

  // Los que la migración no subió pero están en esas carpetas: lo que ya había, o subidos a mano.
  resultado.extrasEnSharepoint = [...archivos.keys()].filter((n) => !usados.has(n)).sort();
  resultado.porMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  return resultado;
}
