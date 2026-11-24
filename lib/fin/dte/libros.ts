import "server-only";
import { supabaseAdmin } from "../../supabase-admin";

// -----------------------------------------------------------------------------
//  Documentos tributarios que llegan de afuera (Registro de Compras y Ventas del SII, carga histórica del archivo,
//  subida manual) a los libros de Gestión financiera (fin_documentos) y al archivo (fin_dte_archivo). Solo servidor.
//
//  Reglas:
//   · Solo entran a los libros los documentos desde el CORTE (01-01-2026) y de tipos con dinero (33, 34, 46, 56, 61):
//     lo anterior y las guías quedan en el archivo, para consulta.
//   · Nunca se duplica: la clave es empresa + dirección + tipo + folio + RUT (la misma del unique de fin_documentos).
//     Si el documento ya existe (registrado a mano, emitido por el Core, ya cargado), no se toca.
//   · Lo que entra con fecha anterior a «pendientes desde» (fin_parametros.flags.dte_pendientes_desde) se marca
//     «pagado, por conciliar» (por_conciliar): no cuenta como deuda hasta que se liga al banco o se marca pendiente.
//     Sin esa fecha (aún no se hace la carga histórica), todo entra por conciliar: nunca deuda falsa.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CORTE_LIBROS = "2026-01-01";
const TIPOS_CON_DINERO = new Set([33, 34, 46, 56, 61]);

export const rutLimpio = (r: string | null | undefined): string => {
  const x = (r ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  return x.length < 2 ? "" : `${x.slice(0, -1)}-${x.slice(-1)}`;
};

export interface DocExterno {
  direccion: "emitido" | "recibido";
  tipoDte: number;
  folio: string;
  fecha: string;
  rut: string | null;
  nombre: string | null;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  fechaRecepcion?: string | null;
  /** Folio y tipo de la factura que corrige (NC/ND), si se conoce. */
  refTipo?: number | null;
  refFolio?: string | null;
}

export async function pendientesDesde(empresaId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("fin_parametros").select("flags").eq("empresa_id", empresaId).maybeSingle();
  const v = (data?.flags as Record<string, unknown> | null)?.dte_pendientes_desde;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Registra en fin_documentos los que falten (desde el corte, tipos con dinero). Devuelve cuántos creó y el id de cada
 * clave (existentes y nuevos), para ligar el archivo y la bandeja. `seco` solo cuenta.
 */
export async function registrarEnLibros(
  empresaId: string,
  docs: DocExterno[],
  o: { origen: "historico" | "sii_rcv" | "manual"; quien: string; seco?: boolean },
): Promise<{ creados: number; existentes: number; fuera: number; porConciliar: number; ids: Map<string, string> }> {
  const enLibros = docs.filter((d) => d.fecha >= CORTE_LIBROS && TIPOS_CON_DINERO.has(d.tipoDte) && d.folio);
  const ids = new Map<string, string>();
  // Lo que ya existe (paginado: puede haber miles).
  const existentes: any[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabaseAdmin.from("fin_documentos").select("id, direccion, tipo_dte, folio, rut_contraparte").eq("empresa_id", empresaId).range(i, i + 999);
    if (error) throw new Error(`No se pudieron leer los documentos: ${error.message}`);
    existentes.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  for (const e of existentes) ids.set(clave(e.direccion, e.tipo_dte, e.folio, e.rut_contraparte), e.id);
  const { data: contactos } = await supabaseAdmin.from("finanzas_contactos").select("id, rut");
  const contactoDe = new Map((contactos ?? []).filter((c: any) => c.rut).map((c: any) => [rutLimpio(c.rut), c.id as string]));
  const desde = await pendientesDesde(empresaId);
  const nuevos = new Map<string, DocExterno>();
  for (const d of enLibros) {
    const k = clave(d.direccion, d.tipoDte, d.folio, d.rut);
    if (!ids.has(k) && !nuevos.has(k)) nuevos.set(k, d);
  }
  const porConciliar = (d: DocExterno) => !desde || d.fecha < desde;
  const filas = [...nuevos.values()].map((d) => ({
    empresa_id: empresaId,
    direccion: d.direccion,
    tipo_dte: d.tipoDte,
    folio: String(d.folio).replace(/^0+/, "") || String(d.folio),
    fecha_emision: d.fecha,
    fecha_recepcion: d.fechaRecepcion ? d.fechaRecepcion.slice(0, 10) : null,
    contraparte_id: contactoDe.get(rutLimpio(d.rut)) ?? null,
    rut_contraparte: rutLimpio(d.rut),
    razon_social: d.nombre?.slice(0, 200) ?? null,
    neto: Math.round(d.neto),
    exento: Math.round(d.exento),
    iva: Math.round(d.iva),
    total: Math.round(d.total),
    referencias: d.refFolio ? `${d.refTipo ?? ""} ${d.refFolio}`.trim().slice(0, 500) : null,
    origen: o.origen,
    estado: "vigente",
    por_conciliar: porConciliar(d),
    creado_por: o.quien,
  }));
  const resumen = { creados: filas.length, existentes: enLibros.length - filas.length, fuera: docs.length - enLibros.length, porConciliar: filas.filter((f) => f.por_conciliar).length, ids };
  if (o.seco || !filas.length) return resumen;
  for (let i = 0; i < filas.length; i += 500) {
    const { data, error } = await supabaseAdmin.from("fin_documentos").insert(filas.slice(i, i + 500)).select("id, direccion, tipo_dte, folio, rut_contraparte");
    if (error) throw new Error(`No se pudieron registrar los documentos: ${error.message}`);
    for (const e of data ?? []) ids.set(clave(e.direccion, e.tipo_dte, e.folio, e.rut_contraparte), e.id);
  }
  // NC/ND: se ligan a la factura que corrigen cuando se sabe cuál es (y existe en los libros).
  for (const d of nuevos.values()) {
    if (!(d.tipoDte === 61 || d.tipoDte === 56) || !d.refFolio || !d.refTipo) continue;
    const propio = ids.get(clave(d.direccion, d.tipoDte, d.folio, d.rut));
    const ref = ids.get(clave(d.direccion, d.refTipo, d.refFolio, d.rut));
    if (propio && ref) await supabaseAdmin.from("fin_documentos").update({ documento_referenciado_id: ref }).eq("id", propio);
  }
  return resumen;
}

export { clave as claveDocumento };
function clave(dir: string, tipo: number, folio: string, rut: string | null) {
  return `${dir}|${tipo}|${String(folio).replace(/^0+/, "")}|${rutLimpio(rut)}`;
}
