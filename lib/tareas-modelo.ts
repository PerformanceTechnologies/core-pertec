// Tareas (CRM): el vocabulario del tablero.
//
// Sin "server-only": lo usan el tablero (cliente), el servidor y las pruebas.

export const SLUG_APP_TAREAS = "tareas";

export const COLUMNAS = [
  { estado: "por_hacer", titulo: "Por hacer", punto: "bg-slate-400" },
  { estado: "en_curso", titulo: "En curso", punto: "bg-amber-500" },
  { estado: "hecho", titulo: "Hecho", punto: "bg-emerald-500" },
] as const;
export type EstadoTarea = (typeof COLUMNAS)[number]["estado"];

export const PRIORIDADES = [
  { valor: "baja", etiqueta: "Baja", tono: "bg-sky-500/10 text-sky-700 dark:text-sky-300", barra: "bg-sky-400" },
  { valor: "media", etiqueta: "Media", tono: "bg-amber-500/10 text-amber-700 dark:text-amber-300", barra: "bg-amber-400" },
  { valor: "alta", etiqueta: "Alta", tono: "bg-rose-500/10 text-rose-600 dark:text-rose-300", barra: "bg-rose-500" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["valor"];

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: Prioridad;
  /** Correos de los usuarios a cargo. */
  responsables: string[];
  /** Correo de quien asignó la tarea. */
  asignadoPor: string | null;
  fechaLimite: string | null;
  orden: number;
  creadoPor: string | null;
  creadoEn: string;
}

export function esEstado(v: unknown): v is EstadoTarea {
  return COLUMNAS.some((c) => c.estado === v);
}

export function esPrioridad(v: unknown): v is Prioridad {
  return PRIORIDADES.some((p) => p.valor === v);
}

/**
 * El orden para dejar una tarjeta entre dos vecinas de la columna (null = no hay vecina
 * por ese lado). Con números fraccionarios basta actualizar UNA fila al mover.
 */
export function ordenEntre(antes: number | null, despues: number | null): number {
  if (antes === null && despues === null) return 1000;
  if (antes === null) return despues! - 1000;
  if (despues === null) return antes + 1000;
  return (antes + despues) / 2;
}

/** Vencida si tiene fecha, ya pasó y no está hecha. */
export function estaVencida(t: { fechaLimite: string | null; estado: EstadoTarea }, hoy: Date = new Date()): boolean {
  if (!t.fechaLimite || t.estado === "hecho") return false;
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return new Date(t.fechaLimite + "T00:00:00").getTime() < base.getTime();
}

/** Iniciales para el avatar: "Alex Oliva" → "AO", "alex" → "AL". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export type AccionHistorial = "creada" | "editada" | "estado";

export interface EventoHistorial {
  id: string;
  accion: AccionHistorial;
  detalle: string | null;
  correo: string | null;
  nombre: string | null;
  creadoEn: string;
}

export function tituloDeColumna(estado: string): string {
  return COLUMNAS.find((c) => c.estado === estado)?.titulo ?? estado;
}

type Comparable = {
  titulo: string;
  descripcion: string | null;
  prioridad: string;
  responsables: string[];
  asignadoPor: string | null;
  fechaLimite: string | null;
};

/**
 * Lo que cambió entre dos versiones de una tarea, en palabras, para el historial.
 * `nombre` traduce un correo al nombre de la persona.
 */
export function describirCambios(antes: Comparable, despues: Comparable, nombre: (correo: string) => string): string[] {
  const cambios: string[] = [];
  const etiquetaPrioridad = (p: string) => PRIORIDADES.find((x) => x.valor === p)?.etiqueta ?? p;
  const fecha = (f: string | null) =>
    f ? new Date(f + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "sin fecha";
  const lista = (cs: string[]) => cs.map(nombre).join(", ");

  if (antes.titulo !== despues.titulo) cambios.push(`título a «${despues.titulo}»`);
  if ((antes.descripcion ?? "") !== (despues.descripcion ?? "")) cambios.push("la descripción");
  if (antes.prioridad !== despues.prioridad) {
    cambios.push(`prioridad de ${etiquetaPrioridad(antes.prioridad)} a ${etiquetaPrioridad(despues.prioridad)}`);
  }
  if (antes.fechaLimite !== despues.fechaLimite) cambios.push(`fecha límite a ${fecha(despues.fechaLimite)}`);

  const norm = (cs: string[]) => cs.map((c) => c.toLowerCase());
  const a = norm(antes.responsables);
  const d = norm(despues.responsables);
  const agregados = d.filter((c) => !a.includes(c));
  const quitados = a.filter((c) => !d.includes(c));
  if (agregados.length) cambios.push(`agregó a ${lista(agregados)} como responsable${agregados.length > 1 ? "s" : ""}`);
  if (quitados.length) cambios.push(`quitó a ${lista(quitados)} de responsable${quitados.length > 1 ? "s" : ""}`);

  if ((antes.asignadoPor ?? "").toLowerCase() !== (despues.asignadoPor ?? "").toLowerCase()) {
    cambios.push(`«asignado por» a ${despues.asignadoPor ? nombre(despues.asignadoPor) : "nadie"}`);
  }
  return cambios;
}
