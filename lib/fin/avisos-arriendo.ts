import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import { enviarCorreoAUsuario } from "../notificaciones";
import { RUTA_VENTAS } from "./datos";

// Avisos de vencimiento de arriendos (como las alarmas de Odoo). Un proceso diario (app/api/cron/avisos-arriendo) le
// manda a las personas elegidas en Configuración › Avisos de arriendo un correo por cada hito de arriendo que:
//  · está por vencer (faltan N días; una vez por fecha de vencimiento),
//  · vence hoy (una vez),
//  · ya venció (todos los días, hasta que el hito quede «terminado» o se facture).
// Ninguno si el hito ya tiene una factura vigente (DTE 33, 34, 30 o 32), igual que Hito.factura en lib/fin/datos.ts.
// Tablas: supabase/fin/0022_avisos_arriendo.sql.

const URL_CORE = "https://core.pertec.cl";
const TIPOS_FACTURA = [33, 34, 30, 32];
export const FALTA_SQL_AVISOS = "Falta correr el SQL supabase/fin/0022_avisos_arriendo.sql.";

export type TipoAviso = "antes" | "hoy" | "vencido";

export interface ConfigAvisosArriendo {
  activo: boolean;
  diasAntes: number;
  avisoHoy: boolean;
  avisoVencido: boolean;
  destinatarios: string[]; // usuarios.id
}

export const CONFIG_POR_OMISION: ConfigAvisosArriendo = { activo: true, diasAntes: 3, avisoHoy: true, avisoVencido: true, destinatarios: [] };

/** La configuración de la empresa. null si falta el SQL (la pestaña lo avisa). */
export async function configAvisosArriendo(empresaId: string): Promise<ConfigAvisosArriendo | null> {
  const { data, error } = await supabaseAdmin.from("fin_avisos_arriendo").select("*").eq("empresa_id", empresaId).maybeSingle();
  if (error) return null;
  if (!data) return { ...CONFIG_POR_OMISION };
  return { activo: data.activo, diasAntes: data.dias_antes, avisoHoy: data.aviso_hoy, avisoVencido: data.aviso_vencido, destinatarios: (data.destinatarios ?? []) as string[] };
}

export async function guardarConfigAvisosArriendo(empresaId: string, c: ConfigAvisosArriendo, por: string): Promise<void> {
  const { error } = await supabaseAdmin.from("fin_avisos_arriendo").upsert(
    {
      empresa_id: empresaId, activo: c.activo, dias_antes: c.diasAntes, aviso_hoy: c.avisoHoy, aviso_vencido: c.avisoVencido,
      destinatarios: c.destinatarios, actualizado_por: por, actualizado_en: new Date().toISOString(),
    },
    { onConflict: "empresa_id" },
  );
  if (error) throw new Error(/fin_avisos_arriendo/.test(error.message) ? FALTA_SQL_AVISOS : error.message);
}

// ---------- El correo ------------------------------------------------------------------

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface DatosAviso {
  hitoId: string;
  codigo: string;
  empresa: string; // el cliente del hito
  dias: number; // días que faltan (solo para «antes»)
}

export function correoAviso(tipo: TipoAviso, d: DatosAviso): { asunto: string; html: string } {
  const cuando = tipo === "antes" ? `vence en ${d.dias} ${d.dias === 1 ? "día" : "días"}` : tipo === "hoy" ? "vence hoy" : "ya venció";
  const asunto =
    tipo === "antes" ? `Recordatorio: arriendo de equipo, Hito ${d.codigo}, ${cuando}`
    : tipo === "hoy" ? `Aviso: arriendo de equipo, Hito ${d.codigo}, vence hoy`
    : `Arriendo de equipo, Hito ${d.codigo}, vencido`;
  const url = `${URL_CORE}${RUTA_VENTAS}/hito/${d.hitoId}`;
  const p = (t: string) => `<p style="margin:0 0 14px 0">${t}</p>`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#171411">${[
    p("Estimados,"),
    p(`Les informamos que el arriendo de equipo a <b>${escapar(d.empresa)}</b>, correspondiente al Hito <b>${escapar(d.codigo)}</b>, ${cuando}.`),
    p(`Pueden revisar el detalle del hito en el siguiente enlace:<br><a href="${url}" style="color:#c2410c">${url}</a>`),
    p("Favor revisar el estado del hito en el Core y actualizarlo según corresponda."),
    p("Saludos cordiales,<br>Sistema Core"),
    `<p style="margin:0;font-size:12px;color:#8a8178">Este es un mensaje automático.</p>`,
  ].join("")}</div>`;
  return { asunto, html };
}

// ---------- Qué hitos tocan hoy ------------------------------------------------------------

export interface AvisoPendiente extends DatosAviso {
  tipo: TipoAviso;
  clave: string; // la fecha de vencimiento (antes / hoy) o el día de hoy (vencido)
  vence: string;
}

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** Los avisos que corresponden hoy para la empresa (sin mirar si ya se enviaron). */
export async function avisosDeHoy(empresaId: string, c: ConfigAvisosArriendo, hoy: string): Promise<AvisoPendiente[]> {
  const limite = new Date(Date.parse(`${hoy}T00:00:00Z`) + c.diasAntes * 86_400_000).toISOString().slice(0, 10);
  const { data: hitos, error } = await supabaseAdmin
    .from("fin_hitos")
    .select("id, codigo, cliente_id, periodo_hasta, estado_trabajo")
    .eq("empresa_id", empresaId)
    .eq("tipo", "arriendo")
    .eq("anulado", false)
    .not("periodo_hasta", "is", null)
    .lte("periodo_hasta", limite)
    .limit(2000);
  if (error) throw new Error(`No se pudieron leer los hitos de arriendo: ${error.message}`);
  if (!hitos?.length) return [];

  // Los que ya tienen una factura vigente no reciben avisos.
  const ids = hitos.map((h) => h.id as string);
  const facturados = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: enlaces, error: e1 } = await supabaseAdmin.from("fin_documento_hitos").select("hito_id, documento_id").in("hito_id", ids.slice(i, i + 200));
    if (e1) throw new Error(`No se pudieron revisar las facturas de los hitos: ${e1.message}`);
    const docIds = [...new Set((enlaces ?? []).map((x) => x.documento_id as string))];
    if (!docIds.length) continue;
    const { data: docs, error: e2 } = await supabaseAdmin.from("fin_documentos").select("id").in("id", docIds).eq("estado", "vigente").in("tipo_dte", TIPOS_FACTURA);
    if (e2) throw new Error(`No se pudieron revisar las facturas de los hitos: ${e2.message}`);
    const vigentes = new Set((docs ?? []).map((d) => d.id as string));
    for (const x of enlaces ?? []) if (vigentes.has(x.documento_id as string)) facturados.add(x.hito_id as string);
  }

  const clientes = [...new Set(hitos.map((h) => h.cliente_id as string | null).filter((x): x is string => Boolean(x)))];
  const nombres = new Map<string, string>();
  if (clientes.length) {
    const { data } = await supabaseAdmin.from("finanzas_contactos").select("id, razon_social").in("id", clientes);
    for (const x of data ?? []) nombres.set(x.id as string, x.razon_social as string);
  }

  const avisos: AvisoPendiente[] = [];
  for (const h of hitos) {
    if (facturados.has(h.id as string)) continue;
    const vence = String(h.periodo_hasta).slice(0, 10);
    const dias = diasEntre(hoy, vence);
    const base = { hitoId: h.id as string, codigo: h.codigo as string, empresa: (h.cliente_id && nombres.get(h.cliente_id as string)) || "el cliente", dias, vence };
    if (dias > 0 && dias <= c.diasAntes) avisos.push({ ...base, tipo: "antes", clave: vence });
    else if (dias === 0 && c.avisoHoy) avisos.push({ ...base, tipo: "hoy", clave: vence });
    else if (dias < 0 && c.avisoVencido && h.estado_trabajo !== "terminado") avisos.push({ ...base, tipo: "vencido", clave: hoy });
  }
  return avisos.sort((a, b) => a.vence.localeCompare(b.vence));
}

/** Los correos de los destinatarios elegidos que siguen siendo usuarios activos. */
export async function correosDestinatarios(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from("usuarios").select("correo").in("id", ids).eq("activo", true);
  if (error) throw new Error(`No se pudieron leer los destinatarios: ${error.message}`);
  return (data ?? []).map((u) => String(u.correo).toLowerCase()).filter(Boolean);
}

// ---------- La corrida diaria ------------------------------------------------------------

export interface ResultadoCorrida {
  empresa: string;
  enviados: number;
  yaEnviados: number;
  fallidos: number;
  errores: string[];
}

/**
 * Manda los avisos de hoy de todas las empresas con avisos activos y destinatarios. Idempotente: cada aviso se anota
 * ANTES de enviarlo (hito + tipo + clave, único), así dos corridas el mismo día no lo mandan dos veces. Si no le
 * llegó a nadie, la anotación se quita para que la corrida siguiente lo reintente.
 */
export async function correrAvisosArriendo(hoy: string): Promise<ResultadoCorrida[]> {
  const { data: configs, error } = await supabaseAdmin.from("fin_avisos_arriendo").select("*").eq("activo", true);
  if (error) throw new Error(/fin_avisos_arriendo/.test(error.message) ? FALTA_SQL_AVISOS : error.message);
  const resultados: ResultadoCorrida[] = [];
  for (const fila of configs ?? []) {
    const r: ResultadoCorrida = { empresa: fila.empresa_id, enviados: 0, yaEnviados: 0, fallidos: 0, errores: [] };
    resultados.push(r);
    try {
      const c: ConfigAvisosArriendo = { activo: true, diasAntes: fila.dias_antes, avisoHoy: fila.aviso_hoy, avisoVencido: fila.aviso_vencido, destinatarios: fila.destinatarios ?? [] };
      const correos = await correosDestinatarios(c.destinatarios);
      if (!correos.length) continue;
      for (const a of await avisosDeHoy(fila.empresa_id, c, hoy)) {
        const { data: anotado, error: e1 } = await supabaseAdmin
          .from("fin_avisos_arriendo_enviados")
          .insert({ empresa_id: fila.empresa_id, hito_id: a.hitoId, tipo: a.tipo, clave: a.clave, destinatarios: correos })
          .select("id")
          .maybeSingle();
        if (e1) {
          if (e1.code === "23505") r.yaEnviados++;
          else r.errores.push(`${a.codigo}: ${e1.message}`);
          continue;
        }
        const { asunto, html } = correoAviso(a.tipo, a);
        let llegaron = 0;
        for (const correo of correos) {
          try {
            await enviarCorreoAUsuario(correo, asunto, html);
            llegaron++;
          } catch (e) {
            r.errores.push(`${a.codigo} → ${correo}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (llegaron > 0) r.enviados++;
        else {
          r.fallidos++;
          if (anotado?.id) await supabaseAdmin.from("fin_avisos_arriendo_enviados").delete().eq("id", anotado.id);
        }
      }
    } catch (e) {
      r.errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  return resultados;
}
