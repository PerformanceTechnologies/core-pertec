import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { listarAplicaciones } from "./aplicaciones";
import type { UsuarioConAcceso } from "./tipos";

export type Severidad = "info" | "alerta" | "urgente";

export interface Notificacion {
  id: string;
  modulo: string | null;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  severidad: Severidad;
  creado_en: string;
  leida: boolean;
}

export interface NuevaNotificacion {
  /** Slug de la app (p. ej. "finanzas"), o null para que la vean todos. */
  modulo: string | null;
  tipo: string;
  titulo: string;
  cuerpo?: string;
  enlace?: string;
  severidad?: Severidad;
  /** Llave única para no duplicar el mismo aviso entre corridas. */
  clave: string;
}

/** Crea una notificación si no existe otra con la misma `clave`. Devuelve true si la creó. */
export async function crearNotificacion(datos: NuevaNotificacion): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("notificaciones")
    .upsert(
      {
        modulo: datos.modulo,
        tipo: datos.tipo,
        titulo: datos.titulo,
        cuerpo: datos.cuerpo ?? null,
        enlace: datos.enlace ?? null,
        severidad: datos.severidad ?? "info",
        clave: datos.clave,
      },
      { onConflict: "clave", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    console.error(`[buzon] no se pudo crear "${datos.clave}": ${error.message}`);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Los slugs de módulo cuyas notificaciones ve esta persona (null = admin, ve todo). */
async function modulosVisibles(usuario: UsuarioConAcceso): Promise<string[] | null> {
  if (usuario.rol === "admin") return null;
  const apps = await listarAplicaciones();
  return apps.filter((a) => usuario.aplicacionIds.includes(a.id)).map((a) => a.slug);
}

/** Notificaciones que ve esta persona, más recientes primero, con el estado leída/no leída. */
export async function listarNotificaciones(usuario: UsuarioConAcceso, limite = 30): Promise<Notificacion[]> {
  const modulos = await modulosVisibles(usuario);

  let query = supabaseAdmin
    .from("notificaciones")
    .select("id, modulo, tipo, titulo, cuerpo, enlace, severidad, creado_en")
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (modulos !== null) {
    query = modulos.length
      ? query.or(`modulo.is.null,modulo.in.(${modulos.join(",")})`)
      : query.is("modulo", null);
  }

  const { data: notis, error } = await query;
  if (error || !notis) {
    if (error) console.error(`[buzon] no se pudieron leer: ${error.message}`);
    return [];
  }
  if (notis.length === 0) return [];

  const { data: vistas } = await supabaseAdmin
    .from("notificaciones_vistas")
    .select("notificacion_id")
    .eq("usuario_id", usuario.id)
    .in("notificacion_id", notis.map((n) => n.id));
  const leidas = new Set((vistas ?? []).map((v) => v.notificacion_id));

  return notis.map((n) => ({ ...(n as Omit<Notificacion, "leida">), leida: leidas.has(n.id) }));
}

/** Marca como leídas. Sin `ids`, todas las visibles de esta persona. */
export async function marcarLeidas(usuario: UsuarioConAcceso, ids?: string[]): Promise<void> {
  let objetivo = ids;
  if (!objetivo) {
    const notis = await listarNotificaciones(usuario, 100);
    objetivo = notis.filter((n) => !n.leida).map((n) => n.id);
  }
  if (!objetivo.length) return;

  await supabaseAdmin
    .from("notificaciones_vistas")
    .upsert(
      objetivo.map((notificacion_id) => ({ notificacion_id, usuario_id: usuario.id })),
      { onConflict: "notificacion_id,usuario_id", ignoreDuplicates: true }
    );
}
