import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ContextoFin } from "@/lib/fin/datos";

export interface ItemSolicitud {
  descripcion: string;
  cantidad: number;
  unidad: string;
}

export interface SolicitudCotizacion {
  id: string;
  codigo: string;
  contactoId: string | null;
  contactoNombre: string | null;
  oportunidadId: string | null;
  oportunidadCodigo: string | null;
  correo: string;
  asunto: string;
  items: ItemSolicitud[];
  responderAntes: string | null;
  estado: "enviada" | "recibida" | "cerrada";
  compraId: string | null;
  creadoPor: string | null;
  creadoEn: string;
}

const a = (r: any, contactos: Map<string, string>, ops: Map<string, string>): SolicitudCotizacion => ({
  id: r.id, codigo: r.codigo, contactoId: r.contacto_id, contactoNombre: r.contacto_id ? contactos.get(r.contacto_id) ?? null : null,
  oportunidadId: r.oportunidad_id, oportunidadCodigo: r.oportunidad_id ? ops.get(r.oportunidad_id) ?? null : null,
  correo: r.correo, asunto: r.asunto, items: Array.isArray(r.items) ? r.items : [], responderAntes: r.responder_antes, estado: r.estado,
  compraId: r.compra_id, creadoPor: r.creado_por, creadoEn: r.creado_en,
});

async function nombres(filas: any[]) {
  const cIds = [...new Set(filas.map((r) => r.contacto_id).filter(Boolean))];
  const oIds = [...new Set(filas.map((r) => r.oportunidad_id).filter(Boolean))];
  const [c, o] = await Promise.all([
    cIds.length ? supabaseAdmin.from("finanzas_contactos").select("id, razon_social").in("id", cIds) : Promise.resolve({ data: [] as any[] }),
    oIds.length ? supabaseAdmin.from("fin_oportunidades").select("id, codigo, nombre").in("id", oIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  return {
    contactos: new Map<string, string>((c.data ?? []).map((x: any) => [x.id, x.razon_social])),
    ops: new Map<string, string>((o.data ?? []).map((x: any) => [x.id, `${x.codigo} · ${x.nombre}`])),
  };
}

/** Las últimas solicitudes de la empresa. Si el SQL 0009 no se ha corrido, devuelve null. */
export async function listarSolicitudesCotizacion(ctx: ContextoFin, oportunidadId?: string): Promise<SolicitudCotizacion[] | null> {
  let q = supabaseAdmin.from("fin_solicitudes_cotizacion").select("*").eq("empresa_id", ctx.empresa.id).order("creado_en", { ascending: false }).limit(100);
  if (oportunidadId) q = q.eq("oportunidad_id", oportunidadId);
  const { data, error } = await q;
  if (error) return null;
  const { contactos, ops } = await nombres(data ?? []);
  return (data ?? []).map((r) => a(r, contactos, ops));
}

export async function solicitudCotizacion(ctx: ContextoFin, id: string): Promise<SolicitudCotizacion | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabaseAdmin.from("fin_solicitudes_cotizacion").select("*").eq("id", id).eq("empresa_id", ctx.empresa.id).maybeSingle();
  if (!data) return null;
  const { contactos, ops } = await nombres([data]);
  return a(data, contactos, ops);
}
