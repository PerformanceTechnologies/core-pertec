"use server";

import { revalidatePath } from "next/cache";
import { Client } from "@microsoft/microsoft-graph-client";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { auditar, contextoFin, fechaValida, revienta, siguienteNumero } from "@/lib/fin/datos";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { correosValidos } from "@/lib/ofertas/emision";
import type { ItemSolicitud } from "@/lib/fin/solicitud-cotizacion";

type Resultado = { ok: true; id?: string } | { ok: false; error: string };
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function cuerpoHtml(mensaje: string, items: ItemSolicitud[], responderAntes: string | null): string {
  const parrafos = esc(mensaje).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`).join("");
  const filas = items.map((i, n) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#888">${n + 1}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(i.descripcion)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${i.cantidad} ${esc(i.unidad)}</td></tr>`).join("");
  const tabla = items.length
    ? `<table style="border-collapse:collapse;margin:8px 0 16px;font-size:14px"><thead><tr><th style="padding:6px 10px;text-align:left;color:#888">#</th><th style="padding:6px 10px;text-align:left">Descripción</th><th style="padding:6px 10px;text-align:right">Cantidad</th></tr></thead><tbody>${filas}</tbody></table>`
    : "";
  const plazo = responderAntes ? `<p style="margin:0 0 12px"><b>Agradeceríamos su cotización antes del ${responderAntes.split("-").reverse().join("-")}.</b></p>` : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">${parrafos}${tabla}${plazo}</div>`;
}

/** Envía la solicitud de cotización desde el Outlook de quien la pide y la deja registrada (y en el lead, si viene de uno). */
export async function enviarSolicitudCotizacionAction(json: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const d = JSON.parse(json) as { contactoId?: string; correo?: string; copias?: string; asunto?: string; mensaje?: string; items?: ItemSolicitud[]; responderAntes?: string; oportunidadId?: string };
    const destinatarios = correosValidos(d.correo ?? "");
    const copias = correosValidos(d.copias ?? "");
    if (destinatarios.length === 0) return { ok: false, error: "Escribe al menos un correo válido." };
    const asunto = (d.asunto ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const mensaje = (d.mensaje ?? "").trim().slice(0, 8000);
    if (!asunto) return { ok: false, error: "Falta el asunto." };
    if (!mensaje) return { ok: false, error: "Falta el mensaje." };
    const items = (Array.isArray(d.items) ? d.items : [])
      .map((i) => ({ descripcion: String(i.descripcion ?? "").trim().slice(0, 500), cantidad: Math.max(0, Number(String(i.cantidad).replace(",", ".")) || 0), unidad: String(i.unidad ?? "").trim().slice(0, 20) }))
      .filter((i) => i.descripcion)
      .slice(0, 100);
    if (items.length === 0) return { ok: false, error: "Agrega al menos un ítem a cotizar." };
    const responderAntes = fechaValida(d.responderAntes ?? null);
    const contactoId = uuid(d.contactoId);
    const oportunidadId = uuid(d.oportunidadId);
    if (oportunidadId) {
      const { data: op } = await supabaseAdmin.from("fin_oportunidades").select("id").eq("id", oportunidadId).eq("empresa_id", ctx.empresa.id).maybeSingle();
      if (!op) return { ok: false, error: "Ese lead no existe en esta empresa." };
    }

    // La tabla tiene que existir ANTES de mandar el correo: si no, saldría un correo sin registro.
    const prueba = await supabaseAdmin.from("fin_solicitudes_cotizacion").select("id").limit(1);
    if (prueba.error) return { ok: false, error: "Falta correr el SQL supabase/fin/0009_solicitud_cotizacion.sql." };

    const token = await accessTokenDeUsuario(ctx.usuario.id);
    if (token.estado !== "ok") return { ok: false, error: "Tu cuenta de Microsoft no está conectada. Cierra sesión y vuelve a entrar al Core." };
    try {
      const graph = Client.init({ authProvider: (done) => done(null, token.accessToken) });
      await graph.api("/me/sendMail").post({
        message: {
          subject: asunto,
          body: { contentType: "HTML", content: cuerpoHtml(mensaje, items, responderAntes) },
          toRecipients: destinatarios.map((address) => ({ emailAddress: { address } })),
          ccRecipients: copias.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      });
    } catch (e) {
      console.error("[solicitud cotización] no salió el correo:", e instanceof Error ? e.message : e);
      return { ok: false, error: "No se pudo enviar el correo. Revisa el destinatario y vuelve a intentarlo." };
    }

    const codigo = await siguienteNumero(ctx.empresa.id, "solicitud_cotizacion", "SCT", 4);
    const { data, error } = await supabaseAdmin
      .from("fin_solicitudes_cotizacion")
      .insert({ empresa_id: ctx.empresa.id, codigo, contacto_id: contactoId, oportunidad_id: oportunidadId, correo: destinatarios.join(", "), asunto, mensaje, items, responder_antes: responderAntes, creado_por: ctx.usuario.correo })
      .select("id")
      .single();
    revienta("registrar la solicitud de cotización", error);
    await auditar(ctx, "fin_solicitudes_cotizacion", data!.id, "enviar", `Solicitud de cotización ${codigo} enviada a ${destinatarios.join(", ")}`);
    if (oportunidadId) {
      await supabaseAdmin.from("fin_actividades").insert({ empresa_id: ctx.empresa.id, entidad_tipo: "oportunidad", entidad_id: oportunidadId, tipo: "correo", texto: `Solicitud de cotización ${codigo} enviada a ${destinatarios.join(", ")}`, fecha: ctx.hoy, creado_por: ctx.usuario.correo });
    }
    revalidatePath("/finanzas", "layout");
    revalidatePath("/leads", "layout");
    return { ok: true, id: data!.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "No se pudo enviar la solicitud." };
  }
}

export async function cambiarEstadoSolicitudCotizacionAction(id: string, estado: "enviada" | "recibida" | "cerrada"): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!uuid(id) || !["enviada", "recibida", "cerrada"].includes(estado)) return { ok: false, error: "Datos inválidos." };
    const { error } = await supabaseAdmin.from("fin_solicitudes_cotizacion").update({ estado }).eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("cambiar el estado", error);
    revalidatePath("/finanzas", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cambiar." };
  }
}
