"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { contextoFin, revienta } from "@/lib/fin/datos";
import { lineasDeCompra } from "@/lib/fin/oc-datos";
import type { LineaOc, Moneda } from "@/lib/fin/oc-modelo";

export interface OcHistorica {
  id: string;
  codigo: string;
  titulo: string;
  fecha: string | null;
  moneda: Moneda;
  neto: number | null;
  anulada: boolean;
}

export interface DetalleOcHistorica {
  titulo: string;
  atencion: string;
  proveedorCorreo: string;
  moneda: Moneda;
  lineas: LineaOc[];
  entregaLugar: string;
  entregaPlazo: string;
  formaPago: string;
  condicionPagoDias: string;
  observaciones: string;
  condiciones: string;
}

const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

/** Las OC hechas a un proveedor en la empresa activa, de la más nueva a la más antigua. */
export async function historialProveedorAction(proveedorId: string): Promise<{ ok: true; ocs: OcHistorica[] } | { ok: false; error: string }> {
  try {
    if (!uuid(proveedorId)) return { ok: false, error: "Proveedor no válido." };
    const ctx = await contextoFin();
    const { data, error } = await supabaseAdmin
      .from("fin_compras")
      .select("*")
      .eq("empresa_id", ctx.empresa.id)
      .eq("proveedor_id", proveedorId)
      .order("creado_en", { ascending: false })
      .limit(200);
    revienta("leer el historial del proveedor", error);
    const ocs = (data ?? []).map((r: any) => ({
      id: r.id,
      codigo: r.codigo,
      titulo: r.descripcion ?? "",
      fecha: (r.oc_fecha ?? r.creado_en ?? null)?.slice?.(0, 10) ?? null,
      moneda: (r.moneda ?? "CLP") as Moneda,
      neto: r.neto_moneda != null ? Number(r.neto_moneda) : r.neto_cotizado != null ? Number(r.neto_cotizado) : null,
      anulada: r.estado_override === "anulada" || r.estado_override === "rechazada",
    }));
    return { ok: true, ocs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "No se pudo leer el historial." };
  }
}

/** Todo lo que se copia de una OC anterior a una nueva (sin código, aprobaciones ni fechas). */
export async function detalleOcHistoricaAction(id: string): Promise<{ ok: true; detalle: DetalleOcHistorica } | { ok: false; error: string }> {
  try {
    if (!uuid(id)) return { ok: false, error: "OC no válida." };
    const ctx = await contextoFin();
    const { data: r, error } = await supabaseAdmin.from("fin_compras").select("*").eq("id", id).eq("empresa_id", ctx.empresa.id).maybeSingle();
    revienta("leer la OC", error);
    if (!r) return { ok: false, error: "Esa OC no existe." };
    const lineas = await lineasDeCompra(id);
    return {
      ok: true,
      detalle: {
        titulo: r.descripcion ?? "", atencion: r.atencion ?? "", proveedorCorreo: r.proveedor_correo ?? "", moneda: (r.moneda ?? "CLP") as Moneda, lineas,
        entregaLugar: r.entrega_lugar ?? "", entregaPlazo: r.entrega_plazo ?? "", formaPago: r.forma_pago ?? "",
        condicionPagoDias: r.condicion_pago_dias == null ? "" : String(r.condicion_pago_dias), observaciones: r.observaciones_oc ?? "", condiciones: r.condiciones_oc ?? "",
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "No se pudo leer la OC." };
  }
}
