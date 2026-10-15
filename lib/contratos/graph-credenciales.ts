import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import { cifrar, descifrar } from "./cifrado";
import { canjearPorTokenDeSharePoint } from "./graph-token";

export class SinCredencialesDeGraph extends Error {}

/** El token se recuerda hasta un minuto antes de caducar (viven una hora). */
const MARGEN_MS = 60_000;
/** Por persona, en la memoria de esta instancia del servidor. */
const enMemoria = new Map<string, { token: string; hasta: number }>();

const SIN_CONEXION =
  "Tu cuenta todavía no le dio al core acceso a SharePoint. Usa «Conectar SharePoint» para concederlo.";

/**
 * El access token de SharePoint de esta persona.
 *
 * Sale del refresh token que core-pertec ya guarda cifrado al iniciar sesión (graph_credenciales),
 * canjeado por uno con permisos de archivos. NO se usa el token de la sesión: ese viaja al
 * navegador, y uno con permiso para escribir en todo SharePoint no puede quedar al alcance de
 * cualquier JavaScript de la página.
 *
 * cache() de React: una página de Contratos lanza muchas llamadas a Graph a la vez, y sin esto
 * cada una haría su propio canje. Además se recuerda en memoria la hora que dura el token, para no
 * ir a Microsoft en cada página.
 */
export const obtenerAccessToken = cache(async function obtenerAccessToken(correo: string): Promise<string> {
  const correoNormalizado = correo.toLowerCase();
  const recordado = enMemoria.get(correoNormalizado);
  if (recordado && recordado.hasta > Date.now()) return recordado.token;

  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("correo", correoNormalizado)
    .maybeSingle();
  if (!usuario) throw new SinCredencialesDeGraph(SIN_CONEXION);

  const { data } = await supabaseAdmin
    .from("graph_credenciales")
    .select("refresh_token_cifrado")
    .eq("usuario_id", usuario.id)
    .maybeSingle();
  if (!data?.refresh_token_cifrado) throw new SinCredencialesDeGraph(SIN_CONEXION);

  let tokens;
  try {
    tokens = await canjearPorTokenDeSharePoint(descifrar(data.refresh_token_cifrado as string));
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    // Sin los permisos concedidos no es una falla: es el paso de conectar que falta.
    if (/AADSTS65001|consent|invalid_grant|AADSTS70000/i.test(motivo)) throw new SinCredencialesDeGraph(SIN_CONEXION);
    throw e;
  }

  // Microsoft rota el refresh token en cada canje: se guarda el nuevo para que el login, el cron
  // de Mi Día y Contratos sigan usando uno vigente.
  if (tokens.refreshToken) {
    await supabaseAdmin
      .from("graph_credenciales")
      .update({
        refresh_token_cifrado: cifrar(tokens.refreshToken),
        actualizado_en: new Date().toISOString(),
      })
      .eq("usuario_id", usuario.id);
  }

  enMemoria.set(correoNormalizado, { token: tokens.accessToken, hasta: tokens.expiraEn * 1000 - MARGEN_MS });
  return tokens.accessToken;
});

/**
 * Si esta persona le dio al core acceso a SharePoint. Se responde intentando conseguir el token:
 * no hay otra forma fiable de saber qué concedió, y el token queda recordado para lo que sigue.
 */
export async function tieneAccesoASharePoint(correo: string): Promise<boolean> {
  try {
    await obtenerAccessToken(correo);
    return true;
  } catch (e) {
    if (!(e instanceof SinCredencialesDeGraph)) {
      console.error("[contratos] No se pudo obtener el token de SharePoint:", e);
    }
    return false;
  }
}

/** Después de conectar: lo recordado ya no sirve, puede faltarle lo recién concedido. */
export function olvidarTokenDe(correo: string): void {
  enMemoria.delete(correo.toLowerCase());
}
