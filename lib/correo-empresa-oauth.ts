import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * El inicio de sesión de Microsoft que conecta la cuenta de OTRA empresa del grupo
 * (Zeus) solo para enviar correos.
 *
 * No es el login del Core: ese sigue siendo con la cuenta de PERTEC (auth.ts). Esto es
 * un segundo flujo OAuth, aparte, que pide UN permiso —Mail.Send— y nada más. Con lo
 * que devuelve se puede mandar un correo como esa cuenta; no se puede leer su bandeja,
 * ni su calendario, ni sus archivos.
 *
 * ── La app en Entra ─────────────────────────────────────────────────────────
 *
 * La cuenta de Zeus vive en otro Microsoft 365, así que la app tiene que aceptar cuentas
 * de cualquier organización (multitenant). Se usa la de CORREO_EMPRESA_CLIENT_ID si está;
 * si no, la misma del login del Core (AUTH_MICROSOFT_ENTRA_ID_ID). En los dos casos, la
 * URI de redirección https://<core>/api/correo-empresa/callback tiene que estar
 * registrada en esa app.
 *
 * `organizations` (y no el tenant de PERTEC) es lo que deja entrar a una cuenta de otra
 * empresa. Se puede fijar a un tenant puntual con CORREO_EMPRESA_TENANT.
 */

const AUTORIDAD = "https://login.microsoftonline.com";

/** Lo único que se pide. openid/profile/email son para saber QUÉ cuenta se conectó. */
export const SCOPES_ENVIO = "openid profile email offline_access https://graph.microsoft.com/Mail.Send";

function credenciales(): { clientId: string; clientSecret: string } {
  const clientId = (process.env.CORREO_EMPRESA_CLIENT_ID || process.env.AUTH_MICROSOFT_ENTRA_ID_ID || "").trim();
  const clientSecret = (process.env.CORREO_EMPRESA_CLIENT_SECRET || process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("Falta configurar la app de Microsoft para conectar correos (CORREO_EMPRESA_CLIENT_ID / SECRET).");
  return { clientId, clientSecret };
}

function tenantDeInicio(): string {
  return (process.env.CORREO_EMPRESA_TENANT || "organizations").trim();
}

/** Par PKCE: el verificador queda en la cookie y Microsoft solo ve su hash. */
export function nuevoPkce(): { verificador: string; desafio: string } {
  const verificador = randomBytes(48).toString("base64url");
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  return { verificador, desafio };
}

export function nuevoEstado(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * La URL de Microsoft a la que se manda a la persona.
 *
 * `prompt=select_account` es lo importante: el navegador ya tiene abierta la sesión de
 * PERTEC, y sin esto Microsoft la usaría sin preguntar y se conectaría la cuenta
 * equivocada.
 */
export function urlDeInicio(p: { redirectUri: string; estado: string; desafio: string; dominio?: string | null }): string {
  const { clientId } = credenciales();
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    response_mode: "query",
    redirect_uri: p.redirectUri,
    scope: SCOPES_ENVIO,
    state: p.estado,
    code_challenge: p.desafio,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  if (p.dominio) q.set("domain_hint", p.dominio);
  return `${AUTORIDAD}/${encodeURIComponent(tenantDeInicio())}/oauth2/v2.0/authorize?${q}`;
}

export interface TokensEnvio {
  accessToken: string;
  refreshToken: string | null;
}

export interface CuentaConectada extends TokensEnvio {
  refreshToken: string;
  cuenta: string;
  nombre: string | null;
  tenantId: string | null;
}

async function pedirToken(tenant: string, cuerpo: Record<string, string>): Promise<Record<string, unknown>> {
  const { clientId, clientSecret } = credenciales();
  const r = await fetch(`${AUTORIDAD}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: SCOPES_ENVIO, ...cuerpo }),
  });
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    // error_description trae el código AADSTS, que es lo único que distingue «falta que
    // el admin apruebe» de «la contraseña cambió».
    const motivo = (datos.error_description as string) || (datos.error as string) || `HTTP ${r.status}`;
    throw new Error(String(motivo).split("\n")[0]);
  }
  return datos;
}

/**
 * Los datos del id_token.
 *
 * No se valida la firma, y está bien así: el token llega en la respuesta directa del
 * endpoint de Microsoft, por TLS y autenticada con el secreto de la app —es el caso que
 * OpenID Connect deja resolver con la validación TLS—. No viene del navegador.
 */
function reclamosDe(idToken: unknown): Record<string, unknown> {
  if (typeof idToken !== "string") return {};
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** Cambia el código que devolvió Microsoft por los tokens y la cuenta que se conectó. */
export async function canjearCodigo(codigo: string, verificador: string, redirectUri: string): Promise<CuentaConectada> {
  const datos = await pedirToken(tenantDeInicio(), {
    grant_type: "authorization_code",
    code: codigo,
    redirect_uri: redirectUri,
    code_verifier: verificador,
  });
  const reclamos = reclamosDe(datos.id_token);
  const cuenta = String(reclamos.email || reclamos.preferred_username || reclamos.upn || "").trim().toLowerCase();
  if (!cuenta) throw new Error("Microsoft no devolvió la dirección de la cuenta conectada.");
  if (typeof datos.refresh_token !== "string") throw new Error("Microsoft no devolvió un token renovable (falta offline_access).");
  return {
    accessToken: String(datos.access_token),
    refreshToken: datos.refresh_token,
    cuenta,
    nombre: typeof reclamos.name === "string" ? reclamos.name : null,
    tenantId: typeof reclamos.tid === "string" ? reclamos.tid : null,
  };
}

/** Un access token fresco a partir del refresh token guardado. Microsoft lo rota: hay que guardar el nuevo. */
export async function renovarToken(refreshToken: string, tenantId: string | null): Promise<TokensEnvio> {
  const datos = await pedirToken(tenantId || tenantDeInicio(), { grant_type: "refresh_token", refresh_token: refreshToken });
  return { accessToken: String(datos.access_token), refreshToken: typeof datos.refresh_token === "string" ? datos.refresh_token : null };
}

/** Por qué no se pudo conectar. La pantalla /correo-empresa traduce cada código a una frase. */
export type CodigoErrorConexion =
  | "vencio"
  | "sesion"
  | "empresa"
  | "aprobacion"
  | "multitenant"
  | "cancelado"
  | "dominio"
  | "misma"
  | "guardar"
  | "config"
  | "microsoft";

/**
 * Lo que Microsoft contestó, reducido a un código.
 *
 * Los tres que de verdad pasan al conectar una cuenta de otra empresa: que el
 * administrador de esa empresa no haya aprobado la app, que la app no acepte cuentas de
 * otras organizaciones, o que la persona haya cancelado. Va como código y no como texto
 * en la URL de vuelta para que nadie pueda armar un enlace al Core con un mensaje inventado.
 */
export function codigoErrorMicrosoft(codigo: string, descripcion: string): CodigoErrorConexion {
  const d = `${codigo} ${descripcion}`;
  if (/AADSTS65001|AADSTS90094|AADSTS90008|consent_required|admin/i.test(d)) return "aprobacion";
  if (/AADSTS50194|AADSTS700016|multi-?tenant|not found in the directory/i.test(d)) return "multitenant";
  if (/AADSTS65004|access_denied|cancel/i.test(d)) return "cancelado";
  return "microsoft";
}

/** La cookie que lleva el estado del flujo entre la ida a Microsoft y la vuelta. Cifrada y de diez minutos. */
export const COOKIE_FLUJO = "core-correo-empresa";
export const VIDA_FLUJO_SEG = 600;

export interface PaqueteFlujo {
  estado: string;
  verificador: string;
  empresaId: string;
  usuarioId: string;
  redirectUri: string;
  pestana: boolean;
  vence: number;
}

/**
 * El origen con el que la persona ve el Core (https://core.pertec.cl), para armar la URI
 * de redirección. Tiene que ser EXACTAMENTE la registrada en Entra; CORREO_EMPRESA_URL_BASE
 * la fija si algún día el host que llega no es el público.
 */
export function origenPublico(request: Request): string {
  const fijo = (process.env.CORREO_EMPRESA_URL_BASE || "").trim().replace(/\/+$/, "");
  if (fijo) return fijo;
  const h = request.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
