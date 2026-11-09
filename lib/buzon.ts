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
  /** Correo de la única persona que la ve (avisos personales). Sin esto, la ven todos los del módulo. */
  destinatario?: string | null;
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
        destinatario: datos.destinatario ? datos.destinatario.toLowerCase() : null,
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

/**
 * Prefijo de la `clave` de lo que el Muro dejó en el buzón (`muro:<mensaje>:<persona>`), cuando
 * todavía avisaba por la campana con menciones y respuestas. Hoy ya no crea ninguna, pero las que
 * quedaron guardadas seguían apareciendo hasta que cada persona las abriera: lo del Muro se ve solo
 * en el Muro. Se descartan al leer (no se borran) y por el prefijo, no por el `tipo`, para que
 * cualquier aviso futuro del Muro quede fuera también.
 */
const PREFIJO_CLAVE_MURO = "muro:";

/** Los slugs de módulo cuyas notificaciones ve esta persona (null = admin, ve todo). */
async function modulosVisibles(usuario: UsuarioConAcceso): Promise<string[] | null> {
  if (usuario.rol === "admin") return null;
  const apps = await listarAplicaciones();
  return apps.filter((a) => usuario.aplicacionIds.includes(a.id)).map((a) => a.slug);
}

/**
 * Notificaciones que ve esta persona, más recientes primero, con el estado leída/no leída.
 * Las personales de otro no las ve nadie más, ni el admin. Con `soloPendientes`, solo las
 * que todavía no abrió (la campana muestra solo esas: al abrir una, desaparece).
 */
export async function listarNotificaciones(
  usuario: UsuarioConAcceso,
  limite = 30,
  soloPendientes = false,
): Promise<Notificacion[]> {
  const modulos = await modulosVisibles(usuario);
  // El correo va dentro de un filtro de PostgREST: entre comillas dobles, y sin las que pudiera traer.
  const correo = usuario.correo.toLowerCase().replace(/"/g, "");

  let query = supabaseAdmin
    .from("notificaciones")
    .select("id, modulo, tipo, titulo, cuerpo, enlace, severidad, creado_en")
    .or(`destinatario.is.null,destinatario.eq."${correo}"`)
    // Con `or` y no con un `not like` suelto: una clave vacía no es del Muro, y un NOT LIKE sobre
    // NULL descartaría la fila.
    .or(`clave.is.null,clave.not.like.${PREFIJO_CLAVE_MURO}*`)
    .order("creado_en", { ascending: false })
    // Con soloPendientes se piden más: las ya vistas se descartan después.
    .limit(soloPendientes ? limite * 4 : limite);
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

  const todas = notis.map((n) => ({ ...(n as Omit<Notificacion, "leida">), leida: leidas.has(n.id) }));
  return soloPendientes ? todas.filter((n) => !n.leida).slice(0, limite) : todas;
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
