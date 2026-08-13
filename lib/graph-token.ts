import "server-only";

/**
 * Canje de refresh token contra Microsoft Entra.
 *
 * Vive acá y no dentro de auth.ts porque hay DOS lugares que lo necesitan y no
 * pueden divergir: el callback `jwt` de NextAuth, que refresca el token de la
 * sesión mientras la persona navega, y el cron del resumen diario, que lo
 * refresca a las 7:30 sin que haya ninguna sesión abierta.
 *
 * Los scopes son los mismos en los dos casos a propósito. Si el cron pidiera un
 * subconjunto, Microsoft devolvería un token válido pero más angosto y el
 * siguiente refresco de la sesión heredaría ese recorte — un bug muy difícil de
 * ver, porque solo se manifiesta después de que el cron corre.
 */

export const SCOPES_GRAPH =
  "openid profile email offline_access User.Read Calendars.Read Mail.Read Mail.Send";

export interface TokensGraph {
  accessToken: string;
  /** Microsoft rota el refresh token en cada uso; si no viene uno nuevo, el anterior sigue válido. */
  refreshToken: string | null;
  /** Epoch en segundos. */
  expiraEn: number;
}

function endpointToken(): string {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  if (!issuer) throw new Error("Falta AUTH_MICROSOFT_ENTRA_ID_ISSUER en las variables de entorno.");
  // El issuer viene como ".../<tenant-id>/v2.0"; el endpoint de token es
  // ".../<tenant-id>/oauth2/v2.0/token".
  return `${issuer.replace(/\/v2\.0\/?$/, "")}/oauth2/v2.0/token`;
}

/**
 * Cambia un refresh token por un access token nuevo.
 *
 * Lanza si Microsoft lo rechaza, con el mensaje que devolvió. Quien llama decide
 * qué hacer: la sesión marca el token como caído y el cron anota el error en la
 * fila del usuario para que la página pida un login nuevo.
 */
export async function canjearRefreshToken(refreshToken: string): Promise<TokensGraph> {
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
      scope: SCOPES_GRAPH,
    }),
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    // error_description de Microsoft trae el motivo real (token revocado,
    // consentimiento faltante, Conditional Access). Se propaga tal cual porque
    // es lo único que permite distinguir "hay que volver a loguearse" de "falta
    // aprobar el permiso en Entra".
    const motivo = datos?.error_description || datos?.error || `HTTP ${respuesta.status}`;
    throw new Error(String(motivo).split("\n")[0]);
  }

  return {
    accessToken: datos.access_token,
    refreshToken: datos.refresh_token ?? null,
    expiraEn: Math.floor(Date.now() / 1000) + datos.expires_in,
  };
}
