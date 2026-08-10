import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { accessTokenDeUsuario } from "@/lib/graph-credenciales";
import { obtenerCorreosRecientes } from "@/lib/graph-correo";
import { hoyEnSantiago, obtenerReunionesProximas } from "@/lib/graph-calendario";
import { generarResumen } from "./generar";
import type { EstadoResumen, ResumenDiario, ResumenGuardado } from "./tipos";

/**
 * El resumen del día: lo lee de la caché o lo genera.
 *
 * La caché es por (usuario, fecha) y existe por dos razones. Una es plata: sin
 * ella cada F5 de /mi-dia dispara una llamada al modelo sobre 60 correos. La
 * otra es coherencia: el correo de las 7:30 y la página tienen que mostrar el
 * MISMO resumen, no dos generaciones distintas del mismo día.
 */

export async function leerResumenGuardado(usuarioId: string, fecha: string): Promise<ResumenGuardado | null> {
  const { data } = await supabaseAdmin
    .from("resumen_diario")
    .select("fecha, resumen, generado_en, enviado_en")
    .eq("usuario_id", usuarioId)
    .eq("fecha", fecha)
    .maybeSingle();

  if (!data) return null;
  return {
    fecha: data.fecha as string,
    resumen: data.resumen as ResumenDiario,
    generadoEn: data.generado_en as string,
    enviadoEn: (data.enviado_en as string | null) ?? null,
  };
}

async function guardar(usuarioId: string, fecha: string, resumen: ResumenDiario): Promise<ResumenGuardado> {
  const generadoEn = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("resumen_diario")
    .upsert(
      { usuario_id: usuarioId, fecha, resumen, generado_en: generadoEn },
      { onConflict: "usuario_id,fecha" },
    );
  if (error) throw new Error(error.message);
  return { fecha, resumen, generadoEn, enviadoEn: null };
}

export async function marcarEnviado(usuarioId: string, fecha: string): Promise<void> {
  await supabaseAdmin
    .from("resumen_diario")
    .update({ enviado_en: new Date().toISOString() })
    .eq("usuario_id", usuarioId)
    .eq("fecha", fecha);
}

interface OpcionesResumen {
  usuarioId: string;
  nombre: string;
  /**
   * Token de la sesión activa, si hay. Cuando la persona abre /mi-dia se usa
   * este y no se toca la credencial guardada: es un token que ya está en la
   * mano, fresco, y evita un canje contra Entra por cada visita.
   *
   * El cron no tiene sesión, así que pasa undefined y cae al token guardado.
   */
  accessTokenSesion?: string;
  /** true fuerza regenerar aunque ya exista el de hoy (botón "actualizar"). */
  forzar?: boolean;
}

/**
 * Devuelve el resumen de hoy, generándolo si hace falta.
 *
 * Nunca lanza por un problema de permisos o de Graph: devuelve el estado para
 * que la página muestre "conectá tu cuenta" o el motivo del error. Sí puede
 * lanzar si falta ANTHROPIC_API_KEY o si la base falla, que son errores de
 * configuración y conviene que se vean.
 */
export async function obtenerResumenDeHoy(opciones: OpcionesResumen): Promise<EstadoResumen> {
  const { usuarioId, nombre, accessTokenSesion, forzar = false } = opciones;
  const hoy = hoyEnSantiago();

  if (!forzar) {
    const guardado = await leerResumenGuardado(usuarioId, hoy.iso);
    if (guardado) return { estado: "ok", datos: guardado };
  }

  let accessToken = accessTokenSesion;
  if (!accessToken) {
    const resultado = await accessTokenDeUsuario(usuarioId);
    if (resultado.estado === "sin_credencial") return { estado: "sin_permiso" };
    if (resultado.estado === "rechazado") {
      return { estado: "error", motivo: `Microsoft rechazó el acceso: ${resultado.motivo}` };
    }
    accessToken = resultado.accessToken;
  }

  // Correo y calendario son independientes: en paralelo, y así el tiempo de
  // pared es el del más lento y no la suma de los dos.
  const [correos, reuniones] = await Promise.all([
    obtenerCorreosRecientes(accessToken, 24),
    obtenerReunionesProximas(accessToken, 1),
  ]);

  // Sin correo no hay resumen que valga la pena: el calendario solo ya lo
  // muestra el widget del dashboard.
  if (correos.estado === "sin_permiso") return { estado: "sin_permiso" };
  if (correos.estado === "error") return { estado: "error", motivo: correos.motivo };

  const resumen = await generarResumen(
    nombre,
    correos.correos,
    reuniones.estado === "ok" ? reuniones.reuniones : [],
    hoy.iso,
  );

  return { estado: "ok", datos: await guardar(usuarioId, hoy.iso, resumen) };
}

export interface DestinatarioResumen {
  id: string;
  nombre: string;
  correo: string;
}

/**
 * Los usuarios a los que el cron les tiene que generar el resumen.
 *
 * Es la intersección de tres cosas, y las tres importan: que estén activos, que
 * tengan la app asignada (o sean admin) y que tengan credencial de Graph
 * guardada. Sin el último filtro el cron intentaría leer el buzón de gente que
 * nunca dio el permiso y llenaría los logs de errores.
 */
export async function destinatariosDelCron(slugApp: string): Promise<DestinatarioResumen[]> {
  const [{ data: app }, { data: credenciales }] = await Promise.all([
    supabaseAdmin.from("aplicaciones").select("id").eq("slug", slugApp).maybeSingle(),
    supabaseAdmin.from("graph_credenciales").select("usuario_id"),
  ]);

  const conCredencial = new Set((credenciales ?? []).map((c) => c.usuario_id as string));
  if (conCredencial.size === 0) return [];

  const { data: usuarios } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, correo, rol")
    .eq("activo", true);

  const { data: asignaciones } = app?.id
    ? await supabaseAdmin.from("usuario_aplicaciones").select("usuario_id").eq("aplicacion_id", app.id)
    : { data: [] as { usuario_id: string }[] };

  const asignados = new Set((asignaciones ?? []).map((a) => a.usuario_id as string));

  return (usuarios ?? [])
    .filter((u) => conCredencial.has(u.id as string))
    .filter((u) => u.rol === "admin" || asignados.has(u.id as string))
    .map((u) => ({
      id: u.id as string,
      nombre: (u.nombre as string) ?? (u.correo as string),
      correo: u.correo as string,
    }));
}
