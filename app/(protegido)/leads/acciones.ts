"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, RUTA_LEADS, actividadesDe, contextoLeads, exigirDeEmpresa, revienta, type Actividad } from "@/lib/fin/datos";
import { cotizacionParaDocumento } from "@/lib/fin/cotizacion-datos";
import { asuntoDeCotizacion, mensajeDeCotizacion } from "@/lib/fin/cotizacion-correo";
import { faltantesDelPerfil } from "@/lib/fin/empresa-perfil";
import { totalesCotizacion } from "@/lib/fin/modelo";
import { clp } from "@/lib/fin/reglas";
import { limpiarDatosParaObservaciones } from "@/lib/fin/cotizacion-ia-datos";
import { generarObservacionesDeArriendo } from "@/lib/fin/cotizacion-ia";

type Fallo = { ok: false; error: string };
const fallo = (e: unknown): Fallo => ({ ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "Ocurrió un error inesperado." });
const uuid = (v: string) => /^[0-9a-f-]{36}$/.test(v);
const TIPOS = ["nota", "llamada", "reunion", "correo"] as const;

/** El historial de un lead (notas, llamadas, reuniones, correos enviados), de la empresa activa. */
export async function actividadesDeLeadAction(id: string): Promise<{ ok: true; actividades: Actividad[] } | Fallo> {
  try {
    if (!uuid(id)) return { ok: false, error: "Lead inválido." };
    const ctx = await contextoLeads();
    await exigirDeEmpresa("fin_oportunidades", id, ctx.empresa.id);
    return { ok: true, actividades: await actividadesDe("oportunidad", id) };
  } catch (e) {
    return fallo(e);
  }
}

/** Anotar algo en un lead: la llamada que se hizo, lo que se habló, un recordatorio. Cuenta como actividad (el lead deja de verse «quieto»). */
export async function registrarActividadLeadAction(id: string, tipo: string, texto: string): Promise<{ ok: true } | Fallo> {
  try {
    if (!uuid(id)) return { ok: false, error: "Lead inválido." };
    const t = texto.replace(/\r/g, "").trim().slice(0, 1000);
    if (!t) return { ok: false, error: "Escribe qué pasó." };
    const ctx = await contextoLeads();
    await exigirDeEmpresa("fin_oportunidades", id, ctx.empresa.id);
    const { error } = await supabaseAdmin.from("fin_actividades").insert({
      empresa_id: ctx.empresa.id, entidad_tipo: "oportunidad", entidad_id: id, tipo: (TIPOS as readonly string[]).includes(tipo) ? tipo : "nota", texto: t, fecha: ctx.hoy, creado_por: ctx.usuario.correo,
    });
    revienta("anotar la actividad", error);
    await supabaseAdmin.from("fin_oportunidades").update({ actualizado_en: new Date().toISOString() }).eq("id", id).eq("empresa_id", ctx.empresa.id);
    revalidatePath(RUTA_LEADS, "layout");
    revalidatePath(RUTA_FIN, "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export interface PreparacionEnvio {
  numero: string;
  total: string;
  para: string;
  asunto: string;
  mensaje: string;
  yaEnviadaA: string | null;
  /** Datos de la empresa que faltan para que el PDF salga completo (aviso, no bloquea). */
  faltantes: string[];
  remitente: string;
}

/** Lo que el diálogo de «Enviar por correo» propone: destinatario, asunto y mensaje salen de la propia cotización. */
export async function prepararEnvioCotizacionAction(id: string): Promise<{ ok: true; envio: PreparacionEnvio } | Fallo> {
  try {
    if (!uuid(id)) return { ok: false, error: "Cotización inválida." };
    const ctx = await contextoLeads();
    const d = await cotizacionParaDocumento(ctx, id);
    if (!["borrador", "enviada"].includes(d.estado)) return { ok: false, error: "Solo se envía una cotización en borrador o ya enviada. Crea una nueva versión." };
    const t = totalesCotizacion(d.documento.lineas, d.documento.tasaIva, d.documento.descuentoGeneral);
    return {
      ok: true,
      envio: {
        numero: d.documento.numero, total: clp(t.total), para: d.correosSugeridos.join(", "), asunto: asuntoDeCotizacion(d.documento), mensaje: mensajeDeCotizacion(d.documento),
        yaEnviadaA: d.enviadaA, faltantes: faltantesDelPerfil(d.perfil), remitente: ctx.usuario.correo,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Redacta con IA las observaciones de una cotización de ARRIENDO, solo con lo que hay en la cotización
 * (equipos, periodo, plazo, pago, vigencia y requisitos). No se envían el cliente ni los montos.
 */
export async function generarObservacionesArriendoAction(json: string): Promise<{ ok: true; texto: string } | Fallo> {
  try {
    await contextoLeads();
    if (json.length > 60_000) return { ok: false, error: "La cotización es demasiado larga para generar las observaciones." };
    let crudo: unknown;
    try {
      crudo = JSON.parse(json);
    } catch {
      return { ok: false, error: "No se pudo leer la cotización." };
    }
    const datos = limpiarDatosParaObservaciones(crudo);
    if (typeof datos === "string") return { ok: false, error: datos };
    return { ok: true, texto: await generarObservacionesDeArriendo(datos) };
  } catch (e) {
    return fallo(e);
  }
}
