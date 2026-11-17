import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { cifrar, descifrar } from "./cifrado";
import { accessTokenDeUsuario, tieneCredencialGuardada } from "./graph-credenciales";
import { listarEmpresas } from "./empresas";
import { renovarToken, type CuentaConectada } from "./correo-empresa-oauth";
import type { Empresa } from "./empresas-modelo";

/**
 * Desde qué cuenta sale un correo a un cliente o proveedor.
 *
 * Una sola regla, para los cuatro envíos del Core (cotización de un lead, OC, solicitud
 * de cotización y oferta):
 *
 *  - Empresa SIN correo propio (PERTEC): como siempre, desde la cuenta de Microsoft con
 *    la que la persona entra al Core.
 *  - Empresa CON correo propio (Zeus): desde la cuenta de esa empresa que la persona
 *    conectó (ver lib/correo-empresa-oauth.ts). Si no la conectó, NO se envía: mandar un
 *    correo de Zeus desde @pertec.cl es justo lo que esto evita.
 */

const TABLA = "correo_empresa_conexiones";

export interface ConexionCorreo {
  cuenta: string;
  nombre: string | null;
  conectadoEn: string;
  usadoEn: string | null;
  /** Por qué Microsoft dejó de aceptar la conexión. null = sana. */
  error: string | null;
}

/**
 * La ruta para conectar (o cambiar) la cuenta de una empresa. Al terminar se vuelve a
 * /correo-empresa. `pestana`: se abrió en una pestaña nueva desde la ventana de envío, y
 * la página de vuelta le dice a la persona que ya la puede cerrar.
 */
export function rutaParaConectar(empresaId: string, pestana = false): string {
  return `/api/correo-empresa/conectar?${new URLSearchParams({ empresa: empresaId, ...(pestana ? { pestana: "1" } : {}) })}`;
}

export async function empresaPorId(empresaId: string | null | undefined): Promise<Empresa | null> {
  if (!empresaId) return null;
  return (await listarEmpresas()).find((e) => e.id === empresaId) ?? null;
}

/** Sin la tabla (SQL sin correr) no hay conexiones: se lee como «ninguna». */
export async function conexionDeCorreo(usuarioId: string, empresaId: string): Promise<ConexionCorreo | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLA)
    .select("cuenta, nombre, conectado_en, usado_en, error")
    .eq("usuario_id", usuarioId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    cuenta: data.cuenta as string,
    nombre: (data.nombre as string) ?? null,
    conectadoEn: data.conectado_en as string,
    usadoEn: (data.usado_en as string) ?? null,
    error: (data.error as string) ?? null,
  };
}

export async function guardarConexion(usuarioId: string, empresaId: string, c: CuentaConectada): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabaseAdmin.from(TABLA).upsert(
    {
      usuario_id: usuarioId,
      empresa_id: empresaId,
      cuenta: c.cuenta,
      nombre: c.nombre,
      tenant_id: c.tenantId,
      refresh_token_cifrado: cifrar(c.refreshToken),
      error: null,
      conectado_en: ahora,
      actualizado_en: ahora,
    },
    { onConflict: "usuario_id,empresa_id" },
  );
  if (error) {
    if (/correo_empresa_conexiones/.test(error.message)) throw new Error("Falta correr el SQL supabase/empresas/0003_correo_por_empresa.sql.");
    throw new Error(error.message);
  }
}

export async function borrarConexion(usuarioId: string, empresaId: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).delete().eq("usuario_id", usuarioId).eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);
}

/** Lo que muestra la pantalla de envío ANTES de mandar: desde dónde va a salir. */
export type EstadoRemitente =
  | { modo: "personal"; cuenta: string; listo: boolean }
  | {
      modo: "empresa";
      empresaId: string;
      empresa: string;
      cuenta: string | null;
      listo: boolean;
      /** La conexión existe pero Microsoft la rechazó la última vez (venció, la revocaron). */
      error: string | null;
      conectar: string;
    };

export async function estadoRemitente(usuario: { id: string; correo: string }, empresa: Empresa | null): Promise<EstadoRemitente> {
  if (!empresa?.correoPropio) {
    return { modo: "personal", cuenta: usuario.correo, listo: await tieneCredencialGuardada(usuario.id) };
  }
  const c = await conexionDeCorreo(usuario.id, empresa.id);
  return {
    modo: "empresa",
    empresaId: empresa.id,
    empresa: empresa.nombre,
    cuenta: c?.cuenta ?? null,
    listo: Boolean(c) && !c?.error,
    error: c?.error ?? null,
    conectar: rutaParaConectar(empresa.id, true),
  };
}

export type Remitente =
  | { estado: "ok"; accessToken: string; cuenta: string; modo: "personal" | "empresa" }
  | { estado: "no"; error: string };

/**
 * El token con el que se manda, según la empresa en la que se está enviando.
 *
 * El mensaje de error está escrito para mostrarse tal cual en la pantalla de envío.
 */
export async function remitenteParaEnviar(usuario: { id: string; correo: string }, empresaId: string | null | undefined): Promise<Remitente> {
  const empresa = await empresaPorId(empresaId);

  if (!empresa?.correoPropio) {
    const t = await accessTokenDeUsuario(usuario.id);
    if (t.estado !== "ok") return { estado: "no", error: "Tu cuenta de Microsoft no está conectada. Cierra sesión y vuelve a entrar al Core." };
    return { estado: "ok", accessToken: t.accessToken, cuenta: usuario.correo, modo: "personal" };
  }

  const { data } = await supabaseAdmin
    .from(TABLA)
    .select("cuenta, tenant_id, refresh_token_cifrado")
    .eq("usuario_id", usuario.id)
    .eq("empresa_id", empresa.id)
    .maybeSingle();
  if (!data?.refresh_token_cifrado) {
    return { estado: "no", error: `Los correos de ${empresa.nombre} salen desde tu cuenta de ${empresa.nombre}, y todavía no la conectas. Usa «Conectar correo de ${empresa.nombre}» en esta misma ventana y vuelve a enviar.` };
  }

  try {
    const tokens = await renovarToken(descifrar(data.refresh_token_cifrado as string), (data.tenant_id as string) ?? null);
    const ahora = new Date().toISOString();
    await supabaseAdmin
      .from(TABLA)
      .update({
        ...(tokens.refreshToken ? { refresh_token_cifrado: cifrar(tokens.refreshToken) } : {}),
        usado_en: ahora,
        error: null,
        actualizado_en: ahora,
      })
      .eq("usuario_id", usuario.id)
      .eq("empresa_id", empresa.id);
    return { estado: "ok", accessToken: tokens.accessToken, cuenta: data.cuenta as string, modo: "empresa" };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    // Se anota para que la pantalla diga «reconecta» antes del próximo intento.
    await supabaseAdmin.from(TABLA).update({ error: motivo, actualizado_en: new Date().toISOString() }).eq("usuario_id", usuario.id).eq("empresa_id", empresa.id);
    console.error(`[correo-empresa] Microsoft rechazó la conexión de ${usuario.correo} con ${empresa.slug}: ${motivo}`);
    return { estado: "no", error: `Tu conexión con el correo de ${empresa.nombre} venció o fue revocada. Vuelve a conectarla y envía de nuevo.` };
  }
}
