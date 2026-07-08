import { supabaseAdmin } from "./supabase-admin";
import type { Aplicacion, ColorApp, EstadoApp } from "./tipos";

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

function generarSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function crearAplicacion(datos: {
  nombre: string;
  url: string;
  icono: string;
  color: ColorApp;
  descripcion: string;
  estado: EstadoApp;
  orden: number;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("aplicaciones").insert({
    nombre: datos.nombre.trim(),
    slug: generarSlug(datos.nombre),
    url: datos.url.trim(),
    icono: datos.icono,
    color: datos.color,
    descripcion: datos.descripcion.trim() || null,
    estado: datos.estado,
    orden: datos.orden,
  });

  if (error) throw new Error(error.message);
}

export async function actualizarAplicacion(
  id: string,
  datos: {
    nombre: string;
    url: string;
    icono: string;
    color: ColorApp;
    descripcion: string;
    estado: EstadoApp;
    orden: number;
  }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("aplicaciones")
    .update({
      nombre: datos.nombre.trim(),
      slug: generarSlug(datos.nombre),
      url: datos.url.trim(),
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
