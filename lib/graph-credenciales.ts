import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { cifrar, descifrar } from "./cifrado";
import { canjearRefreshToken } from "./graph-token";

/**
 * El refresh token de Graph de cada usuario, guardado para poder actuar en su
 * nombre cuando NO hay sesión abierta — o sea, en el cron del resumen diario.
 *
 * Es deliberadamente lo contrario de pedir permisos de aplicación en Entra: con
 * permisos de aplicación el core podría leer cualquier buzón del tenant, y acá
 * el alcance es exactamente el buzón de quien se logueó y aceptó los permisos.
 * Menos poder, menos que aprobar, y una filtración expone un buzón en vez de
 * todos.
 *
 * El valor va cifrado (ver lib/cifrado.ts) y la tabla tiene RLS activo sin
 * ninguna política: solo se llega con la service role key desde el servidor.
 */

async function idDeUsuario(correo: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("correo", correo.toLowerCase())
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * Guarda (o reemplaza) el refresh token de una persona.
 *
 * Se llama en el primer login y en cada refresco de la sesión, porque Microsoft
 * rota el token en cada uso: si acá quedara el anterior, el cron intentaría
 * canjear uno que Microsoft ya invalidó.
 */
export async function guardarRefreshToken(correo: string, refreshToken: string): Promise<void> {
  const usuarioId = await idDeUsuario(correo);
  // Sin usuario en la tabla no hay a qué colgar la credencial. No es un error:
  // el callback signIn ya rechazó a quien no está registrado, así que esto solo
  // pasa en una carrera muy rara (alguien borrado entre el signIn y el jwt).
  if (!usuarioId) return;

  const { error } = await supabaseAdmin.from("graph_credenciales").upsert(
    {
      usuario_id: usuarioId,
      refresh_token_cifrado: cifrar(refreshToken),
      error: null,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "usuario_id" },
  );
  if (error) throw new Error(error.message);
}

export type ResultadoTokenGuardado =
  | { estado: "ok"; accessToken: string }
  /** Nunca se guardó un token: la persona no ha vuelto a loguearse desde que existe esto. */
  | { estado: "sin_credencial" }
  /** Microsoft rechazó el token: revocado, clave cambiada, permiso sin consentir. */
  | { estado: "rechazado"; motivo: string };

/**
 * Un access token fresco de Graph para un usuario, sin sesión de por medio.
 *
 * Canjea el refresh token guardado y persiste el rotado antes de devolver: si no
 * se guardara el nuevo, la ejecución siguiente del cron fallaría con el viejo.
 *
 * Cuando Microsoft rechaza el token, el motivo queda anotado en la fila. Eso es
 * lo que permite que /mi-dia diga "volvé a iniciar sesión" en vez de mostrar un
 * dashboard vacío sin explicación.
 */
export async function accessTokenDeUsuario(usuarioId: string): Promise<ResultadoTokenGuardado> {
  const { data } = await supabaseAdmin
    .from("graph_credenciales")
    .select("refresh_token_cifrado")
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (!data?.refresh_token_cifrado) return { estado: "sin_credencial" };

  try {
    const guardado = descifrar(data.refresh_token_cifrado as string);
    const tokens = await canjearRefreshToken(guardado);

    if (tokens.refreshToken) {
      await supabaseAdmin
        .from("graph_credenciales")
        .update({
          refresh_token_cifrado: cifrar(tokens.refreshToken),
          usado_en: new Date().toISOString(),
          error: null,
          actualizado_en: new Date().toISOString(),
        })
        .eq("usuario_id", usuarioId);
    } else {
      await supabaseAdmin
        .from("graph_credenciales")
        .update({ usado_en: new Date().toISOString(), error: null })
        .eq("usuario_id", usuarioId);
    }

    return { estado: "ok", accessToken: tokens.accessToken };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    // El motivo se guarda, no se tira: el cron corre de madrugada y sin esto
    // nadie se enteraría de que hace días que no se puede leer el buzón.
    await supabaseAdmin
      .from("graph_credenciales")
      .update({ error: motivo, actualizado_en: new Date().toISOString() })
      .eq("usuario_id", usuarioId);
    console.error(`[graph-credenciales] Token rechazado para el usuario ${usuarioId}: ${motivo}`);
    return { estado: "rechazado", motivo };
  }
}
