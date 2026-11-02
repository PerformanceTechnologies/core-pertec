"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { actualizarTarea, crearTarea, eliminarTarea, listarResponsables, moverTarea, type DatosTarea } from "@/lib/tareas";
import { SLUG_APP_TAREAS, esEstado, esPrioridad } from "@/lib/tareas-modelo";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  const error = e instanceof Error ? e.message.replace(/^\[tareas\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

// Del formulario llega cualquier cosa: se arma la fila campo por campo. El responsable
// se guarda por correo y tiene que ser una persona activa del Core.
async function leerDatos(fd: FormData): Promise<DatosTarea | string> {
  const titulo = String(fd.get("titulo") ?? "").trim().slice(0, 200);
  if (!titulo) return "El título es obligatorio.";
  const prioridad = String(fd.get("prioridad") ?? "media");
  const fecha = String(fd.get("fechaLimite") ?? "");
  const responsable = String(fd.get("responsable") ?? "").trim().toLowerCase();
  if (responsable && !(await listarResponsables()).some((r) => r.correo.toLowerCase() === responsable)) {
    return "El responsable tiene que ser un usuario activo del Core.";
  }
  return {
    titulo,
    descripcion: String(fd.get("descripcion") ?? "").trim().slice(0, 4000) || null,
    prioridad: esPrioridad(prioridad) ? prioridad : "media",
    responsable: responsable || null,
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
    const datos = await leerDatos(fd);
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
