// Tareas (CRM): el vocabulario del tablero.
//
// Sin "server-only": lo usan el tablero (cliente), el servidor y las pruebas.

export const SLUG_APP_TAREAS = "tareas";

export const COLUMNAS = [
  { estado: "por_hacer", titulo: "Por hacer" },
  { estado: "en_curso", titulo: "En curso" },
  { estado: "hecho", titulo: "Hecho" },
] as const;
export type EstadoTarea = (typeof COLUMNAS)[number]["estado"];

export const PRIORIDADES = [
  { valor: "baja", etiqueta: "Baja", tono: "bg-borde text-gris" },
  { valor: "media", etiqueta: "Media", tono: "bg-amber-100 text-amber-700" },
  { valor: "alta", etiqueta: "Alta", tono: "bg-rose-100 text-rose-600" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["valor"];

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: Prioridad;
  responsable: string | null;
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
