import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { FacturaSii } from "./sii-rcv";

export interface FacturaSiiFila {
  id: string;
  tipo_documento: "compra" | "venta";
  codigo_dte: number;
  estado: "registro" | "pendiente" | "no_incluir" | "reclamado";
  rut_contraparte: string;
  razon_social: string | null;
  folio: number;
  fecha_docto: string | null;
  fecha_recepcion: string | null;
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

export async function obtenerUltimaEjecucion(): Promise<{
  ejecutado_en: string;
  exito: boolean;
  documentos_nuevos: number;
  mensaje_error: string | null;
} | null> {
  const { data } = await supabaseAdmin
    .from("finanzas_sii_ejecuciones")
    .select("*")
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

export async function registrarEjecucion(exito: boolean, documentosNuevos: number, mensajeError?: string): Promise<void> {
  const { error } = await supabaseAdmin.from("finanzas_sii_ejecuciones").insert({
    exito,
    documentos_nuevos: documentosNuevos,
    mensaje_error: mensajeError ?? null,
  });
  if (error) throw new Error(error.message);
}
