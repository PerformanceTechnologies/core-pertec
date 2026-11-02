import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import type { Aplicacion, ColorApp, EstadoApp, TipoApp } from "./tipos";

// Version sin cache, para los caminos que leen justo antes de escribir y por
// tanto necesitan el estado real de la tabla (ver moverAplicacion).
async function consultarAplicaciones(): Promise<Aplicacion[]> {
  const { data } = await supabaseAdmin
    .from("aplicaciones")
    .select("*")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  return (data ?? []) as Aplicacion[];
}

// Aplicaciones que se retiraron del Core pero cuya fila sigue en la tabla
// `aplicaciones` de produccion. Se filtran del catalogo para que no aparezcan
// ni en el dashboard, ni en el menu, ni en el buscador, ni en los permisos de
// los usuarios, y no lleven a una pagina que ya no existe. Cuando alguien
// borre la fila desde Administracion > Aplicaciones, se puede quitar de aca.
//   - panel-odoo: el Panel Odoo se saco (ya no se usa).
const APPS_RETIRADAS = new Set(["panel-odoo"]);

// El catalogo lo piden la barra lateral (en el layout protegido) y el
// dashboard en el mismo request, asi que sin cache() se consultaba dos veces
// por navegacion. Deduplica solo dentro de un pase de render, nunca entre
// requests: un cambio en el catalogo se sigue viendo en la navegacion
// siguiente, igual que antes.
export const listarAplicaciones = cache(async function listarAplicaciones(): Promise<Aplicacion[]> {
  return (await consultarAplicaciones()).filter((app) => !APPS_RETIRADAS.has(app.slug));
});

/**
 * Cuántas personas tienen asignada cada aplicación (aplicacion_id → cantidad), sin contar las
 * cuentas inactivas ni a los administradores: ellos ven todas por ser admin, no por asignación.
 * Es para Administración; null si la consulta falla (la pantalla funciona igual, sin esa columna).
 */
export async function contarUsuariosPorApp(): Promise<Map<string, number> | null> {
  const { data, error } = await supabaseAdmin
    .from("usuario_aplicaciones")
    .select("aplicacion_id, usuarios!inner(activo, rol)");
  if (error) {
    console.error(`[aplicaciones] No se pudo contar los usuarios por aplicación: ${error.message}`);
    return null;
  }
  const cuenta = new Map<string, number>();
  for (const fila of (data ?? []) as unknown as { aplicacion_id: string; usuarios: { activo: boolean; rol: string } | { activo: boolean; rol: string }[] | null }[]) {
    const usuario = Array.isArray(fila.usuarios) ? fila.usuarios[0] : fila.usuarios;
    if (!usuario?.activo || usuario.rol === "admin") continue;
    cuenta.set(fila.aplicacion_id, (cuenta.get(fila.aplicacion_id) ?? 0) + 1);
  }
  return cuenta;
}

// Sube o baja una app un puesto en la lista y renumera el orden de TODAS
// (0, 1, 2...) según la posición resultante. Renumerar siempre en vez de
// solo intercambiar el campo "orden" de las dos apps movidas evita quedar
// pisado por empates (dos apps con el mismo "orden", desempatadas hoy por
// nombre) que harían que "subir" no cambiara nada visualmente.
export async function moverAplicacion(
  id: string,
  direccion: "arriba" | "abajo",
  entre?: string[],
): Promise<void> {
  const apps = await consultarAplicaciones();
  const indice = apps.findIndex((a) => a.id === id);
  if (indice === -1) return;

  // Con `entre` (los ids de un grupo de la pantalla) se intercambia con el vecino DEL GRUPO, que
  // no es el de al lado en la lista completa: en Administración las apps se muestran agrupadas, y
  // subir "Otras" una posición no puede mover a una app de otro módulo y dejar todo igual a la vista.
  let destino: number;
  if (entre) {
    const delGrupo = apps.map((app, i) => ({ id: app.id, i })).filter((x) => entre.includes(x.id));
    const posicion = delGrupo.findIndex((x) => x.id === id);
    const vecino = delGrupo[direccion === "arriba" ? posicion - 1 : posicion + 1];
    if (posicion === -1 || !vecino) return; // ya está en el extremo del grupo
    destino = vecino.i;
  } else {
    destino = direccion === "arriba" ? indice - 1 : indice + 1;
    if (destino < 0 || destino >= apps.length) return; // ya está en el extremo
  }

  const reordenadas = [...apps];
  [reordenadas[indice], reordenadas[destino]] = [reordenadas[destino], reordenadas[indice]];

  const resultados = await Promise.all(
    reordenadas.map((app, i) => supabaseAdmin.from("aplicaciones").update({ orden: i }).eq("id", app.id))
  );
  const error = resultados.find((r) => r.error)?.error;
  if (error) throw new Error(error.message);
}

export async function obtenerAplicacionPorId(id: string): Promise<Aplicacion | null> {
  const { data } = await supabaseAdmin.from("aplicaciones").select("*").eq("id", id).maybeSingle();
  return (data as Aplicacion) ?? null;
}

// Lo consulta cada guard de app (verificarAccesoAppApi / exigirAccesoApp), y
// en una pagina protegida corre tanto en el guard de la pagina como en los de
// sus rutas anidadas dentro del mismo render: cache() colapsa esas repeticiones.
export const obtenerAplicacionPorSlug = cache(async function obtenerAplicacionPorSlug(
  slug: string
): Promise<Aplicacion | null> {
  const { data } = await supabaseAdmin
    .from("aplicaciones")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Aplicacion) ?? null;
});

function generarSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface DatosAplicacion {
  nombre: string;
  url: string;
  tipo: TipoApp;
  icono: string;
  color: ColorApp;
  descripcion: string;
  estado: EstadoApp;
  orden: number;
}

export async function crearAplicacion(datos: DatosAplicacion): Promise<void> {
  const { error } = await supabaseAdmin.from("aplicaciones").insert({
    nombre: datos.nombre.trim(),
    slug: generarSlug(datos.nombre),
    url: datos.url.trim(),
    tipo: datos.tipo,
    icono: datos.icono,
    color: datos.color,
    descripcion: datos.descripcion.trim() || null,
    estado: datos.estado,
    orden: datos.orden,
  });

  if (error) throw new Error(error.message);
}

export async function actualizarAplicacion(id: string, datos: DatosAplicacion): Promise<void> {
  // El slug no se toca al editar: es el identificador estable que usan las
  // páginas nativas (como /reclutamiento) para saber a qué app corresponden.
  // Si se regenerara con cada cambio de nombre, renombrar una app rompería
  // el acceso de los usuarios sin rol admin, sin ningún aviso visible.
  const { error } = await supabaseAdmin
    .from("aplicaciones")
    .update({
      nombre: datos.nombre.trim(),
      url: datos.url.trim(),
      tipo: datos.tipo,
      icono: datos.icono,
      color: datos.color,
      descripcion: datos.descripcion.trim() || null,
      estado: datos.estado,
      orden: datos.orden,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function eliminarAplicacion(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("aplicaciones").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
