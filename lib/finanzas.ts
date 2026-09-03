import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { FacturaSii } from "./sii-rcv";

export interface FacturaSiiFila {
  id: string;
  tipo_documento: "compra" | "venta";
  codigo_dte: number;
  estado: "registro" | "pendiente" | "no_incluir" | "reclamado" | "aceptado";
  rut_contraparte: string;
  razon_social: string | null;
  folio: number;
  fecha_docto: string | null;
  fecha_recepcion: string | null;
  /** Acuse de recibo del receptor. Solo ventas. */
  fecha_acuse: string | null;
  /** Reclamo del receptor. Solo ventas: de acá sale estado = reclamado. */
  fecha_reclamo: string | null;
  monto_exento: number | null;
  monto_neto: number | null;
  monto_iva_recuperable: number | null;
  monto_iva_no_recuperable: number | null;
  monto_total: number | null;
  periodo: string;
  creado_en: string;
  actualizado_en: string;
}

export async function listarFacturasSii(limite = 300): Promise<FacturaSiiFila[]> {
  const { data } = await supabaseAdmin
    .from("facturas_sii")
    .select("*")
    .order("fecha_docto", { ascending: false })
    .order("folio", { ascending: false })
    .limit(limite);
  return (data ?? []) as FacturaSiiFila[];
}

// Solo la ultima corrida EXITOSA: los fallos se avisan por correo a
// soporte@pertec.cl, nunca se muestran en el dashboard.
export async function obtenerUltimaEjecucionExitosa(): Promise<{
  ejecutado_en: string;
} | null> {
  const { data } = await supabaseAdmin
    .from("finanzas_sii_ejecuciones")
    .select("ejecutado_en")
    .eq("exito", true)
    .order("ejecutado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Upsert por la clave natural (tipo_documento, codigo_dte, rut_contraparte,
// folio): re-ejecutar la misma ventana de dias no debe duplicar filas, y si
// el estado de un documento cambio (ej. de "pendiente" a "registro") se
// actualiza en vez de insertar una fila nueva.
export async function guardarFacturasSii(filas: FacturaSii[]): Promise<number> {
  if (filas.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("facturas_sii")
    .upsert(
      filas.map((f) => ({
        tipo_documento: f.tipoDocumento,
        codigo_dte: f.codigoDte,
        estado: f.estado,
        rut_contraparte: f.rutContraparte,
        razon_social: f.razonSocial,
        folio: f.folio,
        fecha_docto: f.fechaDocto,
        fecha_recepcion: f.fechaRecepcion,
        fecha_acuse: f.fechaAcuse,
        fecha_reclamo: f.fechaReclamo,
        monto_exento: f.montoExento,
        monto_neto: f.montoNeto,
        monto_iva_recuperable: f.montoIvaRecuperable,
        monto_iva_no_recuperable: f.montoIvaNoRecuperable,
        monto_total: f.montoTotal,
        periodo: f.periodo,
        actualizado_en: new Date().toISOString(),
      })),
      { onConflict: "tipo_documento,codigo_dte,rut_contraparte,folio", count: "exact" }
    );

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}

/**
 * Las ventas que aparecen reclamadas y que NO estaban reclamadas en la base.
 *
 * Se consulta ANTES de guardar, porque después de guardar ya no se puede saber si el
 * reclamo es nuevo. Y "nuevo" es lo único que sirve para avisar: el reclamo se queda en
 * el RCV hasta que el cliente lo revierta, así que sin esta comparación cada corrida
 * mandaría de nuevo el mismo correo y en una semana nadie lo abre.
 *
 * Solo ventas: en compra el reclamo lo hace PERTEC, así que no es una novedad que haya
 * que avisarle a nadie.
 */
export async function reclamosNuevosDeVenta(filas: FacturaSii[]): Promise<FacturaSii[]> {
  const reclamadas = filas.filter((f) => f.tipoDocumento === "venta" && f.estado === "reclamado");
  if (reclamadas.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("facturas_sii")
    .select("codigo_dte, rut_contraparte, folio, estado")
    .eq("tipo_documento", "venta")
    .in(
      "folio",
      reclamadas.map((f) => f.folio),
    );

  // La clave natural completa, la misma del upsert: dos empresas distintas pueden
  // emitir el mismo folio en tipos de documento distintos.
  const clave = (f: { codigo_dte: number; rut_contraparte: string; folio: number }) =>
    `${f.codigo_dte}|${f.rut_contraparte}|${f.folio}`;
  const yaReclamadas = new Set(
    (data ?? []).filter((f) => f.estado === "reclamado").map((f) => clave(f as never)),
  );

  return reclamadas.filter(
    (f) => !yaReclamadas.has(clave({ codigo_dte: f.codigoDte, rut_contraparte: f.rutContraparte, folio: f.folio })),
  );
}

export async function registrarEjecucion(
  exito: boolean,
  documentosNuevos: number,
  mensajeError?: string,
  /**
   * Qué ofreció el RCV, cuando ninguna venta trajo estado.
   *
   * Va acá y no en un log porque un log de Vercel se rota y no se puede consultar desde
   * la base. El estado de las ventas se derivó dos veces de columnas supuestas; esto es
   * para poder MIRAR qué trae el SII en vez de deducirlo. Solo rótulos de columna y de
   * pestaña: ningún valor de ninguna fila.
   */
  diagnostico?: unknown,
): Promise<void> {
  const { error } = await supabaseAdmin.from("finanzas_sii_ejecuciones").insert({
    exito,
    documentos_nuevos: documentosNuevos,
    mensaje_error: mensajeError ?? null,
    diagnostico: diagnostico ?? null,
  });
  if (error) throw new Error(error.message);
}
