import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import { olvidarDashboard } from "./memoria-dashboard";
import { listarAplicaciones } from "./aplicaciones";
import { listarUsuarios } from "./usuarios";
import { APP_DE_MODULO, type ModuloConResponsables } from "./plazos-modelo";

const TABLA = "ct_modulos_responsables";

export interface ResponsableDeModulo {
  id: string;
  nombre: string;
}

export type ResponsablesPorModulo = Partial<Record<ModuloConResponsables, ResponsableDeModulo[]>>;

/**
 * Los responsables de todos los submódulos, en UNA consulta.
 *
 * Envuelta en cache() de React por lo mismo que listarPlazos: el encabezado de cada módulo y el
 * tablero piden lo mismo dentro de una petición. NUNCA lanza: es un adorno de la cabecera y del
 * tablero, y si la tabla no existe todavía (migración 0025 sin correr) la pantalla tiene que
 * seguir en pie, solo que sin responsables.
 */
export const listarResponsablesDeModulos = cache(
  async function listarResponsablesDeModulos(): Promise<ResponsablesPorModulo> {
    // Dos consultas y no un embed de PostgREST: la tabla tiene DOS claves hacia usuarios
    // (usuario_id y asignado_por) y el embed sin nombrar cuál falla por ambiguo.
    const { data, error } = await supabaseAdmin
      .from(TABLA)
      .select("modulo, usuario_id")
      .order("creado_en", { ascending: true });
    if (error) {
      console.error(
        `[responsables] No se pudo leer ${TABLA}. ¿Se corrió supabase/contratos/0001_contratos.sql? Detalle: ${error.message}`,
      );
      return {};
    }

    const filas = (data ?? []) as { modulo: ModuloConResponsables; usuario_id: string }[];
    if (filas.length === 0) return {};

    const { data: usuarios, error: errorUsuarios } = await supabaseAdmin
      .from("usuarios")
      .select("id, nombre, correo, activo")
      .in("id", [...new Set(filas.map((f) => f.usuario_id))]);
    if (errorUsuarios) {
      console.error(`[responsables] No se pudo leer los usuarios: ${errorUsuarios.message}`);
      return {};
    }
    const porId = new Map(
      ((usuarios ?? []) as { id: string; nombre: string | null; correo: string; activo: boolean }[]).map((u) => [u.id, u]),
    );

    const salida: ResponsablesPorModulo = {};
    for (const f of filas) {
      const u = porId.get(f.usuario_id);
      // Un usuario dado de baja deja de ser responsable a efectos prácticos: no entra, no ve avisos.
      if (!u || !u.activo) continue;
      (salida[f.modulo] ??= []).push({ id: u.id, nombre: u.nombre?.trim() || u.correo });
    }
    return salida;
  },
);

/**
 * A quién se puede elegir como responsable de un submódulo: las personas activas que lo pueden
 * abrir (un admin siempre; el resto, con la aplicación asignada).
 *
 * Elegir a alguien que no tiene el módulo le llenaría Mi Día de enlaces que la pantalla rebota.
 */
export async function candidatosDeModulo(modulo: ModuloConResponsables): Promise<ResponsableDeModulo[]> {
  const [usuarios, apps] = await Promise.all([listarUsuarios(), listarAplicaciones()]);
  const appId = apps.find((a) => a.slug === APP_DE_MODULO[modulo])?.id;

  return usuarios
    .filter((u) => u.activo && (u.rol === "admin" || (appId !== undefined && u.aplicacionIds.includes(appId))))
    .map((u) => ({ id: u.id, nombre: u.nombre?.trim() || u.correo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** De qué submódulos responde esta persona. Para Mi Día. Nunca lanza. */
export async function modulosDeResponsable(usuarioId: string): Promise<ModuloConResponsables[]> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("modulo").eq("usuario_id", usuarioId);
  if (error) {
    console.error(`[responsables] No se pudo leer los módulos de ${usuarioId}: ${error.message}`);
    return [];
  }
  return ((data ?? []) as { modulo: ModuloConResponsables }[]).map((f) => f.modulo);
}

/**
 * Deja exactamente `ids` como responsables del módulo.
 *
 * Se validan contra los candidatos reales: la lista llega del navegador, y una acción es un
 * endpoint. Devuelve a quién se sumó y a quién se sacó, para que Mi Día de esas personas se rehaga
 * (ver olvidarMiDia).
 */
export async function guardarResponsablesDeModulo(datos: {
  modulo: ModuloConResponsables;
  ids: string[];
  asignadoPor: string;
}): Promise<{ afectados: string[] }> {
  const candidatos = await candidatosDeModulo(datos.modulo);
  const validos = new Set(candidatos.map((c) => c.id));
  const nuevos = [...new Set(datos.ids)];
  if (nuevos.some((id) => !validos.has(id))) {
    throw new Error("Alguna de las personas elegidas ya no está disponible para este módulo.");
  }

  const { data: actuales, error: errorLectura } = await supabaseAdmin
    .from(TABLA)
    .select("usuario_id")
    .eq("modulo", datos.modulo);
  if (errorLectura) throw new Error(errorLectura.message);
  const antes = new Set(((actuales ?? []) as { usuario_id: string }[]).map((f) => f.usuario_id));

  const sobran = [...antes].filter((id) => !nuevos.includes(id));
  const faltan = nuevos.filter((id) => !antes.has(id));

  if (sobran.length > 0) {
    const { error } = await supabaseAdmin
      .from(TABLA)
      .delete()
      .eq("modulo", datos.modulo)
      .in("usuario_id", sobran);
    if (error) throw new Error(error.message);
  }
  if (faltan.length > 0) {
    const { error } = await supabaseAdmin.from(TABLA).insert(
      faltan.map((usuario_id) => ({ modulo: datos.modulo, usuario_id, asignado_por: datos.asignadoPor })),
    );
    if (error) throw new Error(error.message);
  }

  olvidarDashboard();
  return { afectados: [...sobran, ...faltan] };
}

/** Los ids de quienes responden por este módulo: a ellos les cambia el Mi Día si se mueve su plazo. */
export async function idsDeResponsablesDe(modulo: ModuloConResponsables): Promise<string[]> {
  return ((await listarResponsablesDeModulos())[modulo] ?? []).map((r) => r.id);
}
