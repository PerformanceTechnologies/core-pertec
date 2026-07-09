import "server-only";
import { pertecWebSupabase } from "./pertec-web-supabase";
import type { RolPanel } from "./permisos-panel";

export type { RolPanel, AccionPanel } from "./permisos-panel";
export { puedeEnPanel } from "./permisos-panel";

// Sin fila en app_roles, el usuario queda como visualizador (solo lectura) —
// igual que en el panel original.
export async function obtenerRolPanel(email: string | null | undefined): Promise<RolPanel> {
  if (!email) return "visualizador";
  const { data } = await pertecWebSupabase
    .from("app_roles")
    .select("role")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return (data?.role as RolPanel) ?? "visualizador";
}

// El admin del core ya significa "control total" (así se definió desde el
// diseño inicial, y es lo mismo que hace exigirAccesoApp con el catálogo de
// apps) — así que también es admin dentro de este panel, sin depender de
// que exista una fila suya en app_roles. Un usuario normal del core sigue
// usando lo que diga app_roles (o visualizador si no tiene fila ahí).
export async function resolverRolPanel(usuarioCore: { rol: string; correo: string }): Promise<RolPanel> {
  if (usuarioCore.rol === "admin") return "admin";
  return obtenerRolPanel(usuarioCore.correo);
}

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  orden: number;
  archivado: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto_inicial: number;
}

export interface Objetivo {
  id: string;
  proyecto_id: string;
  parent_id: string | null;
  titulo: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  hecho: boolean;
  color: string;
  orden: number;
  responsables: string[];
}

export interface ObjetivoComentario {
  id: string;
  objetivo_id: string;
  user_email: string | null;
  contenido: string;
  created_at: string;
}

export interface DatosObjetivo {
  titulo: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  color: string;
  hecho: boolean;
  responsables: string[];
  parent_id: string | null;
}

export async function listarProyectos(): Promise<Proyecto[]> {
  const { data } = await pertecWebSupabase
    .from("proyectos")
    .select("*")
    .eq("archivado", false)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as Proyecto[];
}

export async function obtenerProyecto(id: string): Promise<Proyecto | null> {
  const { data } = await pertecWebSupabase.from("proyectos").select("*").eq("id", id).maybeSingle();
  return (data as Proyecto) ?? null;
}

export async function crearProyecto(datos: {
  nombre: string;
  descripcion: string | null;
  color: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}): Promise<Proyecto> {
  const { data, error } = await pertecWebSupabase
    .from("proyectos")
    .insert({
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion?.trim() || null,
      color: datos.color,
      fecha_inicio: datos.fecha_inicio || null,
      fecha_fin: datos.fecha_fin || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Proyecto;
}

export async function actualizarProyecto(
  id: string,
  datos: { nombre: string; descripcion: string | null; color: string; fecha_inicio: string | null; fecha_fin: string | null }
): Promise<void> {
  const { error } = await pertecWebSupabase
    .from("proyectos")
    .update({
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion?.trim() || null,
      color: datos.color,
      fecha_inicio: datos.fecha_inicio || null,
      fecha_fin: datos.fecha_fin || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarProyecto(id: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("proyectos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listarObjetivos(proyectoId: string): Promise<Objetivo[]> {
  const { data } = await pertecWebSupabase
    .from("objetivos")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .order("fecha_inicio", { ascending: true })
    .order("orden", { ascending: true });
  return (data ?? []) as Objetivo[];
}

// Usado en el selector de proyectos para mostrar avance/vencimientos sin
// tener que abrir cada proyecto.
export async function listarObjetivosResumen(): Promise<
  Pick<Objetivo, "proyecto_id" | "hecho" | "fecha_inicio" | "fecha_fin">[]
> {
  const { data } = await pertecWebSupabase
    .from("objetivos")
    .select("proyecto_id, hecho, fecha_inicio, fecha_fin");
  return data ?? [];
}

export async function obtenerObjetivo(id: string): Promise<Objetivo | null> {
  const { data } = await pertecWebSupabase.from("objetivos").select("*").eq("id", id).maybeSingle();
  return (data as Objetivo) ?? null;
}

export async function crearObjetivo(proyectoId: string, datos: DatosObjetivo): Promise<void> {
  const { error } = await pertecWebSupabase.from("objetivos").insert({
    proyecto_id: proyectoId,
    parent_id: datos.parent_id,
    titulo: datos.titulo.trim(),
    descripcion: datos.descripcion?.trim() || null,
    fecha_inicio: datos.fecha_inicio,
    fecha_fin: datos.fecha_fin,
    color: datos.color,
    hecho: datos.hecho,
    responsables: datos.responsables,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarObjetivo(id: string, datos: DatosObjetivo): Promise<void> {
  const { error } = await pertecWebSupabase
    .from("objetivos")
    .update({
      parent_id: datos.parent_id,
      titulo: datos.titulo.trim(),
      descripcion: datos.descripcion?.trim() || null,
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      color: datos.color,
      hecho: datos.hecho,
      responsables: datos.responsables,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function alternarObjetivoHecho(id: string, hecho: boolean): Promise<void> {
  const { error } = await pertecWebSupabase.from("objetivos").update({ hecho }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarObjetivo(id: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("objetivos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Alta rápida de sub-objetivo: hereda fechas/color del padre para no dejar
// huecos en el Gantt ni chocar con columnas NOT NULL.
export async function crearSubObjetivo(padre: Objetivo, titulo: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("objetivos").insert({
    proyecto_id: padre.proyecto_id,
    parent_id: padre.id,
    titulo: titulo.trim(),
    fecha_inicio: padre.fecha_inicio,
    fecha_fin: padre.fecha_fin,
    color: padre.color,
    hecho: false,
  });
  if (error) throw new Error(error.message);
}

export async function listarComentarios(objetivoId: string): Promise<ObjetivoComentario[]> {
  const { data } = await pertecWebSupabase
    .from("objetivo_comentarios")
    .select("*")
    .eq("objetivo_id", objetivoId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ObjetivoComentario[];
}

export async function crearComentario(objetivoId: string, email: string, contenido: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("objetivo_comentarios").insert({
    objetivo_id: objetivoId,
    user_email: email,
    contenido: contenido.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function eliminarComentario(id: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("objetivo_comentarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
