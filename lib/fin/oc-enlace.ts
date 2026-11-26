import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "../supabase-admin";
import { hoyEnSantiago } from "../graph-calendario";
import { enviarCorreoAUsuario } from "../notificaciones";
import { ocParaDocumento } from "./oc-datos";
import type { ContextoFin } from "./datos";
import type { DatosOc } from "./oc-documento";

// -----------------------------------------------------------------------------
//  Enlace para que el PROVEEDOR confirme la OC (o pida modificarla) sin cuenta en el Core, como en Odoo.
//
//  · Al enviar la OC se crea un enlace (un código al azar); en la base queda solo su hash. Un envío nuevo deja sin
//    efecto los enlaces anteriores que no se respondieron: el proveedor responde siempre sobre la última versión.
//  · Confirmar = lo mismo que marcar a mano «el proveedor aceptó» (fin_compras.oc_respuesta = 'aceptada').
//  · Pedir modificación = queda en el enlace y en el historial, y le llega un correo a quien envió la OC. La OC sigue
//    esperando respuesta: quien la envió la corrige (o no) y la reenvía, lo que crea un enlace nuevo.
//  · Cada enlace se responde una sola vez y vence a los 60 días.
//
//  Tabla: supabase/fin/0019_oc_enlace_proveedor.sql.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const VIGENCIA_DIAS = 60;
const FORMA_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const FALTA_SQL = "Falta correr el SQL supabase/fin/0019_oc_enlace_proveedor.sql.";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export interface EnlaceOc {
  id: string;
  empresaId: string;
  compraId: string;
  creadoPor: string;
  creadoEn: string;
  expiraEn: string;
  vistoEn: string | null;
  respondidoEn: string | null;
  respuesta: "aceptada" | "modificacion" | null;
  respuestaNombre: string | null;
  respuestaComentario: string | null;
}

const aEnlace = (r: any): EnlaceOc => ({
  id: r.id, empresaId: r.empresa_id, compraId: r.compra_id, creadoPor: r.creado_por, creadoEn: r.creado_en, expiraEn: r.expira_en,
  vistoEn: r.visto_en ?? null, respondidoEn: r.respondido_en ?? null, respuesta: r.respuesta ?? null,
  respuestaNombre: r.respuesta_nombre ?? null, respuestaComentario: r.respuesta_comentario ?? null,
});

/** La dirección pública del enlace (la abre el proveedor, sin sesión). */
export const urlEnlaceOc = (origen: string, token: string) => `${origen.replace(/\/+$/, "")}/oc/${token}`;

/**
 * Crea el enlace de una OC y devuelve el código (va UNA vez en la URL; en la base queda su hash). Deja vencidos los
 * enlaces anteriores de esa OC que no se respondieron.
 */
export async function crearEnlaceOc(empresaId: string, compraId: string, creadoPor: string): Promise<string> {
  const ahora = new Date();
  const { error: e1 } = await supabaseAdmin
    .from("fin_oc_enlaces")
    .update({ expira_en: ahora.toISOString() })
    .eq("compra_id", compraId)
    .is("respondido_en", null)
    .gt("expira_en", ahora.toISOString());
  if (e1) throw new Error(/fin_oc_enlaces/.test(e1.message) ? FALTA_SQL : e1.message);
  const token = randomBytes(24).toString("base64url");
  const { error } = await supabaseAdmin.from("fin_oc_enlaces").insert({
    empresa_id: empresaId,
    compra_id: compraId,
    token_hash: hash(token),
    creado_por: creadoPor.toLowerCase(),
    expira_en: new Date(ahora.getTime() + VIGENCIA_DIAS * 86_400_000).toISOString(),
  });
  if (error) throw new Error(/fin_oc_enlaces/.test(error.message) ? FALTA_SQL : error.message);
  return token;
}

/** El enlace de un código, o null si no existe (o el código no tiene la forma). No mira si venció. */
export async function leerEnlaceOc(token: string): Promise<EnlaceOc | null> {
  if (!FORMA_TOKEN.test(token)) return null;
  const { data, error } = await supabaseAdmin.from("fin_oc_enlaces").select("*").eq("token_hash", hash(token)).maybeSingle();
  if (error || !data) return null;
  return aEnlace(data);
}

/** El último enlace de una OC (para mostrar en el Core si el proveedor lo abrió o respondió). */
export async function ultimoEnlaceDeCompra(compraId: string): Promise<EnlaceOc | null> {
  const { data, error } = await supabaseAdmin.from("fin_oc_enlaces").select("*").eq("compra_id", compraId).order("creado_en", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return aEnlace(data);
}

/** Marca que el proveedor abrió el enlace (la primera vez). */
export async function marcarVistoOc(enlace: EnlaceOc): Promise<void> {
  if (enlace.vistoEn) return;
  await supabaseAdmin.from("fin_oc_enlaces").update({ visto_en: new Date().toISOString() }).eq("id", enlace.id).is("visto_en", null);
}

export type EstadoEnlace = "vigente" | "vencido" | "respondido";
export const estadoEnlace = (e: EnlaceOc): EstadoEnlace => (e.respondidoEn ? "respondido" : new Date(e.expiraEn).getTime() <= Date.now() ? "vencido" : "vigente");

export interface OcPublica {
  enlace: EnlaceOc;
  estado: EstadoEnlace;
  documento: DatosOc;
  /** La respuesta registrada en la OC (por enlace o a mano). */
  respuestaOc: { respuesta: "aceptada" | "rechazada" | null; fecha: string | null; por: string | null };
  anulada: boolean;
}

/** Lo que ve el proveedor en la página del enlace: la OC tal como se le envió, y si ya se respondió. */
export async function ocPublica(token: string): Promise<OcPublica | null> {
  const enlace = await leerEnlaceOc(token);
  if (!enlace) return null;
  const { data: c } = await supabaseAdmin.from("fin_compras").select("*").eq("id", enlace.compraId).eq("empresa_id", enlace.empresaId).maybeSingle();
  if (!c || !c.oc_numero) return null;
  const { data: empresa } = await supabaseAdmin.from("empresas").select("*").eq("id", enlace.empresaId).maybeSingle();
  if (!empresa) return null;
  // ocParaDocumento solo usa la empresa y la fecha de hoy del contexto: el proveedor no tiene sesión.
  const ctx = { empresa, hoy: hoyEnSantiago().iso, usuario: { correo: enlace.creadoPor } } as unknown as ContextoFin;
  const { documento } = await ocParaDocumento(ctx, enlace.compraId);
  return {
    enlace,
    estado: estadoEnlace(enlace),
    documento,
    respuestaOc: { respuesta: c.oc_respuesta ?? null, fecha: c.oc_respuesta_fecha ?? null, por: c.oc_respuesta_por ?? null },
    anulada: Boolean(c.estado_override),
  };
}

const una = (t: string, max: number) => t.replace(/\s+/g, " ").trim().slice(0, max);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * La respuesta del proveedor desde el enlace: confirmar la OC o pedir modificarla. Devuelve un error legible si el
 * enlace venció, ya se respondió, la OC se anuló o ya estaba respondida.
 */
export async function responderEnlaceOc(
  token: string,
  respuesta: "aceptada" | "modificacion",
  nombreCrudo: string,
  comentarioCrudo: string,
  origen: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const enlace = await leerEnlaceOc(token);
  if (!enlace) return { ok: false, error: "Este enlace no es válido." };
  const estado = estadoEnlace(enlace);
  if (estado === "respondido") return { ok: false, error: "Esta orden de compra ya se respondió desde este enlace." };
  if (estado === "vencido") return { ok: false, error: "Este enlace ya no está vigente: hay una versión más nueva de la orden o venció. Pide que te la reenvíen." };
  const nombre = una(nombreCrudo, 120);
  const comentario = comentarioCrudo.replace(/\r\n?/g, "\n").trim().slice(0, 2000);
  if (!nombre) return { ok: false, error: "Escribe tu nombre." };
  if (respuesta === "modificacion" && !comentario) return { ok: false, error: "Cuéntanos qué hay que modificar." };

  const { data: c } = await supabaseAdmin.from("fin_compras").select("id, codigo, oc_numero, oc_respuesta, estado_override, descripcion").eq("id", enlace.compraId).eq("empresa_id", enlace.empresaId).maybeSingle();
  if (!c || !c.oc_numero) return { ok: false, error: "No se encontró la orden de compra." };
  if (c.estado_override) return { ok: false, error: "Esta orden de compra fue anulada: ya no se puede responder." };
  if (c.oc_respuesta) return { ok: false, error: "Esta orden de compra ya tiene una respuesta registrada." };

  // Se marca el enlace respondido SOLO si nadie lo respondió antes (dos clics o dos pestañas no responden dos veces).
  const ahora = new Date().toISOString();
  const { data: marcado, error: em } = await supabaseAdmin
    .from("fin_oc_enlaces")
    .update({ respondido_en: ahora, respuesta, respuesta_nombre: nombre, respuesta_comentario: comentario || null })
    .eq("id", enlace.id)
    .is("respondido_en", null)
    .select("id");
  if (em) return { ok: false, error: "No se pudo registrar la respuesta. Inténtalo de nuevo." };
  if (!marcado?.length) return { ok: false, error: "Esta orden de compra ya se respondió desde este enlace." };

  const hoy = hoyEnSantiago().iso;
  const por = `${nombre} (proveedor, por enlace)`;
  if (respuesta === "aceptada") {
    const { error } = await supabaseAdmin
      .from("fin_compras")
      .update({ oc_respuesta: "aceptada", oc_respuesta_fecha: hoy, oc_respuesta_por: por, oc_respuesta_obs: comentario ? una(comentario, 500) : null, actualizado_en: ahora })
      .eq("id", enlace.compraId)
      .eq("empresa_id", enlace.empresaId)
      .is("oc_respuesta", null);
    if (error) console.error("[oc-enlace] el enlace quedó respondido pero no se pudo marcar la OC:", error.message);
  }

  // El historial de la compra (la misma tabla que usa el Core; «usuario» dice que fue el proveedor por el enlace).
  await supabaseAdmin.from("fin_auditoria").insert({
    empresa_id: enlace.empresaId,
    tabla: "fin_compras",
    registro_id: enlace.compraId,
    accion: respuesta === "aceptada" ? "respuesta_proveedor" : "modificacion_proveedor",
    detalle: respuesta === "aceptada" ? `OC ${c.oc_numero} confirmada por ${por}${comentario ? `: «${una(comentario, 300)}»` : ""}` : `${por} pide modificar la OC ${c.oc_numero}: «${una(comentario, 300)}»`,
    usuario: `proveedor: ${nombre}`,
  });

  // Aviso a quien envió la OC (si es usuario activo del Core; si no, queda igual en el historial).
  const urlCompra = `${origen.replace(/\/+$/, "")}/finanzas/compras/${enlace.compraId}`;
  const asunto = respuesta === "aceptada" ? `El proveedor confirmó la OC ${c.oc_numero}` : `El proveedor pide modificar la OC ${c.oc_numero}`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#171411">
<p><strong>${esc(nombre)}</strong> ${respuesta === "aceptada" ? "confirmó" : "pidió modificar"} la orden de compra <strong>${esc(String(c.oc_numero))}</strong> (${esc(String(c.descripcion ?? ""))}) desde el enlace del correo.</p>
${comentario ? `<p style="margin:12px 0;padding:10px 14px;border-left:3px solid #c85217;background:#faf8f5">${esc(comentario).replace(/\n/g, "<br>")}</p>` : ""}
<p>${respuesta === "aceptada" ? "La OC quedó como aceptada por el proveedor en el Core." : "La OC sigue esperando respuesta: corrígela si corresponde y vuelve a enviarla (el proveedor recibe un enlace nuevo)."}</p>
<p><a href="${esc(urlCompra)}" style="color:#c85217;font-weight:600">Ver la compra en el Core</a></p></div>`;
  try {
    await enviarCorreoAUsuario(enlace.creadoPor, asunto, html);
  } catch (e) {
    console.error("[oc-enlace] no se pudo avisar a quien envió la OC:", e instanceof Error ? e.message : e);
  }
  return { ok: true };
}
