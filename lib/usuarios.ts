import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import type { Rol, UsuarioConAcceso, Usuario } from "./tipos";

// Se consulta en cada carga de página protegida (ver app/(protegido)/layout.tsx):
// si el admin borra o desactiva a alguien, pierde el acceso de inmediato,
// sin esperar a que expire su sesión.
//
// Envuelto en cache() de React porque el layout protegido Y la pagina que
// renderiza dentro suelen pedir el mismo usuario en el mismo request (la
// pagina lo pide via su guard, exigirAdmin/exigirAccesoApp), lo que costaba
// 2 consultas duplicadas por navegacion. cache() deduplica SOLO dentro de un
// mismo pase de render, nunca entre requests, asi que la garantia de frescura
// del parrafo anterior se mantiene intacta. Fuera de un render (Route
// Handlers, Server Actions) no deduplica ni falla: se comporta igual que antes.
export const obtenerUsuarioActivo = cache(async function obtenerUsuarioActivo(
  correo: string | null | undefined,
): Promise<UsuarioConAcceso | null> {
  if (!correo) return null;
  const correoNormalizado = correo.toLowerCase();

  // Una sola consulta con las asignaciones embebidas, en vez de dos seguidas.
  //
  // La segunda necesitaba el id que devolvia la primera, asi que no podian ir en
  // paralelo: eran dos viajes de ida y vuelta encadenados a Supabase, y esto
  // corre en el layout de TODA pagina protegida del core. PostgREST resuelve el
  // embed por la foreign key usuario_aplicaciones_usuario_id_fkey.
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("*, usuario_aplicaciones(aplicacion_id, rol_extra)")
    .eq("correo", correoNormalizado)
    .eq("activo", true)
    .maybeSingle();

  // El embed lo sostiene la foreign key y nada mas. Si alguna vez se cae —o la
  // consulta falla por cualquier otra razon— se vuelve al camino de dos
  // consultas en vez de devolver null: null acá significa "no existe o esta
  // desactivado", y el layout lo traduce en un logout. Un embed roto NO puede
  // sacar a todo el mundo de la aplicacion.
  if (error) return await usuarioActivoEnDosConsultas(correoNormalizado);

  if (!usuario) return null;

  const { usuario_aplicaciones: embebidas, ...fila } = usuario as Usuario & {
    usuario_aplicaciones?: AsignacionCruda[];
  };
  const asignaciones = embebidas ?? (await consultarAsignaciones(fila.id));

  return {
    ...(fila as Usuario),
    aplicacionIds: asignaciones.map((a) => a.aplicacion_id),
    rolesExtra: mapaRolesExtra(asignaciones),
  };
});

interface AsignacionCruda {
  aplicacion_id: string;
  rol_extra: string | null;
}

/** El camino de antes: dos consultas encadenadas. Solo se usa si el embed falla. */
async function usuarioActivoEnDosConsultas(correoNormalizado: string): Promise<UsuarioConAcceso | null> {
  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("*")
    .eq("correo", correoNormalizado)
    .eq("activo", true)
    .maybeSingle();

  if (!usuario) return null;

  const asignaciones = await consultarAsignaciones((usuario as Usuario).id);
  return {
    ...(usuario as Usuario),
    aplicacionIds: asignaciones.map((a) => a.aplicacion_id),
    rolesExtra: mapaRolesExtra(asignaciones),
  };
}

async function consultarAsignaciones(usuarioId: string): Promise<AsignacionCruda[]> {
  const { data } = await supabaseAdmin
    .from("usuario_aplicaciones")
    .select("aplicacion_id, rol_extra")
    .eq("usuario_id", usuarioId);
  return (data ?? []) as AsignacionCruda[];
}

export async function listarUsuarios(): Promise<UsuarioConAcceso[]> {
  // Las dos consultas son independientes (la de asignaciones no filtra por
  // usuario, trae todas y despues se reparten en memoria), asi que van en
  // paralelo en vez de una esperando a la otra.
  const [{ data: usuarios }, { data: asignaciones }] = await Promise.all([
    supabaseAdmin.from("usuarios").select("*").order("creado_en", { ascending: false }),
    supabaseAdmin.from("usuario_aplicaciones").select("usuario_id, aplicacion_id, rol_extra"),
  ]);

  return (usuarios ?? []).map((usuario) => {
    const propias = (asignaciones ?? []).filter((a) => a.usuario_id === usuario.id);
    return {
      ...(usuario as Usuario),
      aplicacionIds: propias.map((a) => a.aplicacion_id as string),
      rolesExtra: mapaRolesExtra(propias),
    };
  });
}

export async function obtenerUsuarioPorId(id: string): Promise<UsuarioConAcceso | null> {
  const { data: usuario } = await supabaseAdmin.from("usuarios").select("*").eq("id", id).maybeSingle();

  if (!usuario) return null;

  const { data: asignaciones } = await supabaseAdmin
    .from("usuario_aplicaciones")
    .select("aplicacion_id, rol_extra")
    .eq("usuario_id", id);

  return {
    ...(usuario as Usuario),
    aplicacionIds: (asignaciones ?? []).map((a) => a.aplicacion_id as string),
    rolesExtra: mapaRolesExtra(asignaciones ?? []),
  };
}

// Se llama en cada login (ver callback jwt en auth.ts). Devuelve el valor
// ANTERIOR de ultimo_ingreso (antes de sobreescribirlo con el de ahora), para
// que el dashboard pueda mostrar "tu último ingreso fue..." -- si se
// devolviera el valor recién escrito, siempre mostraría "ahora mismo".
export async function registrarIngreso(correo: string): Promise<string | null> {
  const correoNormalizado = correo.toLowerCase();

  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("id, ultimo_ingreso")
    .eq("correo", correoNormalizado)
    .maybeSingle();

  if (!usuario) return null;

  await supabaseAdmin
    .from("usuarios")
    .update({ ultimo_ingreso: new Date().toISOString() })
    .eq("id", usuario.id);

  return usuario.ultimo_ingreso as string | null;
}

function mapaRolesExtra(
  asignaciones: { aplicacion_id: string; rol_extra: string | null }[],
): Record<string, string> {
  const mapa: Record<string, string> = {};
  asignaciones.forEach((a) => {
    if (a.rol_extra) mapa[a.aplicacion_id] = a.rol_extra;
  });
  return mapa;
}

export async function crearUsuario(datos: {
  correo: string;
  nombre: string;
  rol: Rol;
  aplicacionIds: string[];
  rolesExtra: Record<string, string>;
}): Promise<{ id: string }> {
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .insert({
      correo: datos.correo.toLowerCase().trim(),
      nombre: datos.nombre.trim() || null,
      rol: datos.rol,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await reemplazarAsignaciones(usuario.id, datos.aplicacionIds, datos.rolesExtra);
  return { id: usuario.id };
}

export async function actualizarUsuario(
  id: string,
  datos: {
    nombre: string;
    rol: Rol;
    activo: boolean;
    aplicacionIds: string[];
    rolesExtra: Record<string, string>;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("usuarios")
    .update({
      nombre: datos.nombre.trim() || null,
      rol: datos.rol,
      activo: datos.activo,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await reemplazarAsignaciones(id, datos.aplicacionIds, datos.rolesExtra);
}

export async function eliminarUsuario(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("usuarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function reemplazarAsignaciones(
  usuarioId: string,
  aplicacionIds: string[],
  rolesExtra: Record<string, string>,
): Promise<void> {
  await supabaseAdmin.from("usuario_aplicaciones").delete().eq("usuario_id", usuarioId);

  if (aplicacionIds.length === 0) return;

  const { error } = await supabaseAdmin.from("usuario_aplicaciones").insert(
    aplicacionIds.map((aplicacion_id) => ({
      usuario_id: usuarioId,
      aplicacion_id,
      rol_extra: rolesExtra[aplicacion_id] || null,
    })),
  );

  if (error) throw new Error(error.message);
}
