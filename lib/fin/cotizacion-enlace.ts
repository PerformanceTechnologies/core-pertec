import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "../supabase-admin";
import { hoyEnSantiago } from "../graph-calendario";
import { enviarCorreoAUsuario } from "../notificaciones";
import { cotizacionParaDocumento } from "./cotizacion-datos";
import { aceptarCotizacionCon } from "./cotizacion-aceptar";
import type { ContextoFin } from "./datos";
import type { DatosDocumento } from "./cotizacion-documento";

// -----------------------------------------------------------------------------
//  Enlace para que el CLIENTE acepte la cotización (o pida modificarla) sin cuenta en el Core, como en Odoo.
//  Mismo esquema que el de la OC (lib/fin/oc-enlace.ts):
//
//  · Al enviar la cotización se crea un enlace (código al azar; en la base, solo su hash). Un envío nuevo deja sin
//    efecto los anteriores sin responder: el cliente responde siempre sobre la última versión.
//  · Aceptar = lo mismo que «Aceptar y generar hitos» en el Core, en una sola parte (lib/fin/cotizacion-aceptar.ts),
//    con el N° de OC que dé el cliente. Queda a nombre de quien envió la cotización, con el nombre del cliente en el
//    historial y en las actividades.
//  · Pedir modificación = actividad en la cotización (y el lead), historial y correo a quien la envió. La cotización
//    sigue «Enviada»: se corrige (o se versiona) y se reenvía, con un enlace nuevo.
//  · Cada enlace se responde una sola vez y vence a los 60 días.
//
//  Tabla: supabase/fin/0021_cotizacion_enlace_cliente.sql.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const VIGENCIA_DIAS = 60;
const FORMA_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const FALTA_SQL = "Falta correr el SQL supabase/fin/0021_cotizacion_enlace_cliente.sql.";
const TABLA = "fin_cotizacion_enlaces";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export interface EnlaceCotizacion {
  id: string;
  empresaId: string;
  cotizacionId: string;
  creadoPor: string;
  creadoEn: string;
  expiraEn: string;
  vistoEn: string | null;
  respondidoEn: string | null;
  respuesta: "aceptada" | "modificacion" | null;
  respuestaNombre: string | null;
  respuestaComentario: string | null;
  respuestaOc: string | null;
}

const aEnlace = (r: any): EnlaceCotizacion => ({
  id: r.id, empresaId: r.empresa_id, cotizacionId: r.cotizacion_id, creadoPor: r.creado_por, creadoEn: r.creado_en, expiraEn: r.expira_en,
  vistoEn: r.visto_en ?? null, respondidoEn: r.respondido_en ?? null, respuesta: r.respuesta ?? null,
  respuestaNombre: r.respuesta_nombre ?? null, respuestaComentario: r.respuesta_comentario ?? null, respuestaOc: r.respuesta_oc ?? null,
});

/** La dirección pública del enlace (la abre el cliente, sin sesión). */
export const urlEnlaceCotizacion = (origen: string, token: string) => `${origen.replace(/\/+$/, "")}/cotizacion/${token}`;

/** Crea el enlace de una cotización y devuelve el código. Deja vencidos los anteriores sin responder. */
export async function crearEnlaceCotizacion(empresaId: string, cotizacionId: string, creadoPor: string): Promise<string> {
  const ahora = new Date();
  const { error: e1 } = await supabaseAdmin.from(TABLA).update({ expira_en: ahora.toISOString() }).eq("cotizacion_id", cotizacionId).is("respondido_en", null).gt("expira_en", ahora.toISOString());
  if (e1) throw new Error(new RegExp(TABLA).test(e1.message) ? FALTA_SQL : e1.message);
  const token = randomBytes(24).toString("base64url");
  const { error } = await supabaseAdmin.from(TABLA).insert({
    empresa_id: empresaId,
    cotizacion_id: cotizacionId,
    token_hash: hash(token),
    creado_por: creadoPor.toLowerCase(),
    expira_en: new Date(ahora.getTime() + VIGENCIA_DIAS * 86_400_000).toISOString(),
  });
  if (error) throw new Error(new RegExp(TABLA).test(error.message) ? FALTA_SQL : error.message);
  return token;
}

export async function leerEnlaceCotizacion(token: string): Promise<EnlaceCotizacion | null> {
  if (!FORMA_TOKEN.test(token)) return null;
  const { data, error } = await supabaseAdmin.from(TABLA).select("*").eq("token_hash", hash(token)).maybeSingle();
  if (error || !data) return null;
  return aEnlace(data);
}

/** El último enlace de una cotización (para mostrar en el Core si el cliente lo abrió o respondió). */
export async function ultimoEnlaceDeCotizacion(cotizacionId: string): Promise<EnlaceCotizacion | null> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("*").eq("cotizacion_id", cotizacionId).order("creado_en", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return aEnlace(data);
}

export async function marcarVistoCotizacion(enlace: EnlaceCotizacion): Promise<void> {
  if (enlace.vistoEn) return;
  await supabaseAdmin.from(TABLA).update({ visto_en: new Date().toISOString() }).eq("id", enlace.id).is("visto_en", null);
}

export type EstadoEnlaceCotizacion = "vigente" | "vencido" | "respondido";
export const estadoEnlaceCotizacion = (e: EnlaceCotizacion): EstadoEnlaceCotizacion =>
  e.respondidoEn ? "respondido" : new Date(e.expiraEn).getTime() <= Date.now() ? "vencido" : "vigente";

/** El contexto con que se lee y se acepta la cotización: su empresa y quien la envió (el cliente no tiene sesión). */
async function contextoDeEnlace(enlace: EnlaceCotizacion): Promise<ContextoFin | null> {
  const [{ data: empresa }, { data: usuario }] = await Promise.all([
    supabaseAdmin.from("empresas").select("*").eq("id", enlace.empresaId).maybeSingle(),
    supabaseAdmin.from("usuarios").select("*").ilike("correo", enlace.creadoPor.replace(/[\\%_]/g, "\\$&")).maybeSingle(),
  ]);
  if (!empresa) return null;
  return { empresa, hoy: hoyEnSantiago().iso, usuario: usuario ?? { correo: enlace.creadoPor, nombre: null, rol: "usuario" } } as unknown as ContextoFin;
}

export interface CotizacionPublica {
  enlace: EnlaceCotizacion;
  estado: EstadoEnlaceCotizacion;
  documento: DatosDocumento;
  /** Estado de la cotización en el Core: borrador | enviada | aceptada | rechazada | … */
  estadoCotizacion: string;
  fechaAceptacion: string | null;
}

/** Lo que ve el cliente en la página del enlace: la cotización tal como se le envió, y si ya se respondió. */
export async function cotizacionPublica(token: string): Promise<CotizacionPublica | null> {
  const enlace = await leerEnlaceCotizacion(token);
  if (!enlace) return null;
  const ctx = await contextoDeEnlace(enlace);
  if (!ctx) return null;
  let datos;
  try {
    datos = await cotizacionParaDocumento(ctx, enlace.cotizacionId);
  } catch {
    return null;
  }
  const { data: c } = await supabaseAdmin.from("fin_cotizaciones").select("estado, fecha_aceptacion").eq("id", enlace.cotizacionId).maybeSingle();
  return { enlace, estado: estadoEnlaceCotizacion(enlace), documento: datos.documento, estadoCotizacion: String(c?.estado ?? datos.estado), fechaAceptacion: (c?.fecha_aceptacion as string | null) ?? null };
}

const una = (t: string, max: number) => t.replace(/\s+/g, " ").trim().slice(0, max);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** La respuesta del cliente desde el enlace: aceptar la cotización o pedir modificarla. */
export async function responderEnlaceCotizacion(
  token: string,
  respuesta: "aceptada" | "modificacion",
  datos: { nombre: string; comentario: string; oc: string },
  origen: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const enlace = await leerEnlaceCotizacion(token);
  if (!enlace) return { ok: false, error: "Este enlace no es válido." };
  const estado = estadoEnlaceCotizacion(enlace);
  if (estado === "respondido") return { ok: false, error: "Esta cotización ya se respondió desde este enlace." };
  if (estado === "vencido") return { ok: false, error: "Este enlace ya no está vigente: hay una versión más nueva de la cotización o venció. Pide que te la reenvíen." };
  const nombre = una(datos.nombre, 120);
  const comentario = datos.comentario.replace(/\r\n?/g, "\n").trim().slice(0, 2000);
  const oc = una(datos.oc, 60);
  if (!nombre) return { ok: false, error: "Escribe tu nombre." };
  if (respuesta === "modificacion" && !comentario) return { ok: false, error: "Cuéntanos qué hay que modificar." };

  const { data: c } = await supabaseAdmin.from("fin_cotizaciones").select("id, numero, version, titulo, estado, oportunidad_id").eq("id", enlace.cotizacionId).eq("empresa_id", enlace.empresaId).maybeSingle();
  if (!c) return { ok: false, error: "No se encontró la cotización." };
  if (!["borrador", "enviada"].includes(String(c.estado))) return { ok: false, error: c.estado === "aceptada" ? "Esta cotización ya está aceptada." : "Esta cotización ya no se puede responder." };
  const ctx = await contextoDeEnlace(enlace);
  if (!ctx) return { ok: false, error: "No se encontró la cotización." };

  // El enlace se marca respondido SOLO si nadie lo respondió antes (dos clics o dos pestañas no responden dos veces).
  const ahora = new Date().toISOString();
  const { data: marcado, error: em } = await supabaseAdmin
    .from(TABLA)
    .update({ respondido_en: ahora, respuesta, respuesta_nombre: nombre, respuesta_comentario: comentario || null, respuesta_oc: oc || null })
    .eq("id", enlace.id)
    .is("respondido_en", null)
    .select("id");
  if (em) return { ok: false, error: "No se pudo registrar la respuesta. Inténtalo de nuevo." };
  if (!marcado?.length) return { ok: false, error: "Esta cotización ya se respondió desde este enlace." };

  const numero = `${c.numero}${Number(c.version) > 1 ? ` V${c.version}` : ""}`;
  if (respuesta === "aceptada") {
    // Igual que «Aceptar y generar hitos» del Core, en una sola parte.
    const fd = new FormData();
    fd.set("fechaAceptacion", ctx.hoy);
    fd.set("modo", "unica");
    if (oc) fd.set("ocCliente", oc);
    const r = await aceptarCotizacionCon(ctx, enlace.cotizacionId, fd).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    if (!r.ok) {
      // No se pudo aceptar: el enlace vuelve a quedar sin responder, para que el cliente pueda reintentar.
      await supabaseAdmin.from(TABLA).update({ respondido_en: null, respuesta: null, respuesta_nombre: null, respuesta_comentario: null, respuesta_oc: null }).eq("id", enlace.id);
      console.error("[cotizacion-enlace] no se pudo aceptar desde el enlace:", r.error);
      return { ok: false, error: "No se pudo registrar la aceptación. Inténtalo de nuevo o contacta a quien te envió la cotización." };
    }
  }

  // Historial y actividad (en la cotización y en el lead), con el nombre del cliente.
  const detalle =
    respuesta === "aceptada"
      ? `Cotización ${numero} aceptada por ${nombre} (cliente, por enlace)${oc ? `, OC ${oc}` : ""}${comentario ? `: «${una(comentario, 300)}»` : ""}`
      : `${nombre} (cliente, por enlace) pide modificar la cotización ${numero}: «${una(comentario, 300)}»`;
  await supabaseAdmin.from("fin_auditoria").insert({
    empresa_id: enlace.empresaId, tabla: "fin_cotizaciones", registro_id: enlace.cotizacionId,
    accion: respuesta === "aceptada" ? "aceptar_cliente" : "modificacion_cliente", detalle, usuario: `cliente: ${nombre}`,
  });
  const filas = [{ empresa_id: enlace.empresaId, entidad_tipo: "cotizacion", entidad_id: enlace.cotizacionId, tipo: "nota", texto: detalle, fecha: ctx.hoy, creado_por: enlace.creadoPor }];
  if (c.oportunidad_id) filas.push({ empresa_id: enlace.empresaId, entidad_tipo: "oportunidad", entidad_id: c.oportunidad_id as string, tipo: "nota", texto: detalle, fecha: ctx.hoy, creado_por: enlace.creadoPor });
  await supabaseAdmin.from("fin_actividades").insert(filas);

  // Aviso a quien envió la cotización.
  const url = `${origen.replace(/\/+$/, "")}/leads/cotizaciones/${enlace.cotizacionId}`;
  const asunto = respuesta === "aceptada" ? `El cliente aceptó la cotización ${numero}` : `El cliente pide modificar la cotización ${numero}`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#171411">
<p><strong>${esc(nombre)}</strong> ${respuesta === "aceptada" ? "aceptó" : "pidió modificar"} la cotización <strong>${esc(numero)}</strong> (${esc(String(c.titulo ?? ""))}) desde el enlace del correo.${oc ? ` OC del cliente: <strong>${esc(oc)}</strong>.` : ""}</p>
${comentario ? `<p style="margin:12px 0;padding:10px 14px;border-left:3px solid #c85217;background:#faf8f5">${esc(comentario).replace(/\n/g, "<br>")}</p>` : ""}
<p>${respuesta === "aceptada" ? "La cotización quedó aceptada en el Core, con sus hitos en una sola parte. Si había que repartirlos de otra forma (mensual, por partes), ajústalos en Ventas." : "La cotización sigue enviada: corrígela o crea una nueva versión y vuelve a enviarla (el cliente recibe un enlace nuevo)."}</p>
<p><a href="${esc(url)}" style="color:#c85217;font-weight:600">Ver la cotización en el Core</a></p></div>`;
  try {
    await enviarCorreoAUsuario(enlace.creadoPor, asunto, html);
  } catch (e) {
    console.error("[cotizacion-enlace] no se pudo avisar a quien envió la cotización:", e instanceof Error ? e.message : e);
  }
  return { ok: true };
}
