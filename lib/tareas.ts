import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { EstadoTarea, Prioridad, Tarea } from "./tareas-modelo";

// -----------------------------------------------------------------------------
//  Tareas (CRM): lo que toca la base (solo servidor).
//
//  No revisa permisos: cada Server Action exige la app "tareas" antes de llamar acá.
// -----------------------------------------------------------------------------

const TABLA = "crm_tareas";

export interface Responsable {
  correo: string;
  nombre: string;
}

/** Las personas activas del Core: de acá se elige el responsable de una tarea. */
export async function listarResponsables(): Promise<Responsable[]> {
  const { data, error } = await supabaseAdmin.from("usuarios").select("correo, nombre").eq("activo", true);
  revienta("listar usuarios", error);
  return (data ?? [])
    .map((u) => ({ correo: u.correo as string, nombre: (u.nombre as string | null) || (u.correo as string).split("@")[0] }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const aTarea = (r: any): Tarea => ({
  id: r.id, titulo: r.titulo, descripcion: r.descripcion, estado: r.estado, prioridad: r.prioridad,
  responsables: r.responsables ?? [], asignadoPor: r.asignado_por ?? null, fechaLimite: r.fecha_limite, orden: Number(r.orden),
  creadoPor: r.creado_por, creadoEn: r.creado_en,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function revienta(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`[tareas] ${contexto}: ${error.message}`);
}

export async function listarTareas(): Promise<Tarea[]> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("*").order("orden");
  revienta("listar tareas", error);
  return (data ?? []).map(aTarea);
}

export interface DatosTarea {
  titulo: string;
  descripcion: string | null;
  prioridad: Prioridad;
  responsables: string[];
  asignadoPor: string | null;
  fechaLimite: string | null;
}

/** Crea la tarea al final de su columna. */
export async function crearTarea(estado: EstadoTarea, d: DatosTarea, creadoPor: string): Promise<string> {
  const { data: ultima } = await supabaseAdmin
    .from(TABLA).select("orden").eq("estado", estado).order("orden", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabaseAdmin.from(TABLA).insert({
    titulo: d.titulo, descripcion: d.descripcion, prioridad: d.prioridad, responsables: d.responsables, asignado_por: d.asignadoPor,
    fecha_limite: d.fechaLimite, estado, orden: Number(ultima?.orden ?? 0) + 1000, creado_por: creadoPor,
  }).select("id").single();
  revienta("crear tarea", error);
  return data!.id as string;
}

export async function actualizarTarea(id: string, d: DatosTarea): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).update({
    titulo: d.titulo, descripcion: d.descripcion, prioridad: d.prioridad, responsables: d.responsables, asignado_por: d.asignadoPor,
    fecha_limite: d.fechaLimite, actualizado_en: new Date().toISOString(),
  }).eq("id", id);
  revienta("guardar tarea", error);
}

export async function obtenerTarea(id: string): Promise<Tarea | null> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("*").eq("id", id).maybeSingle();
  revienta("leer tarea", error);
  return data ? aTarea(data) : null;
}

export async function moverTarea(id: string, estado: EstadoTarea, orden: number): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA)
    .update({ estado, orden, actualizado_en: new Date().toISOString() }).eq("id", id);
  revienta("mover tarea", error);
}

export async function eliminarTarea(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).delete().eq("id", id);
  revienta("eliminar tarea", error);
}
