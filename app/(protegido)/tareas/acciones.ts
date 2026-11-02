"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import {
  actualizarTarea,
  borrarAdjuntos,
  crearTarea,
  eliminarNota,
  eliminarTarea,
  enlaceAdjunto,
  listarHistorial,
  listarNotas,
  listarResponsables,
  moverTarea,
  obtenerNota,
  obtenerTarea,
  registrarEvento,
  rutasDeTarea,
  type DatosTarea,
} from "@/lib/tareas";
import {
  SLUG_APP_TAREAS,
  describirCambios,
  esDeLaTarea,
  esEstado,
  esPrioridad,
  puedeVerTarea,
  tituloDeColumna,
  type EventoHistorial,
  type Nota,
  type Tarea,
} from "@/lib/tareas-modelo";
import type { UsuarioConAcceso } from "@/lib/tipos";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  const error = e instanceof Error ? e.message.replace(/^\[tareas\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

const NO_EXISTE = "Esa tarea ya no existe o no tienes acceso a ella.";

/**
 * La tarea, solo si `usuario` puede verla. Una tarea privada ajena responde lo mismo que
 * una inexistente: no se confirma que exista.
 */
async function tareaVisible(id: string, usuario: UsuarioConAcceso): Promise<Tarea | null> {
  const t = await obtenerTarea(id);
  return t && puedeVerTarea(t, usuario.correo) ? t : null;
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
    visibleGeneral: fd.get("visibleGeneral") !== "no",
    fechaLimite: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
  };
}

const SIN_QUEDAR_FUERA =
  "Para que no sea de vista general tienes que quedar como responsable o como quien la asignó; si no, dejarías de verla.";

export async function crearTareaAction(estado: string, fd: FormData): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    if (!esEstado(estado)) return { ok: false, error: "Columna inválida." };
    const datos = await leerDatos(fd);
    if (typeof datos === "string") return { ok: false, error: datos };
    if (!datos.visibleGeneral && !esDeLaTarea(datos, usuario.correo)) return { ok: false, error: SIN_QUEDAR_FUERA };
    const id = await crearTarea(estado, datos, usuario.correo);
    await registrarEvento(id, "creada", `en «${tituloDeColumna(estado)}»`, usuario);
    revalidatePath("/tareas");
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarTareaAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    const actual = await tareaVisible(id, usuario);
    if (!actual) return { ok: false, error: NO_EXISTE };
    const datos = await leerDatos(fd, [...actual.responsables, ...(actual.asignadoPor ? [actual.asignadoPor] : [])]);
    if (typeof datos === "string") return { ok: false, error: datos };

    // La visibilidad solo la cambian responsables y quien asignó (los de ANTES del cambio).
    if (datos.visibleGeneral !== actual.visibleGeneral && !esDeLaTarea(actual, usuario.correo)) {
      return { ok: false, error: "Solo los responsables o quien asignó la tarea pueden cambiar su visibilidad." };
    }
    // Una tarea privada no puede quedar sin que quien la guarda la siga viendo.
    if (!datos.visibleGeneral && !esDeLaTarea(datos, usuario.correo)) return { ok: false, error: SIN_QUEDAR_FUERA };

    await actualizarTarea(id, datos);
    const nombres = new Map((await listarResponsables()).map((r) => [r.correo.toLowerCase(), r.nombre]));
    const cambios = describirCambios(actual, datos, (c) => nombres.get(c.toLowerCase()) ?? c);
    if (cambios.length) await registrarEvento(id, "editada", cambios.join(" · "), usuario);
    revalidatePath("/tareas");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function moverTareaAction(id: string, estado: string, orden: number): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    if (!esEstado(estado) || !Number.isFinite(orden)) return { ok: false, error: "Movimiento inválido." };
    const actual = await tareaVisible(id, usuario);
    if (!actual) return { ok: false, error: NO_EXISTE };
    await moverTarea(id, estado, orden);
    // Reordenar dentro de la misma columna no es un cambio de estado: no va al historial.
    if (actual.estado !== estado) {
      await registrarEvento(id, "estado", `de «${tituloDeColumna(actual.estado)}» a «${tituloDeColumna(estado)}»`, usuario);
    }
    revalidatePath("/tareas");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarTareaAction(id: string): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    if (!(await tareaVisible(id, usuario))) return { ok: false, error: NO_EXISTE };
    const rutas = await rutasDeTarea(id);
    await eliminarTarea(id);
    await borrarAdjuntos(rutas);
    revalidatePath("/tareas");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function historialAction(id: string): Promise<{ ok: true; eventos: EventoHistorial[] } | { ok: false; error: string }> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    if (!(await tareaVisible(id, usuario))) return { ok: false, error: NO_EXISTE };
    return { ok: true, eventos: await listarHistorial(id) };
  } catch (e) {
    return fallo(e);
  }
}

export async function notasAction(id: string): Promise<{ ok: true; notas: Nota[] } | { ok: false; error: string }> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    if (!(await tareaVisible(id, usuario))) return { ok: false, error: NO_EXISTE };
    return { ok: true, notas: await listarNotas(id) };
  } catch (e) {
    return fallo(e);
  }
}

/** Solo quien escribió la nota la puede borrar; sus archivos se van con ella. */
export async function eliminarNotaAction(notaId: string): Promise<Resultado> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    const nota = await obtenerNota(notaId);
    if (!nota || !(await tareaVisible(nota.tareaId, usuario))) return { ok: false, error: "Esa nota ya no existe." };
    if (nota.correo.toLowerCase() !== usuario.correo.toLowerCase()) {
      return { ok: false, error: "Solo quien escribió la nota puede eliminarla." };
    }
    await eliminarNota(notaId);
    await borrarAdjuntos(nota.archivos.map((a) => a.ruta));
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Enlace firmado de un minuto para bajar un adjunto, si la persona puede ver la tarea. */
export async function descargarAdjuntoAction(notaId: string, indice: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const usuario = await exigirAccesoApp(SLUG_APP_TAREAS);
    const nota = await obtenerNota(notaId);
    if (!nota || !(await tareaVisible(nota.tareaId, usuario))) return { ok: false, error: "Ese archivo ya no existe." };
    const archivo = nota.archivos[indice];
    if (!archivo) return { ok: false, error: "Ese archivo ya no existe." };
    return { ok: true, url: await enlaceAdjunto(archivo.ruta, archivo.nombre) };
  } catch (e) {
    return fallo(e);
  }
}
