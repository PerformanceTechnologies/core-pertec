import "server-only";
import { SCOPES_GRAPH } from "@/lib/graph-token";

/**
 * Los permisos de archivos que necesita Contratos, aparte de los del login.
 *
 * Se piden con el botón «Conectar SharePoint» y no al iniciar sesión: el login de core-pertec ya
 * pide correo y calendario, y sumar archivos ahí haría que entrar al core dependiera de aprobarlos.
 * Separado, entrar y abrir los documentos de un contrato no dependen el uno del otro.
 */
export const SCOPES_ARCHIVOS = "Files.ReadWrite.All Sites.ReadWrite.All";

/**
 * Lo que se pide al conectar: lo del login MÁS archivos. Se repite lo del login porque el token
 * que vuelve de ese inicio de sesión reemplaza al de la sesión, y no puede perder el correo ni el
 * calendario que usa Mi Día.
 */
export const SCOPES_SHAREPOINT = `${SCOPES_GRAPH} ${SCOPES_ARCHIVOS}`;

/** Lo que se pide al canjear el refresh token por un token para SharePoint. */
const SCOPES_DEL_CANJE = [
  "https://graph.microsoft.com/Files.ReadWrite.All",
  "https://graph.microsoft.com/Sites.ReadWrite.All",
  "offline_access",
].join(" ");

function endpointToken(): string {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  if (!issuer) throw new Error("Falta AUTH_MICROSOFT_ENTRA_ID_ISSUER en las variables de entorno.");
  return `${issuer.replace(/\/v2\.0\/?$/, "")}/oauth2/v2.0/token`;
}

export interface TokenDeSharePoint {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch en segundos. */
  expiraEn: number;
}

/**
 * Microsoft no ata un refresh token a los permisos con que se emitió: sirve para pedir cualquiera
 * que la persona ya haya concedido. Por eso alcanza con el que core-pertec guarda al iniciar
 * sesión, una vez que la persona aceptó los de archivos con «Conectar SharePoint».
 *
 * Lanza con el motivo de Microsoft. Un AADSTS65001 es «no concedió los permisos»: quien llama lo
 * traduce en el botón para conectar.
 */
export async function canjearPorTokenDeSharePoint(refreshToken: string): Promise<TokenDeSharePoint> {
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan AUTH_MICROSOFT_ENTRA_ID_ID o AUTH_MICROSOFT_ENTRA_ID_SECRET.");
  }

  const respuesta = await fetch(endpointToken(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPES_DEL_CANJE,
    }),
    cache: "no-store",
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    const motivo = datos?.error_description || datos?.error || `HTTP ${respuesta.status}`;
    throw new Error(String(motivo).split("\n")[0]);
  }

  return {
    accessToken: datos.access_token,
    refreshToken: datos.refresh_token ?? null,
    expiraEn: Math.floor(Date.now() / 1000) + datos.expires_in,
  };
}
