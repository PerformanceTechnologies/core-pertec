import { supabaseAdmin } from "./supabase-admin";
import type { Aplicacion, ColorApp, EstadoApp, TipoApp } from "./tipos";

export async function listarAplicaciones(): Promise<Aplicacion[]> {
  const { data } = await supabaseAdmin
    .from("aplicaciones")
    .select("*")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  return (data ?? []) as Aplicacion[];
}

export async function obtenerAplicacionPorId(id: string): Promise<Aplicacion | null> {
  const { data } = await supabaseAdmin.from("aplicaciones").select("*").eq("id", id).maybeSingle();
  return (data as Aplicacion) ?? null;
}

export async function obtenerAplicacionPorSlug(slug: string): Promise<Aplicacion | null> {
  const { data } = await supabaseAdmin
    .from("aplicaciones")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Aplicacion) ?? null;
}

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
