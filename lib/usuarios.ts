import { supabaseAdmin } from "./supabase-admin";
import type { Rol, UsuarioConAcceso, Usuario } from "./tipos";

// Se consulta en cada carga de página protegida (ver app/(protegido)/layout.tsx):
// si el admin borra o desactiva a alguien, pierde el acceso de inmediato,
// sin esperar a que expire su sesión.
export async function obtenerUsuarioActivo(
  correo: string | null | undefined
): Promise<UsuarioConAcceso | null> {
  if (!correo) return null;
  const correoNormalizado = correo.toLowerCase();

  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("*")
    .eq("correo", correoNormalizado)
    .eq("activo", true)
    .maybeSingle();

  if (!usuario) return null;

  const { data: asignaciones } = await supabaseAdmin
    .from("usuario_aplicaciones")
    .select("aplicacion_id")
    .eq("usuario_id", usuario.id);

  return {
    ...(usuario as Usuario),
    aplicacionIds: (asignaciones ?? []).map((a) => a.aplicacion_id as string),
  };
}

export async function listarUsuarios(): Promise<UsuarioConAcceso[]> {
  const { data: usuarios } = await supabaseAdmin
    .from("usuarios")
    .select("*")
    .order("creado_en", { ascending: false });

  const { data: asignaciones } = await supabaseAdmin
    .from("usuario_aplicaciones")
    .select("usuario_id, aplicacion_id");

  return (usuarios ?? []).map((usuario) => ({
    ...(usuario as Usuario),
    aplicacionIds: (asignaciones ?? [])
      .filter((a) => a.usuario_id === usuario.id)
      .map((a) => a.aplicacion_id as string),
  }));
}

export async function obtenerUsuarioPorId(id: string): Promise<UsuarioConAcceso | null> {
  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!usuario) return null;

  const { data: asignaciones } = await supabaseAdmin
    .from("usuario_aplicaciones")
    .select("aplicacion_id")
    .eq("usuario_id", id);

  return {
    ...(usuario as Usuario),
    aplicacionIds: (asignaciones ?? []).map((a) => a.aplicacion_id as string),
  };
}

export async function crearUsuario(datos: {
  correo: string;
  nombre: string;
  rol: Rol;
  aplicacionIds: string[];
}): Promise<void> {
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

  await reemplazarAsignaciones(usuario.id, datos.aplicacionIds);
}

export async function actualizarUsuario(
  id: string,
  datos: { nombre: string; rol: Rol; activo: boolean; aplicacionIds: string[] }
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

  await reemplazarAsignaciones(id, datos.aplicacionIds);
}

export async function eliminarUsuario(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("usuarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function reemplazarAsignaciones(usuarioId: string, aplicacionIds: string[]): Promise<void> {
  await supabaseAdmin.from("usuario_aplicaciones").delete().eq("usuario_id", usuarioId);

  if (aplicacionIds.length === 0) return;

  const { error } = await supabaseAdmin
    .from("usuario_aplicaciones")
    .insert(aplicacionIds.map((aplicacion_id) => ({ usuario_id: usuarioId, aplicacion_id })));

  if (error) throw new Error(error.message);
}
