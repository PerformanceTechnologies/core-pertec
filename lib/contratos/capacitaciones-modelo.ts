// Los cursos y exámenes de las personas, vistos como seguimiento: qué está en curso, qué se atrasó
// y qué viene esta semana. Sin "server-only" y sin base de datos: lo usan la ficha, la cartilla de
// la nómina y el Excel, y se prueba suelto.

import {
  diasHasta,
  type Alerta,
  type CursoPersona,
  type TipoDeCapacitacion,
} from "./acreditacion-modelo";

/** Cuántos días hacia adelante cuenta como «esta semana» (hoy incluido). */
export const DIAS_PROXIMOS = 7;

/**
 * Dónde está una capacitación respecto de hoy.
 *
 * Una reserva con la fecha ya pasada sigue «reservada»: nadie anotó que se rindió. Se marca
 * «atrasada» en vez de darla por hecha, porque la que se olvida es justo la que le cuesta a la
 * persona entrar a faena.
 */
export type Situacion =
  | "atrasada"
  | "hoy"
  | "proxima"
  | "agendada"
  | "sin_fecha"
  | "realizada"
  | "cancelada";

export interface SituacionDeCapacitacion {
  situacion: Situacion;
  /** Días de hoy a la fecha (negativo = ya pasó). Null sin fecha. */
  dias: number | null;
}

export function situacionDe(
  c: Pick<CursoPersona, "estado" | "fecha">,
  hoy: string,
): SituacionDeCapacitacion {
  if (c.estado === "realizado") return { situacion: "realizada", dias: diasHasta(c.fecha, hoy) };
  if (c.estado === "cancelado") return { situacion: "cancelada", dias: diasHasta(c.fecha, hoy) };

  const dias = diasHasta(c.fecha, hoy);
  if (dias === null) return { situacion: "sin_fecha", dias: null };
  if (dias < 0) return { situacion: "atrasada", dias };
  if (dias === 0) return { situacion: "hoy", dias };
  if (dias < DIAS_PROXIMOS) return { situacion: "proxima", dias };
  return { situacion: "agendada", dias };
}

/** «hoy», «mañana», «en 3 días», «atrasada 2 días». Lo que dice la fila al lado de la fecha. */
export function textoDeSituacion(s: SituacionDeCapacitacion): string {
  const d = s.dias;
  switch (s.situacion) {
    case "sin_fecha":
      return "Sin fecha";
    case "atrasada":
      return `Atrasada ${-(d as number)} ${-(d as number) === 1 ? "día" : "días"}`;
    case "hoy":
      return "Hoy";
    case "proxima":
    case "agendada":
      return d === 1 ? "Mañana" : `En ${d} días`;
    case "realizada":
      return "Realizada";
    case "cancelada":
      return "Cancelada";
  }
}

/** «09:30» (la base devuelve «09:30:00»). */
export function horaCorta(hora: string | null | undefined): string | null {
  if (!hora) return null;
  const coincide = /^(\d{2}):(\d{2})/.exec(hora);
  return coincide ? `${coincide[1]}:${coincide[2]}` : null;
}

/** Lo que va bajo el nombre: «15-10-2026 · 09:30 · Clínica Antofagasta». */
export function detalleDeCapacitacion(
  c: Pick<CursoPersona, "fecha" | "hora" | "lugar">,
  formatearFecha: (f: string | null) => string,
): string {
  return [c.fecha ? formatearFecha(c.fecha) : null, horaCorta(c.hora), c.lugar]
    .filter(Boolean)
    .join(" · ");
}

/** Lo que reserva más cerca va primero; lo que no tiene fecha, al final. */
export function ordenarEnCurso<T extends { fecha: string | null; persona?: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    if (a.fecha !== b.fecha) {
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha.localeCompare(b.fecha);
    }
    return (a.persona ?? "").localeCompare(b.persona ?? "", "es");
  });
}

/** Una capacitación con quién es y cuál es su situación: lo que muestran la cartilla y el Excel. */
export interface RegistroDeCapacitacion extends CursoPersona {
  personaId: string;
  persona: string;
  rut: string;
  cargo: string;
  situacion: SituacionDeCapacitacion;
}

export function registrarCapacitaciones(
  personas: { id: string; nombre: string; rut: string; cargo: string; cursos: CursoPersona[] }[],
  hoy: string,
): RegistroDeCapacitacion[] {
  return personas.flatMap((p) =>
    p.cursos.map((c) => ({
      ...c,
      personaId: p.id,
      persona: p.nombre,
      rut: p.rut,
      cargo: p.cargo,
      situacion: situacionDe(c, hoy),
    })),
  );
}

export interface ResumenDeCapacitaciones {
  /** Reservadas, sea cual sea la fecha: lo que está «en curso». */
  enCurso: number;
  examenesEnCurso: number;
  cursosEnCurso: number;
  atrasadas: number;
  /** Hoy y los próximos días. */
  estaSemana: number;
  sinFecha: number;
  realizadas: number;
  aprobadas: number;
  reprobadas: number;
  canceladas: number;
  /** Las reservadas, en orden de fecha. */
  lista: RegistroDeCapacitacion[];
}

export function resumirCapacitaciones(registros: RegistroDeCapacitacion[]): ResumenDeCapacitaciones {
  const reservadas = registros.filter((r) => r.estado === "reservado");
  const delTipo = (t: TipoDeCapacitacion) => reservadas.filter((r) => r.tipo === t).length;
  const en = (...s: Situacion[]) => reservadas.filter((r) => s.includes(r.situacion.situacion)).length;

  return {
    enCurso: reservadas.length,
    examenesEnCurso: delTipo("examen"),
    cursosEnCurso: delTipo("curso"),
    atrasadas: en("atrasada"),
    estaSemana: en("hoy", "proxima"),
    sinFecha: en("sin_fecha"),
    realizadas: registros.filter((r) => r.estado === "realizado").length,
    aprobadas: registros.filter((r) => r.resultado === "aprobado").length,
    reprobadas: registros.filter((r) => r.resultado === "reprobado").length,
    canceladas: registros.filter((r) => r.estado === "cancelado").length,
    lista: ordenarEnCurso(reservadas),
  };
}

/**
 * Cómo se lee una persona en la ficha: «2 en curso · 1 atrasada», «3 realizados», «Ninguno».
 * Lo que está en curso va primero porque es lo que pide atención.
 */
export function resumenDeFicha(cursos: CursoPersona[], hoy: string): { texto: string; hecho: boolean } {
  const vigentes = cursos.filter((c) => c.estado !== "cancelado");
  if (vigentes.length === 0) return { texto: "Ninguno", hecho: false };

  const reservados = vigentes.filter((c) => c.estado === "reservado");
  const realizados = vigentes.length - reservados.length;
  const atrasados = reservados.filter((c) => situacionDe(c, hoy).situacion === "atrasada").length;

  const partes: string[] = [];
  if (reservados.length > 0) partes.push(`${reservados.length} en curso`);
  if (atrasados > 0) partes.push(`${atrasados} ${atrasados === 1 ? "atrasada" : "atrasadas"}`);
  if (realizados > 0) partes.push(`${realizados} ${realizados === 1 ? "realizado" : "realizados"}`);
  return { texto: partes.join(" · "), hecho: reservados.length === 0 };
}

/**
 * Los cursos y exámenes de una persona en una sola celda de la nómina: «Examen preocupacional
 * (reservado 15-10-2026), Franke (realizado, aprobado)». Lo cancelado no se lista: la nómina dice
 * lo que hay, no lo que se cayó.
 */
export function textoDeCapacitaciones(
  cursos: CursoPersona[],
  formatearFecha: (f: string | null) => string,
): string {
  return cursos
    .filter((c) => c.estado !== "cancelado")
    .map((c) => {
      const partes: string[] = [c.estado];
      if (c.estado === "realizado" && c.resultado) partes.push(c.resultado);
      if (c.fecha) partes.push(formatearFecha(c.fecha));
      return `${c.curso} (${partes.join(", ")})`;
    })
    .join(", ");
}

/** «HH:MM» de 00:00 a 23:59. */
export function horaEsValida(hora: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

// -----------------------------------------------------------------------------
//  Qué documentos se ofrecen al subir lo de un curso o examen
// -----------------------------------------------------------------------------

/**
 * Las palabras que hacen a un documento del catálogo «de exámenes y cursos»: se buscan en su nombre
 * y en su grupo, sin tildes. El catálogo lo edita quien administra, así que se reconoce por lo que
 * dice y no por una lista fija de códigos: un documento nuevo «Curso de altura física» entra solo.
 */
const PALABRAS_DE_CAPACITACION = [
  "examen",
  "curso",
  "induccion",
  "capacitacion",
  "salud ocupacional",
  "psicosensotecnico",
  "audiometria",
  "torax",
];

export function esDocumentoDeCapacitacion(tipo: { nombre: string; grupo: string }): boolean {
  const texto = normalizarNombre(`${tipo.grupo} ${tipo.nombre}`);
  return PALABRAS_DE_CAPACITACION.some((p) => texto.includes(p));
}

/**
 * Los documentos que se ofrecen al subir el archivo de un curso o examen: solo los de exámenes y
 * cursos. Siempre incluye el que ya tenía elegido (para que el desplegable no «pierda» su valor), y
 * si el catálogo no tiene ninguno así se ofrece todo en vez de dejar la lista vacía.
 */
export function documentosParaCapacitacion<T extends { id: string; nombre: string; grupo: string }>(
  tipos: T[],
  yaElegido: string | null,
): T[] {
  const filtrados = tipos.filter((t) => t.id === yaElegido || esDocumentoDeCapacitacion(t));
  return filtrados.length > 0 ? filtrados : tipos;
}

// -----------------------------------------------------------------------------
//  Plazo de pago de la factura
// -----------------------------------------------------------------------------

/** Los plazos que se ofrecen. 30 es el habitual; 60 y 90 existen en los proveedores grandes. */
export const PLAZOS_DE_PAGO = [30, 60, 90];

/** La fecha en que vence el pago: la de la factura más el plazo, o null si falta alguna. */
export function vencimientoDePago(fechaFactura: string | null, plazoDias: number | null): string | null {
  if (!fechaFactura || !plazoDias) return null;
  const [a, m, d] = fechaFactura.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(Date.UTC(a, m - 1, d + plazoDias)).toISOString().slice(0, 10);
}

/** Cómo está el pago de una factura por pagar: sin plazo, a tiempo o vencido. */
export function situacionDePago(
  factura: { pagada: boolean; anulada: boolean; fecha: string | null },
  plazoDias: number | null,
  hoy: string,
): { clave: "pagada" | "anulada" | "sin_plazo" | "a_tiempo" | "vence_hoy" | "vencido"; vence: string | null; dias: number | null } {
  if (factura.anulada) return { clave: "anulada", vence: null, dias: null };
  if (factura.pagada) return { clave: "pagada", vence: null, dias: null };
  const vence = vencimientoDePago(factura.fecha, plazoDias);
  if (!vence) return { clave: "sin_plazo", vence: null, dias: null };
  const dias = diasHasta(vence, hoy);
  if (dias === null) return { clave: "sin_plazo", vence, dias: null };
  return { clave: dias < 0 ? "vencido" : dias === 0 ? "vence_hoy" : "a_tiempo", vence, dias };
}

// -----------------------------------------------------------------------------
//  Alertas: lo reservado cuya fecha llegó
// -----------------------------------------------------------------------------

/**
 * Los cursos y exámenes reservados de una persona cuya fecha es HOY o ya pasó: son los que alguien
 * tiene que marcar como realizados (o reprogramar). Lo de los próximos días no es una alerta, es
 * agenda, y vive en la cartilla de la nómina.
 *
 * Usa el mismo tipo `Alerta` que los documentos para que la nómina, el tablero y Mi Día lo
 * muestren sin saber que existe: la urgencia es `dias` (negativo = ya pasó).
 */
export function alertasDeCapacitaciones(
  persona: { id: string; nombre: string },
  cursos: CursoPersona[],
  hoy: string,
): Alerta[] {
  const alertas: Alerta[] = [];
  for (const c of cursos) {
    if (c.estado !== "reservado") continue;
    const { situacion, dias } = situacionDe(c, hoy);
    if ((situacion !== "atrasada" && situacion !== "hoy") || dias === null) continue;
    alertas.push({ personaId: persona.id, persona: persona.nombre, tipo: "capacitacion", asunto: c.curso, dias });
  }
  return alertas;
}

// -----------------------------------------------------------------------------
//  La factura: un gasto de verdad en Gastos de arranque
// -----------------------------------------------------------------------------

/**
 * En qué categoría de Gastos de arranque cae la factura de cada tipo. Son las categorías de ejemplo
 * del módulo (migración 0014); si alguien las renombró, se buscan sin distinguir mayúsculas ni
 * tildes y, si no existen, se crean.
 */
export const CATEGORIA_DE_GASTO: Record<TipoDeCapacitacion, string> = {
  examen: "Exámenes y salud ocupacional",
  curso: "Acreditaciones y cursos",
};

/** «Examen de altura geográfica · Priscila Llanos Huerta»: lo que dice la línea en Gastos. */
export function descripcionDeGasto(c: { tipo: TipoDeCapacitacion; curso: string }, persona: string): string {
  return `${c.curso} · ${persona}`.slice(0, 200);
}

/** La nota de origen: de dónde viene este gasto, para quien lo lea desde Gastos. */
export function notaDeOrigen(
  c: { tipo: TipoDeCapacitacion; curso: string },
  persona: { nombre: string; rut: string },
): string {
  return `Origen: Acreditación Personas. ${c.tipo === "examen" ? "Examen" : "Curso"} «${c.curso}» de ${persona.nombre} (${persona.rut}).`;
}

/** Sin tildes ni mayúsculas, para comparar nombres de categoría. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** La categoría de Gastos para este tipo, entre las existentes; undefined si hay que crearla. */
export function categoriaParaFactura<T extends { id: string; nombre: string }>(
  tipo: TipoDeCapacitacion,
  categorias: T[],
): T | undefined {
  const buscada = normalizarNombre(CATEGORIA_DE_GASTO[tipo]);
  return categorias.find((c) => normalizarNombre(c.nombre) === buscada);
}

/**
 * Cómo queda la línea de Gastos según la factura: pagada → «Pagado» (el monto es lo pagado);
 * por pagar → «OC emitida» (el monto es un compromiso). Nunca «por cotizar» ni «cotizando»: ya hay
 * una factura, el gasto es un hecho.
 */
export function estadoDeGastoDeFactura(pagada: boolean): "pagado" | "comprometido" {
  return pagada ? "pagado" : "comprometido";
}

/** Junta las notas sin repetir la de origen ni pisar lo que ya había. */
export function unirNotas(previa: string | null, nueva: string | null, origen: string): string {
  const partes: string[] = [];
  const yaTieneOrigen = previa?.includes("Origen: Acreditación Personas.") ?? false;
  if (previa) partes.push(previa);
  if (!yaTieneOrigen) partes.push(origen);
  if (nueva && !partes.some((p) => p.includes(nueva))) partes.push(nueva);
  return partes.join("\n").slice(0, 1000);
}

/** Lo que se muestra de la factura de un curso: leído de su línea en Gastos, que es la fuente. */
export interface FacturaDeCurso {
  partidaId: string;
  numero: number;
  /** El N° de factura que se anotó. */
  referencia: string | null;
  proveedor: string | null;
  fecha: string | null;
  /** Neto en pesos. */
  monto: number | null;
  pagada: boolean;
  /** «anulado»: la línea se anuló desde Gastos. */
  anulada: boolean;
  estadoEtiqueta: string;
  carpetaItemId: string | null;
  carpetaUrl: string | null;
}
