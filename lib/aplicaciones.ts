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

// Sube o baja una app un puesto en la lista y renumera el orden de TODAS
// (0, 1, 2...) según la posición resultante. Renumerar siempre en vez de
// solo intercambiar el campo "orden" de las dos apps movidas evita quedar
// pisado por empates (dos apps con el mismo "orden", desempatadas hoy por
// nombre) que harían que "subir" no cambiara nada visualmente.
export async function moverAplicacion(id: string, direccion: "arriba" | "abajo"): Promise<void> {
  const apps = await listarAplicaciones();
  const indice = apps.findIndex((a) => a.id === id);
  if (indice === -1) return;

  const destino = direccion === "arriba" ? indice - 1 : indice + 1;
  if (destino < 0 || destino >= apps.length) return; // ya está en el extremo

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
