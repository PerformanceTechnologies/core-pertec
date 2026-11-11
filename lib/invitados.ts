import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import { enviarCorreoAUsuario } from "./notificaciones";

// -----------------------------------------------------------------------------
//  Acceso de invitados: personas de fuera de PERTEC entran con su correo y un código de 6
//  dígitos que les llega por mail. El código se guarda con hash, vence a los 10 minutos y se
//  invalida tras 5 intentos fallidos.
// -----------------------------------------------------------------------------

const VIGENCIA_MS = 10 * 60 * 1000;
const MAX_INTENTOS = 5;

const hash = (correo: string, codigo: string) =>
  createHmac("sha256", process.env.AUTH_SECRET ?? "core").update(`${correo}|${codigo}`).digest("hex");

/** ¿Es un invitado activo del Core? */
async function invitadoActivo(correo: string): Promise<{ nombre: string | null } | null> {
  const { data } = await supabaseAdmin.from("usuarios").select("nombre, activo, tipo").eq("correo", correo).maybeSingle();
  return data && data.activo && data.tipo === "invitado" ? { nombre: (data.nombre as string | null) ?? null } : null;
}

/**
 * Manda un código al correo si es un invitado activo. Por seguridad, la respuesta es la misma
 * exista o no el invitado (no revela quién tiene acceso).
 */
export async function enviarCodigo(correoCrudo: string): Promise<void> {
  const correo = correoCrudo.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return;
  const inv = await invitadoActivo(correo);
  if (!inv) return;
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await supabaseAdmin.from("codigos_acceso").upsert({
    correo,
    hash: hash(correo, codigo),
    expira_en: new Date(Date.now() + VIGENCIA_MS).toISOString(),
    intentos: 0,
    creado_en: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 0"><tr><td align="center">
    <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="width:440px;max-width:100%;background:#fff;border:1px solid #e7e1d8;border-radius:14px">
      <tr><td style="padding:26px 28px 8px 28px;font:700 12px/1.4 Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#c85217">Core PERTEC · acceso de invitado</td></tr>
      <tr><td style="padding:4px 28px;font:15px/1.6 Arial,sans-serif;color:#171411">Hola${inv.nombre ? ` ${inv.nombre}` : ""}, tu código para entrar es:</td></tr>
      <tr><td style="padding:14px 28px"><div style="font:700 34px/1 Arial,sans-serif;letter-spacing:10px;color:#171411;background:#faf8f5;border:1px solid #efe9e1;border-radius:10px;padding:16px;text-align:center">${codigo}</div></td></tr>
      <tr><td style="padding:4px 28px 26px 28px;font:13px/1.6 Arial,sans-serif;color:#8a8178">Vence en 10 minutos. Si no lo pediste, ignora este correo.</td></tr>
    </table></td></tr></table>`;
  await enviarCorreoAUsuario(correo, `Tu código de acceso al Core PERTEC: ${codigo}`, html);
}

/** Verifica el código. Si sirve, lo borra (un solo uso) y devuelve el correo. */
export async function verificarCodigo(correoCrudo: string, codigoCrudo: string): Promise<string | null> {
  const correo = correoCrudo.trim().toLowerCase();
  const codigo = codigoCrudo.replace(/\D/g, "");
  if (codigo.length !== 6) return null;
  const { data } = await supabaseAdmin.from("codigos_acceso").select("hash, expira_en, intentos").eq("correo", correo).maybeSingle();
  if (!data || Date.parse(data.expira_en as string) < Date.now() || Number(data.intentos) >= MAX_INTENTOS) return null;
  const esperado = Buffer.from(String(data.hash));
  const recibido = Buffer.from(hash(correo, codigo));
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
    await supabaseAdmin.from("codigos_acceso").update({ intentos: Number(data.intentos) + 1 }).eq("correo", correo);
    return null;
  }
  await supabaseAdmin.from("codigos_acceso").delete().eq("correo", correo);
  return (await invitadoActivo(correo)) ? correo : null;
}
