import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import {
  puedeVerTarea,
  type AccionHistorial,
  type ArchivoNota,
  type EstadoTarea,
  type EventoHistorial,
  type Nota,
  type Prioridad,
  type Tarea,
} from "./tareas-modelo";

// -----------------------------------------------------------------------------
//  Tareas (CRM): lo que toca la base (solo servidor).
//
//  No revisa permisos: cada Server Action exige la app "tareas" y que la persona pueda
//  ver la tarea (puedeVerTarea) antes de llamar acá. listarTareas sí filtra.
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
  responsables: r.responsables ?? [], asignadoPor: r.asignado_por ?? null, visibleGeneral: r.visible_general ?? true, fechaLimite: r.fecha_limite, orden: Number(r.orden),
  creadoPor: r.creado_por, creadoEn: r.creado_en,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function revienta(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`[tareas] ${contexto}: ${error.message}`);
}

/** Las tareas que `correo` puede ver: las de vista general y las privadas donde participa. */
export async function listarTareas(correo: string): Promise<Tarea[]> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("*").order("orden");
  revienta("listar tareas", error);
  return (data ?? []).map(aTarea).filter((t) => puedeVerTarea(t, correo));
}

export interface DatosTarea {
  titulo: string;
  descripcion: string | null;
  prioridad: Prioridad;
  responsables: string[];
  asignadoPor: string | null;
  visibleGeneral: boolean;
  fechaLimite: string | null;
}

/** Crea la tarea al final de su columna. */
export async function crearTarea(estado: EstadoTarea, d: DatosTarea, creadoPor: string): Promise<string> {
  const { data: ultima } = await supabaseAdmin
    .from(TABLA).select("orden").eq("estado", estado).order("orden", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabaseAdmin.from(TABLA).insert({
    titulo: d.titulo, descripcion: d.descripcion, prioridad: d.prioridad, responsables: d.responsables, asignado_por: d.asignadoPor, visible_general: d.visibleGeneral,
    fecha_limite: d.fechaLimite, estado, orden: Number(ultima?.orden ?? 0) + 1000, creado_por: creadoPor,
  }).select("id").single();
  revienta("crear tarea", error);
  return data!.id as string;
}

export async function actualizarTarea(id: string, d: DatosTarea): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).update({
    titulo: d.titulo, descripcion: d.descripcion, prioridad: d.prioridad, responsables: d.responsables, asignado_por: d.asignadoPor, visible_general: d.visibleGeneral,
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

// ---------- Historial --------------------------------------------------------

const HISTORIAL = "crm_tareas_historial";

export async function registrarEvento(
  tareaId: string,
  accion: AccionHistorial,
  detalle: string | null,
  quien: { correo: string; nombre: string | null },
): Promise<void> {
  // El historial acompaña: si falla, la tarea igual quedó guardada.
  const { error } = await supabaseAdmin.from(HISTORIAL).insert({
    tarea_id: tareaId, accion, detalle, correo: quien.correo, nombre: quien.nombre,
  });
  if (error) console.warn("[tareas] No se pudo registrar el historial:", error.message);
}

export async function listarHistorial(tareaId: string): Promise<EventoHistorial[]> {
  const { data, error } = await supabaseAdmin
    .from(HISTORIAL).select("*").eq("tarea_id", tareaId).order("creado_en", { ascending: false }).limit(100);
  revienta("leer historial", error);
  return (data ?? []).map((r) => ({
    id: r.id, accion: r.accion, detalle: r.detalle, correo: r.correo, nombre: r.nombre, creadoEn: r.creado_en,
  }));
}

export async function eliminarTarea(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).delete().eq("id", id);
  revienta("eliminar tarea", error);
}

// ---------- Notas y adjuntos -------------------------------------------------

const NOTAS = "crm_tareas_notas";
const BUCKET = "tareas";

/* eslint-disable @typescript-eslint/no-explicit-any */
const aNota = (r: any): Nota => ({
  id: r.id, texto: r.texto, archivos: Array.isArray(r.archivos) ? r.archivos : [], correo: r.correo,
  nombre: r.nombre, creadoEn: r.creado_en,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listarNotas(tareaId: string): Promise<Nota[]> {
  const { data, error } = await supabaseAdmin
    .from(NOTAS).select("*").eq("tarea_id", tareaId).order("creado_en", { ascending: false });
  revienta("leer notas", error);
  return (data ?? []).map(aNota);
}

export async function obtenerNota(id: string): Promise<(Nota & { tareaId: string }) | null> {
  const { data, error } = await supabaseAdmin.from(NOTAS).select("*").eq("id", id).maybeSingle();
  revienta("leer nota", error);
  return data ? { ...aNota(data), tareaId: data.tarea_id as string } : null;
}

/**
 * Sube un adjunto al bucket privado y devuelve su ruta: `<tarea>/<uuid>.<ext>`. El nombre
 * real se guarda aparte en la nota; en el bucket va un uuid (los nombres traen tildes,
 * espacios y se repiten).
 */
export async function subirAdjunto(tareaId: string, contenido: Buffer, extension: string, tipo: string): Promise<string> {
  const ruta = `${tareaId}/${randomUUID()}.${extension}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(ruta, contenido, { contentType: tipo, upsert: false });
  revienta("subir archivo", error);
  return ruta;
}

export async function borrarAdjuntos(rutas: string[]): Promise<void> {
  if (rutas.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(rutas);
  if (error) console.warn(`[tareas] No se pudieron borrar ${rutas.length} archivo(s):`, error.message);
}

/** Enlace de descarga de un minuto, con el nombre original del archivo. */
export async function enlaceAdjunto(ruta: string, nombre: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ruta, 60, { download: nombre });
  revienta("firmar enlace", error);
  return data!.signedUrl;
}

export async function crearNota(
  tareaId: string,
  texto: string | null,
  archivos: ArchivoNota[],
  quien: { correo: string; nombre: string | null },
): Promise<string> {
  const { data, error } = await supabaseAdmin.from(NOTAS).insert({
    tarea_id: tareaId, texto, archivos, correo: quien.correo, nombre: quien.nombre,
  }).select("id").single();
  revienta("guardar nota", error);
  return data!.id as string;
}

export async function eliminarNota(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(NOTAS).delete().eq("id", id);
  revienta("eliminar nota", error);
}

/** Todas las rutas de adjuntos de una tarea, para borrarlas junto con ella. */
export async function rutasDeTarea(tareaId: string): Promise<string[]> {
  const notas = await listarNotas(tareaId);
  return notas.flatMap((n) => n.archivos.map((a) => a.ruta));
}

// ---------- Mi Día -----------------------------------------------------------

/** Las tareas no hechas donde `correo` es responsable (sin importar la visibilidad: son suyas). */
export async function tareasPendientesDe(correo: string): Promise<Tarea[]> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("*").neq("estado", "hecho");
  revienta("leer tareas pendientes", error);
  const c = correo.toLowerCase();
  return (data ?? []).map(aTarea).filter((t) => t.responsables.some((r) => r.toLowerCase() === c));
}

/**
 * Si la persona tiene la app Tareas (o es admin del Core). Para el cron del resumen
 * diario, que no tiene la sesión completa de cada destinatario.
 */
export async function usaTareas(usuarioId: string): Promise<boolean> {
  const [{ data: u }, { data: app }] = await Promise.all([
    supabaseAdmin.from("usuarios").select("rol").eq("id", usuarioId).maybeSingle(),
    supabaseAdmin.from("aplicaciones").select("id").eq("slug", "tareas").maybeSingle(),
  ]);
  if (u?.rol === "admin") return true;
  if (!app?.id) return false;
  const { data } = await supabaseAdmin
    .from("usuario_aplicaciones").select("usuario_id").eq("usuario_id", usuarioId).eq("aplicacion_id", app.id).maybeSingle();
  return Boolean(data);
}
