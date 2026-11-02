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
  /** false: solo la ven sus responsables y quien la asignó. */
  visibleGeneral: boolean;
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

export type AccionHistorial = "creada" | "editada" | "estado" | "nota";

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
  visibleGeneral?: boolean;
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

  if (antes.visibleGeneral !== undefined && despues.visibleGeneral !== undefined && antes.visibleGeneral !== despues.visibleGeneral) {
    cambios.push(despues.visibleGeneral ? "la visibilidad a vista general" : "la visibilidad a solo responsables y asignador");
  }
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

// ---------- Visibilidad ------------------------------------------------------

const igual = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

/** Responsable o quien la asignó: los únicos que pueden cambiar la visibilidad. */
export function esDeLaTarea(t: { responsables: string[]; asignadoPor: string | null }, correo: string): boolean {
  return igual(t.asignadoPor, correo) || t.responsables.some((r) => igual(r, correo));
}

/** Vista general: todos. Si no: solo responsables y quien la asignó. */
export function puedeVerTarea(
  t: { visibleGeneral: boolean; responsables: string[]; asignadoPor: string | null },
  correo: string,
): boolean {
  return t.visibleGeneral || esDeLaTarea(t, correo);
}

// ---------- Notas ------------------------------------------------------------

export interface ArchivoNota {
  nombre: string;
  ruta: string;
  tipo: string;
  tamano: number;
}

export interface Nota {
  id: string;
  texto: string | null;
  archivos: ArchivoNota[];
  correo: string;
  nombre: string | null;
  creadoEn: string;
}

/** Lo que se acepta adjuntar a una nota: MIME → extensión con la que se guarda. */
export const TIPOS_ADJUNTO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
};

export const ADJUNTOS_ACEPTADOS = "PDF, imágenes, Word, Excel, PowerPoint, texto, CSV o ZIP";

/** Peso legible: 532 B, 14 KB, 2,3 MB. */
export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

// ---------- Mi Día -----------------------------------------------------------

export interface ResumenMisTareas {
  /** Con fecha límite ya pasada. */
  vencidas: Tarea[];
  /** Vencen hoy. */
  hoy: Tarea[];
  /** Vencen en los próximos 3 días (sin contar hoy). */
  proximas: Tarea[];
  /** En curso, sin fecha cercana. */
  enCurso: Tarea[];
  /** Por hacer, sin fecha cercana. */
  porHacer: Tarea[];
  /** Todas las no hechas donde la persona es responsable. */
  total: number;
}

/**
 * Las tareas de UNA persona (donde es responsable y no están hechas), agrupadas por
 * urgencia para Mi Día. Cada tarea cae en un solo grupo, el más urgente que le toca.
 * `hoyIso` es la fecha de Chile (YYYY-MM-DD).
 */
export function resumirMisTareas(tareas: Tarea[], correo: string, hoyIso: string): ResumenMisTareas {
  const mias = tareas
    .filter((t) => t.estado !== "hecho" && t.responsables.some((r) => igual(r, correo)))
    .sort((a, b) => (a.fechaLimite ?? "9999").localeCompare(b.fechaLimite ?? "9999") || a.orden - b.orden);
  const en3 = new Date(`${hoyIso}T12:00:00Z`);
  en3.setUTCDate(en3.getUTCDate() + 3);
  const limiteProximas = en3.toISOString().slice(0, 10);

  const r: ResumenMisTareas = { vencidas: [], hoy: [], proximas: [], enCurso: [], porHacer: [], total: mias.length };
  for (const t of mias) {
    const f = t.fechaLimite;
    if (f && f < hoyIso) r.vencidas.push(t);
    else if (f === hoyIso) r.hoy.push(t);
    else if (f && f <= limiteProximas) r.proximas.push(t);
    else if (t.estado === "en_curso") r.enCurso.push(t);
    else r.porHacer.push(t);
  }
  return r;
}
