"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, RUTA_LEADS, actividadesDe, auditar, contextoLeads, exigirDeEmpresa, revienta, type Actividad, type ContextoFin } from "@/lib/fin/datos";
import { borrarArchivos } from "@/lib/archivos/almacen";
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

// ---------- Eliminar (solo el administrador del sistema) -------------------------------

/** Solo el rol «admin» del Core. Se exige acá, en el servidor: el botón oculto no protege nada. */
function soloAdmin(ctx: ContextoFin): Fallo | null {
  return ctx.usuario.rol === "admin" ? null : { ok: false, error: "Solo el administrador del sistema puede eliminar." };
}
const refrescar = () => {
  revalidatePath(RUTA_LEADS, "layout");
  revalidatePath(RUTA_FIN, "layout");
};

/**
 * Elimina un lead. No se puede si tiene cotizaciones (hay que eliminarlas antes). Queda en la auditoría con una
 * copia de lo que se borró y el motivo.
 */
export async function eliminarOportunidadAction(id: string, motivo: string): Promise<{ ok: true } | Fallo> {
  try {
    if (!uuid(id)) return { ok: false, error: "Lead inválido." };
    const ctx = await contextoLeads();
    const no = soloAdmin(ctx);
    if (no) return no;
    const razon = motivo.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!razon) return { ok: false, error: "Escribe el motivo de la eliminación." };
    const lead = await exigirDeEmpresa("fin_oportunidades", id, ctx.empresa.id);
    const { data: cots, error: e1 } = await supabaseAdmin.from("fin_cotizaciones").select("numero, version").eq("empresa_id", ctx.empresa.id).eq("oportunidad_id", id).limit(6);
    revienta("revisar sus cotizaciones", e1);
    if (cots && cots.length > 0) {
      const lista = cots.slice(0, 5).map((c) => `${c.numero}${Number(c.version) > 1 ? ` V${c.version}` : ""}`).join(", ");
      return { ok: false, error: `Este lead tiene cotizaciones (${lista}${cots.length > 5 ? "…" : ""}). Elimínalas primero.` };
    }
    await supabaseAdmin.from("fin_actividades").delete().eq("empresa_id", ctx.empresa.id).eq("entidad_tipo", "oportunidad").eq("entidad_id", id);
    const { error } = await supabaseAdmin.from("fin_oportunidades").delete().eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("eliminar el lead", error);
    await auditar(ctx, "fin_oportunidades", id, "eliminar", `Lead ${lead.codigo} «${lead.nombre}» eliminado`, { antes: lead, motivo: razon });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Elimina una cotización con sus líneas, notas y respaldos. Si ya fue aceptada y generó hitos de venta, hay que
 * pedir explícitamente eliminarla CON sus hitos (eliminarCotizacionConHitosAction). Queda en la auditoría con una copia.
 */
export async function eliminarCotizacionAction(id: string, motivo: string): Promise<{ ok: true; mensaje?: string } | Fallo> {
  return eliminarCotizacion(id, motivo, false);
}

/**
 * Elimina una cotización ACEPTADA junto con los hitos de venta que generó (por ejemplo, una de prueba). Solo si
 * ninguno de esos hitos tiene factura u otro documento: lo facturado no se borra, se corrige con notas de crédito.
 */
export async function eliminarCotizacionConHitosAction(id: string, motivo: string): Promise<{ ok: true; mensaje?: string } | Fallo> {
  return eliminarCotizacion(id, motivo, true);
}

async function eliminarCotizacion(id: string, motivo: string, conHitos: boolean): Promise<{ ok: true; mensaje?: string } | Fallo> {
  try {
    if (!uuid(id)) return { ok: false, error: "Cotización inválida." };
    const ctx = await contextoLeads();
    const no = soloAdmin(ctx);
    if (no) return no;
    const razon = motivo.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!razon) return { ok: false, error: "Escribe el motivo de la eliminación." };
    const c = await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id);
    const [{ data: hitos, error: e1 }, { data: hijas, error: e2 }] = await Promise.all([
      supabaseAdmin.from("fin_hitos").select("id, codigo, neto, proyecto_id").eq("empresa_id", ctx.empresa.id).eq("cotizacion_id", id),
      supabaseAdmin.from("fin_cotizaciones").select("numero, version").eq("empresa_id", ctx.empresa.id).eq("padre_id", id).limit(1),
    ]);
    revienta("revisar sus hitos", e1);
    revienta("revisar sus versiones", e2);
    if (hijas && hijas.length > 0) return { ok: false, error: `Tiene una versión posterior (${hijas[0].numero} V${hijas[0].version}). Elimina primero las versiones más nuevas.` };
    const lista = (hitos ?? []).map((h) => h.codigo as string);
    if (lista.length > 0 && !conHitos) {
      return { ok: false, error: `Esta cotización ya fue aceptada y generó ${lista.length} hito(s) de venta (${lista.slice(0, 3).join(", ")}${lista.length > 3 ? "…" : ""}). Para borrarla junto con sus hitos usa «Eliminar cotización y sus hitos». Si el trato es real, en Ventas y cobranza abre el hito y usa «Anular hito».` };
    }
    if (lista.length > 0) {
      // Un hito con factura (o cualquier documento) es un registro financiero real: no se borra.
      const { data: docs, error: e3 } = await supabaseAdmin.from("fin_documento_hitos").select("hito_id").in("hito_id", (hitos ?? []).map((h) => h.id as string)).limit(1);
      revienta("revisar las facturas de sus hitos", e3);
      if (docs && docs.length > 0) return { ok: false, error: "Alguno de sus hitos ya tiene factura u otro documento. Lo facturado no se elimina: corrígelo con una nota de crédito." };
    }

    // Los respaldos (por ejemplo, el PDF que se envió) se van con la cotización, y los de sus hitos con ellos.
    const ids = [id, ...(hitos ?? []).map((h) => h.id as string)];
    const { data: adjuntos } = await supabaseAdmin.from("fin_adjuntos").select("ruta").eq("empresa_id", ctx.empresa.id).in("entidad_id", ids).in("entidad_tipo", ["cotizacion", "hito"]);
    await borrarArchivos("finanzas", (adjuntos ?? []).map((a) => a.ruta as string));
    await supabaseAdmin.from("fin_adjuntos").delete().eq("empresa_id", ctx.empresa.id).in("entidad_id", ids).in("entidad_tipo", ["cotizacion", "hito"]);
    await supabaseAdmin.from("fin_actividades").delete().eq("empresa_id", ctx.empresa.id).in("entidad_id", ids).in("entidad_tipo", ["cotizacion", "hito"]);
    if (lista.length > 0) {
      const { error: eh } = await supabaseAdmin.from("fin_hitos").delete().eq("empresa_id", ctx.empresa.id).eq("cotizacion_id", id);
      revienta("eliminar sus hitos", eh);
    }
    const { error } = await supabaseAdmin.from("fin_cotizaciones").delete().eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("eliminar la cotización", error);
    await auditar(ctx, "fin_cotizaciones", id, "eliminar", `Cotización ${c.numero}${Number(c.version) > 1 ? ` V${c.version}` : ""} «${c.titulo}» eliminada${lista.length ? ` con sus hitos ${lista.join(", ")}` : ""}`, { antes: { cotizacion: c, hitos }, motivo: razon });
    refrescar();
    const proyecto = (hitos ?? []).find((h) => h.proyecto_id)?.proyecto_id ?? c.proyecto_id;
    return { ok: true, mensaje: proyecto ? "Cotización eliminada. Su proyecto sigue creado: si también era de prueba, elimínalo desde la ficha del proyecto (Gestión financiera › Proyectos)." : undefined };
  } catch (e) {
    return fallo(e);
  }
}
