"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import {
  actualizarTarea,
  crearTarea,
  eliminarTarea,
  listarResponsables,
  moverTarea,
  obtenerTarea,
  type DatosTarea,
} from "@/lib/tareas";
import { SLUG_APP_TAREAS, esEstado, esPrioridad } from "@/lib/tareas-modelo";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  const error = e instanceof Error ? e.message.replace(/^\[tareas\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

// Del formulario llega cualquier cosa: se arma la fila campo por campo. Responsables y
// "asignado por" se guardan por correo y tienen que ser personas activas del Core; al
// editar, se aceptan también los que la tarea ya tenía (alguien que después se desactivó).
async function leerDatos(fd: FormData, yaEstaban: string[] = []): Promise<DatosTarea | string> {
  const titulo = String(fd.get("titulo") ?? "").trim().slice(0, 200);
  if (!titulo) return "El título es obligatorio.";
  const prioridad = String(fd.get("prioridad") ?? "media");
  const fecha = String(fd.get("fechaLimite") ?? "");
  const validos = new Set([
    ...(await listarResponsables()).map((r) => r.correo.toLowerCase()),
    ...yaEstaban.map((c) => c.toLowerCase()),
  ]);
  const responsables = [
    ...new Set(fd.getAll("responsables").map((v) => String(v).trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 20);
  if (responsables.some((c) => !validos.has(c))) return "Los responsables tienen que ser usuarios activos del Core.";
  const asignadoPor = String(fd.get("asignadoPor") ?? "").trim().toLowerCase();
  if (asignadoPor && !validos.has(asignadoPor)) return "«Asignado por» tiene que ser un usuario activo del Core.";
  return {
    titulo,
    descripcion: String(fd.get("descripcion") ?? "").trim().slice(0, 4000) || null,
    prioridad: esPrioridad(prioridad) ? prioridad : "media",
    responsables,
    asignadoPor: asignadoPor || null,
    fechaLimite: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
  };
}

export async function crearTareaAction(estado: string, fd: FormData): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    if (!esEstado(estado)) return { ok: false, error: "Columna inválida." };
    const datos = await leerDatos(fd);
    if (typeof datos === "string") return { ok: false, error: datos };
    const id = await crearTarea(estado, datos, usuario.correo);
    revalidatePath("/tareas");
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarTareaAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_TAREAS);
    const actual = await obtenerTarea(id);
    if (!actual) return { ok: false, error: "Esa tarea ya no existe." };
    const datos = await leerDatos(fd, [...actual.responsables, ...(actual.asignadoPor ? [actual.asignadoPor] : [])]);
    if (typeof datos === "string") return { ok: false, error: datos };
    await actualizarTarea(id, datos);
    revalidatePath("/tareas");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function moverTareaAction(id: string, estado: string, orden: number): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_TAREAS);
    if (!esEstado(estado) || !Number.isFinite(orden)) return { ok: false, error: "Movimiento inválido." };
    await moverTarea(id, estado, orden);
    revalidatePath("/tareas");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarTareaAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_TAREAS);
    await eliminarTarea(id);
    revalidatePath("/tareas");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
