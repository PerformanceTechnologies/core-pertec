// El vocabulario de Acreditación: tipos, etiquetas y cómo se calcula el avance.
//
// Sin "server-only" a propósito, por lo mismo que contratos-estado.ts: los
// componentes cliente necesitan las etiquetas y el cálculo, y importarlos desde
// el archivo que lee la base arrastraría el cliente de Supabase al navegador.

import { calcularAvance, type Avance, type EstadoRequisito } from "./contratos-estado";
import {
  AFP,
  BANCOS,
  ESTADOS_CIVILES,
  FAENAS,
  NACIONALIDADES,
  PREVISIONES_DE_SALUD,
  TALLAS_DE_PANTALON,
  PARENTESCOS,
  TALLAS_DE_POLERA,
  TIPOS_DE_CUENTA,
  TURNOS,
} from "./acreditacion-catalogos";
import { REGIONES } from "./chile-comunas";

export type EstadoDocumento = "pendiente" | "cargado" | "observado" | "no_aplica";

/** Lo que se ve: a los cuatro guardados se suma "vencido", que se deduce de la fecha. */
export type EstadoVisible = EstadoDocumento | "vencido";

export const ETIQUETAS_DOCUMENTO: Record<EstadoVisible, string> = {
  pendiente: "Pendiente",
  cargado: "Cargado",
  observado: "Observado",
  no_aplica: "No aplica",
  vencido: "Vencido",
};

export type EstadoWebControl =
  | "sin_cargar"
  | "falta_contratos_examenes"
  | "falta_un_documento"
  | "al_dia";

// Son los textos de la leyenda de colores del Excel, tal cual los usaba el equipo.
export const ETIQUETAS_WEB_CONTROL: Record<EstadoWebControl, string> = {
  sin_cargar: "Sin cargar en Web Control",
  falta_contratos_examenes: "Falta subir contratos y exámenes",
  falta_un_documento: "Aceptado, falta un documento",
  al_dia: "Documentación al día",
};

/** Un curso o un examen: se reservan y se siguen igual, con una sola tabla (migración 0029). */
export type TipoDeCapacitacion = "curso" | "examen";
export const TIPOS_DE_CAPACITACION: TipoDeCapacitacion[] = ["curso", "examen"];
export const ETIQUETAS_TIPO_CAPACITACION: Record<TipoDeCapacitacion, string> = {
  curso: "Curso",
  examen: "Examen",
};

export type EstadoCurso = "reservado" | "realizado" | "cancelado";
export const ETIQUETAS_ESTADO_CURSO: Record<EstadoCurso, string> = {
  reservado: "Reservado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export type ResultadoDeCurso = "aprobado" | "reprobado";
export const ETIQUETAS_RESULTADO: Record<ResultadoDeCurso, string> = {
  aprobado: "Aprobado",
  reprobado: "Reprobado",
};

/** Los cursos que hoy se reservan. Son sugerencias: el campo admite cualquier otro. */
export const CURSOS_SUGERIDOS = ["Franke", "PLL", "POX"];

/** Los exámenes habituales de ingreso a faena. También son solo sugerencias. */
export const EXAMENES_SUGERIDOS = [
  "Examen preocupacional",
  "Examen de altura geográfica",
  "Examen de altura física",
  "Examen psicosensotécnico",
  "Audiometría",
  "Espirometría",
];

export interface TipoDocumento {
  id: string;
  codigo: string;
  nombre: string;
  grupo: string;
  orden: number;
  tieneVencimiento: boolean;
}

/**
 * Un documento del catálogo tal como lo ve quien lo administra: con los inactivos
 * y con cuánta gente lo tiene anotado, que decide si se puede eliminar.
 */
export interface TipoDeCatalogo extends TipoDocumento {
  activo: boolean;
  /** Personas con algo anotado en este documento (un archivo, un estado, una nota). */
  enUso: number;
}

/**
 * Deja los documentos de un mismo grupo juntos, en el orden en que aparece cada
 * grupo por primera vez.
 *
 * Importa desde que se pueden agregar documentos: uno nuevo en "Contractual" nace
 * con el `orden` más alto, y ordenado solo por eso quedaría al final de TODO, lejos
 * de su grupo. La matriz y el Excel agrupan columnas consecutivas, así que
 * mostrarían "Contractual" dos veces.
 *
 * `orden` se sigue usando tal cual para el número del archivo en SharePoint
 * ("07 - …"): ese no se toca, o los archivos ya subidos dejarían de coincidir.
 */
export function ordenarTipos<T extends TipoDocumento>(tipos: T[]): T[] {
  const primero = new Map<string, number>();
  for (const t of tipos) {
    primero.set(t.grupo, Math.min(primero.get(t.grupo) ?? Infinity, t.orden));
  }
  return [...tipos].sort(
    (a, b) => (primero.get(a.grupo)! - primero.get(b.grupo)!) || a.orden - b.orden,
  );
}

export interface Cargo {
  id: string;
  nombre: string;
  activo: boolean;
  /** Los documentos que pide este cargo. */
  tipoIds: string[];
  /** Cuántas personas lo tienen. Un cargo en uso no se puede eliminar. */
  personas: number;
  /** Cuántas personas se deben contratar con este cargo. Null = no se ha definido. */
  cantidadRequerida: number | null;
}

export interface ArchivoDeDocumento {
  id: string;
  /** El id en SharePoint. */
  itemId: string;
  nombre: string;
  url: string;
  subidoPorNombre: string | null;
  subidoEn: string;
}

export interface DocumentoPersona {
  tipoId: string;
  estado: EstadoDocumento;
  requeridoExtra: boolean;
  itemId: string | null;
  archivoNombre: string | null;
  archivoUrl: string | null;
  cantidadArchivos: number;
  /** Todos los archivos subidos a este documento, del más antiguo al más nuevo. */
  archivos: ArchivoDeDocumento[];
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  nota: string | null;
  actualizadoPorNombre: string | null;
  actualizadoEn: string | null;
}

/** Los días que antes del vencimiento un documento pasa a "por vencer". */
export const DIAS_AVISO_VENCIMIENTO = 30;

/**
 * La fecha de hoy en Chile, como "AAAA-MM-DD".
 *
 * No `new Date().toISOString().slice(0, 10)`: eso es la fecha en UTC, y entre las
 * 20:00 y la medianoche de Chile ya es "mañana". Un documento que vence hoy se
 * mostraría vencido desde la tarde anterior.
 */
export function hoyEnChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Días de `hoy` a `fecha` (negativo si ya pasó). Null si no hay fecha. */
export function diasHasta(fecha: string | null | undefined, hoy: string): number | null {
  if (!fecha) return null;
  const ms = Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 86_400_000);
}

export function estadoVisible(doc: DocumentoPersona | undefined, hoy: string): EstadoVisible {
  if (!doc) return "pendiente";
  if (doc.estado === "cargado") {
    const dias = diasHasta(doc.fechaVencimiento, hoy);
    if (dias !== null && dias < 0) return "vencido";
  }
  return doc.estado;
}

/** ¿Cuenta este documento para esta persona? Lo pide su cargo, o se pidió aparte. */
export function esRequerido(
  tipoId: string,
  tiposDelCargo: ReadonlySet<string>,
  doc: DocumentoPersona | undefined,
): boolean {
  return tiposDelCargo.has(tipoId) || Boolean(doc?.requeridoExtra);
}

/**
 * El avance de una persona: los documentos que le piden, con "no aplica" fuera
 * del denominador. Mismo cálculo que Contratos —calcularAvance— para que el
 * porcentaje signifique lo mismo en todo el core.
 *
 * Un documento vencido NO cuenta como cumplido: está en la carpeta, pero no
 * sirve para acreditar. Es lo que evita un 100% que el mandante rechazaría.
 */
export function avanceDePersona(
  tipos: TipoDocumento[],
  tiposDelCargo: ReadonlySet<string>,
  documentos: ReadonlyMap<string, DocumentoPersona>,
  hoy: string,
): Avance {
  const estados: EstadoRequisito[] = [];

  for (const tipo of tipos) {
    const doc = documentos.get(tipo.id);
    if (!esRequerido(tipo.id, tiposDelCargo, doc)) continue;

    const visible = estadoVisible(doc, hoy);
    if (visible === "no_aplica") estados.push("no_aplica");
    else if (visible === "cargado") estados.push("subido");
    else estados.push("pendiente"); // pendiente, observado y vencido
  }

  return calcularAvance(estados);
}

/** Cuántos documentos cargados vencen dentro de la ventana de aviso, y cuántos ya vencieron. */
export function contarVencimientos(
  tipos: TipoDocumento[],
  tiposDelCargo: ReadonlySet<string>,
  documentos: ReadonlyMap<string, DocumentoPersona>,
  hoy: string,
): { porVencer: number; vencidos: number } {
  let porVencer = 0;
  let vencidos = 0;

  for (const tipo of tipos) {
    const doc = documentos.get(tipo.id);
    if (!doc || doc.estado !== "cargado") continue;
    if (!esRequerido(tipo.id, tiposDelCargo, doc)) continue;

    const dias = diasHasta(doc.fechaVencimiento, hoy);
    if (dias === null) continue;
    if (dias < 0) vencidos++;
    else if (dias <= DIAS_AVISO_VENCIMIENTO) porVencer++;
  }

  return { porVencer, vencidos };
}

export type Etapa = "documentacion" | "web_control" | "buk" | "acreditada";

export const ETIQUETAS_ETAPA: Record<Etapa, string> = {
  documentacion: "En documentación",
  web_control: "Falta Web Control",
  buk: "Falta BUK",
  acreditada: "Acreditada",
};

/**
 * En qué punto del camino está una persona.
 *
 * Acreditación completa = documentos al 100% + acreditada en Web Control + creada
 * en BUK. Es el recorrido que dibuja la leyenda del Excel. Los cursos y el pase
 * se siguen aparte y no bloquean: son hitos que pasan en paralelo, y atar la
 * acreditación a ellos dejaría a alguien "en proceso" por una reserva de curso.
 *
 * El orden importa: se avisa lo PRIMERO que falta, no todo lo que falta.
 */
export function etapaDe(
  avance: Avance,
  datos: { wcAcreditado: boolean; creadoEnBuk: boolean },
): Etapa {
  const documentosCompletos = avance.total > 0 && avance.subidos === avance.total;
  if (!documentosCompletos) return "documentacion";
  if (!datos.wcAcreditado) return "web_control";
  if (!datos.creadoEnBuk) return "buk";
  return "acreditada";
}

/** "2026-10-05" → "05-10-2026". El formato de las fechas en Chile. */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return a && m && d ? `${d}-${m}-${a}` : fecha;
}

// -----------------------------------------------------------------------------
//  La ficha de la persona
// -----------------------------------------------------------------------------

/**
 * Lo que necesita CUALQUIER campo de un formulario de datos —el control que se dibuja y cómo se
 * valida— sin su sección. Los datos de un vehículo (Acreditación Vehículos) usan los mismos
 * controles y la misma validación que los de una persona, con otras secciones.
 */
export type CampoBase = Omit<CampoDePersona, "seccion">;

export interface CampoDePersona {
  /** El nombre de la columna en ct_acreditacion_personas. */
  campo: string;
  etiqueta: string;
  /**
   * Qué clase de dato es: de ahí salen el control del formulario y la validación (ver
   * acreditacion-validacion.ts). «lista» es un desplegable con `opciones`; «cuenta» es un número
   * de cuenta bancaria (solo dígitos); «numero» admite decimales con `min`, `max` y `paso`.
   */
  tipo: "texto" | "fecha" | "correo" | "telefono" | "numero" | "cuenta" | "lista";
  seccion: "Contrato" | "Personales" | "Contacto de emergencia" | "Bancarios y previsión" | "Vestuario";
  /** Las opciones de una lista. */
  opciones?: readonly string[];
  /**
   * Si además de las opciones se puede escribir otra. Sí donde el mundo real no cabe en una
   * lista (un banco poco común, una nacionalidad que falta); no donde la lista es cerrada
   * (región, estado civil, AFP).
   */
  permiteOtro?: boolean;
  /** Una lista que depende de otro campo: la comuna, de la región. */
  dependeDe?: string;
  /** Para «numero». */
  min?: number;
  max?: number;
  paso?: number;
  /** Lo que se ve en el campo vacío, para mostrar el formato esperado. */
  marcador?: string;
  /** Cuántas columnas ocupa en la grilla del formulario (por omisión, una). */
  ancho?: 1 | 2;
}

/**
 * Los campos de datos de la hoja Consolidado (AJ–BG), en el orden en que se
 * llenan. Una sola lista que alimenta el formulario, la lectura de la base y el
 * guardado: agregar un campo es una línea acá y una columna en la migración, sin
 * tocar los tres lugares por separado.
 *
 * Quedan fuera los que tienen su propia pantalla: nombre, RUT y cargo (la
 * identidad de la ficha), "Indefinido" (casilla) y lo que es seguimiento — Web
 * Control, BUK, pase y cursos.
 *
 * Donde hay un conjunto conocido de valores, es una LISTA: así nadie escribe «Casado» de tres
 * formas ni hay que interpretar qué quiso decir «Bco. Estado».
 */
export const CAMPOS_DE_PERSONA: CampoDePersona[] = [
  { campo: "faena", etiqueta: "Faena", tipo: "lista", seccion: "Contrato", opciones: FAENAS, permiteOtro: true },
  { campo: "turno", etiqueta: "Turno", tipo: "lista", seccion: "Contrato", opciones: TURNOS, permiteOtro: true },
  { campo: "fecha_ingreso", etiqueta: "Ingreso a contrato", tipo: "fecha", seccion: "Contrato" },
  { campo: "fecha_termino_1", etiqueta: "Término 1.er contrato", tipo: "fecha", seccion: "Contrato" },
  { campo: "fecha_termino_2", etiqueta: "Término 2.º contrato", tipo: "fecha", seccion: "Contrato" },

  { campo: "estado_civil", etiqueta: "Estado civil", tipo: "lista", seccion: "Personales", opciones: ESTADOS_CIVILES },
  { campo: "fecha_nacimiento", etiqueta: "Fecha de nacimiento", tipo: "fecha", seccion: "Personales" },
  {
    campo: "nacionalidad",
    etiqueta: "Nacionalidad",
    tipo: "lista",
    seccion: "Personales",
    opciones: NACIONALIDADES,
    permiteOtro: true,
  },
  {
    campo: "telefono",
    etiqueta: "Teléfono",
    tipo: "telefono",
    seccion: "Personales",
    marcador: "+56 9 1234 5678",
  },
  {
    campo: "correo",
    etiqueta: "Correo electrónico",
    tipo: "correo",
    seccion: "Personales",
    marcador: "nombre@dominio.cl",
    ancho: 2,
  },
  { campo: "region", etiqueta: "Región", tipo: "lista", seccion: "Personales", opciones: REGIONES, ancho: 2 },
  {
    campo: "comuna",
    etiqueta: "Comuna",
    tipo: "lista",
    seccion: "Personales",
    dependeDe: "region",
    ancho: 2,
  },
  { campo: "direccion", etiqueta: "Dirección", tipo: "texto", seccion: "Personales", ancho: 2, marcador: "Calle, número, depto." },

  // A quién llamar si le pasa algo en faena. Las etiquetas dicen «del contacto» porque en la
  // exportación a Excel van sin el título de su sección, y «Teléfono» a secas se confundiría con
  // el de la persona.
  {
    campo: "contacto_emergencia_nombre",
    etiqueta: "Nombre del contacto",
    tipo: "texto",
    seccion: "Contacto de emergencia",
    ancho: 2,
    marcador: "Nombre y apellido",
  },
  {
    campo: "contacto_emergencia_parentesco",
    etiqueta: "Parentesco",
    tipo: "lista",
    seccion: "Contacto de emergencia",
    opciones: PARENTESCOS,
    permiteOtro: true,
  },
  {
    campo: "contacto_emergencia_telefono",
    etiqueta: "Teléfono del contacto",
    tipo: "telefono",
    seccion: "Contacto de emergencia",
    marcador: "+56 9 1234 5678",
  },

  {
    campo: "banco",
    etiqueta: "Banco",
    tipo: "lista",
    seccion: "Bancarios y previsión",
    opciones: BANCOS,
    permiteOtro: true,
  },
  {
    campo: "tipo_cuenta",
    etiqueta: "Tipo de cuenta",
    tipo: "lista",
    seccion: "Bancarios y previsión",
    opciones: TIPOS_DE_CUENTA,
  },
  { campo: "numero_cuenta", etiqueta: "Número de cuenta", tipo: "cuenta", seccion: "Bancarios y previsión", marcador: "Solo dígitos" },
  {
    campo: "prevision_salud",
    etiqueta: "Previsión de salud",
    tipo: "lista",
    seccion: "Bancarios y previsión",
    opciones: PREVISIONES_DE_SALUD,
    permiteOtro: true,
  },
  { campo: "afp", etiqueta: "AFP", tipo: "lista", seccion: "Bancarios y previsión", opciones: AFP },

  { campo: "talla_polera", etiqueta: "Talla de polera", tipo: "lista", seccion: "Vestuario", opciones: TALLAS_DE_POLERA },
  // Mismas tallas que la polera: en ropa de trabajo se piden igual (XS a 4XL).
  { campo: "talla_chaqueta", etiqueta: "Talla de chaqueta", tipo: "lista", seccion: "Vestuario", opciones: TALLAS_DE_POLERA },
  {
    campo: "talla_pantalon",
    etiqueta: "Talla de pantalón",
    tipo: "lista",
    seccion: "Vestuario",
    opciones: TALLAS_DE_PANTALON,
    permiteOtro: true,
  },
  {
    campo: "numero_zapato",
    etiqueta: "N.º de zapato",
    tipo: "numero",
    seccion: "Vestuario",
    min: 30,
    max: 52,
    paso: 0.5,
    marcador: "Ej.: 42",
  },
];

export const SECCIONES_DE_DATOS = [
  "Contrato",
  "Personales",
  "Contacto de emergencia",
  "Bancarios y previsión",
  "Vestuario",
] as const;

export interface Persona {
  id: string;
  numero: number;
  nombre: string;
  rut: string;
  cargoId: string;
  activo: boolean;
  indefinido: boolean;
  estadoWebControl: EstadoWebControl;
  wcAcreditado: boolean;
  creadoEnBuk: boolean;
  numeroPase: string | null;
  estadoPase: string | null;
  observaciones: string | null;
  carpetaItemId: string | null;
  carpetaUrl: string | null;
  creadoEn: string;
  /** Marcada «sin contrato aún»: no cuenta en la dotación aunque tenga fecha de ingreso. */
  sinContrato: boolean;
  /** Los campos de CAMPOS_DE_PERSONA, por nombre de columna. */
  datos: Record<string, string | null>;
}

/**
 * Un curso o un examen de una persona. El nombre del tipo es histórico (nació como «cursos»): hoy
 * cubre las dos cosas, y `tipo` dice cuál es.
 */
export interface CursoPersona {
  id: string;
  tipo: TipoDeCapacitacion;
  /** El nombre: «Franke», «Examen preocupacional». */
  curso: string;
  estado: EstadoCurso;
  /** «AAAA-MM-DD»: el día reservado o, si ya se hizo, el día en que se rindió. */
  fecha: string | null;
  /** «HH:MM», solo si hay fecha. */
  hora: string | null;
  /** La clínica, el centro o el proveedor donde se rinde. */
  lugar: string | null;
  resultado: ResultadoDeCurso | null;
  nota: string | null;
  /** El documento del catálogo donde quedó el archivo subido para este curso o examen. */
  documentoTipoId: string | null;
  /** La línea de Gastos de arranque creada al subir su factura. */
  partidaGastoId: string | null;
  /** A cuántos días se paga la factura (30, 60, 90), o null si no hay plazo o ya se pagó. */
  facturaPlazoDias: number | null;
}

export interface EventoHistorial {
  id: number;
  accion: string;
  detalle: string | null;
  usuarioNombre: string;
  creadoEn: string;
}

/**
 * Los días que faltan para que termine el contrato vigente, o null si no aplica.
 *
 * Reemplaza las dos columnas "DÍAS FALTANTES PARA TÉRMINO DE CONTRATO" del Excel,
 * que había que recalcular a mano. Cuenta contra el segundo término si existe:
 * es el contrato que está corriendo cuando hay una renovación.
 */
export function diasParaTermino(persona: Persona, hoy: string): number | null {
  if (persona.indefinido) return null;
  const fecha = persona.datos.fecha_termino_2 ?? persona.datos.fecha_termino_1;
  return diasHasta(fecha, hoy);
}

/**
 * Lo que devuelve una acción de formulario. Va acá y no en el archivo de las
 * acciones: un archivo "use server" solo puede exportar funciones asíncronas.
 */
export interface EstadoForm {
  error?: string;
  ok?: boolean;
  /** El id de lo que se acaba de crear, cuando quien llama necesita seguir con él. */
  id?: string;
}

// -----------------------------------------------------------------------------
//  El análisis de una persona, calculado UNA vez
//
//  La nómina, la matriz, el reporte y el Excel muestran los mismos números. Si
//  cada pantalla los calculara por su cuenta, el día que cambie una regla
//  —cómo cuenta un documento vencido— habría que acordarse de cuatro lugares, y
//  el que se olvide mostraría un porcentaje distinto al de la ficha.
// -----------------------------------------------------------------------------

export interface CeldaDeDocumento {
  /** ¿Lo pide el cargo, o se pidió aparte para esta persona? */
  requerido: boolean;
  estado: EstadoVisible;
  /** Días para el vencimiento si el documento está cargado y tiene fecha. */
  diasParaVencer: number | null;
}

export interface AnalisisDePersona {
  avance: Avance;
  etapa: Etapa;
  vencidos: number;
  porVencer: number;
  diasTermino: number | null;
  /** Por id de tipo. Están todos los del catálogo, requeridos o no. */
  celdas: Map<string, CeldaDeDocumento>;
}

export function analizarPersona(
  persona: Persona,
  documentos: ReadonlyMap<string, DocumentoPersona>,
  tipos: TipoDocumento[],
  tiposDelCargo: ReadonlySet<string>,
  hoy: string,
): AnalisisDePersona {
  const celdas = new Map<string, CeldaDeDocumento>();
  for (const tipo of tipos) {
    const doc = documentos.get(tipo.id);
    celdas.set(tipo.id, {
      requerido: esRequerido(tipo.id, tiposDelCargo, doc),
      estado: estadoVisible(doc, hoy),
      diasParaVencer: doc?.estado === "cargado" ? diasHasta(doc.fechaVencimiento, hoy) : null,
    });
  }

  const avance = avanceDePersona(tipos, tiposDelCargo, documentos, hoy);
  return {
    avance,
    etapa: etapaDe(avance, persona),
    ...contarVencimientos(tipos, tiposDelCargo, documentos, hoy),
    diasTermino: diasParaTermino(persona, hoy),
    celdas,
  };
}

export interface Alerta {
  personaId: string;
  persona: string;
  tipo: "vencido" | "por_vencer" | "contrato" | "capacitacion";
  /** Qué documento, o "Contrato". */
  asunto: string;
  /** Negativo = ya pasó. Ordena por urgencia. */
  dias: number;
}

/**
 * Lo que requiere atención de una persona: documentos vencidos o por vencer, y el
 * fin de contrato. Es la lista que el core muestra al entrar, en lugar de un
 * aviso que salga solo: el core actúa con el permiso de quien lo abre y no tiene
 * identidad propia con la que mandar un correo cuando nadie está mirando.
 */
export function alertasDePersona(
  persona: Persona,
  analisis: AnalisisDePersona,
  tipos: TipoDocumento[],
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const tipo of tipos) {
    const celda = analisis.celdas.get(tipo.id);
    if (!celda?.requerido || celda.diasParaVencer === null) continue;
    if (celda.diasParaVencer < 0) {
      alertas.push({ personaId: persona.id, persona: persona.nombre, tipo: "vencido", asunto: tipo.nombre, dias: celda.diasParaVencer });
    } else if (celda.diasParaVencer <= DIAS_AVISO_VENCIMIENTO) {
      alertas.push({ personaId: persona.id, persona: persona.nombre, tipo: "por_vencer", asunto: tipo.nombre, dias: celda.diasParaVencer });
    }
  }

  if (analisis.diasTermino !== null && analisis.diasTermino <= 30) {
    alertas.push({ personaId: persona.id, persona: persona.nombre, tipo: "contrato", asunto: "Contrato", dias: analisis.diasTermino });
  }

  return alertas;
}

/** Lo más urgente primero: lo que ya pasó, y después lo que está por pasar. */
/** «vence en 5 días», «venció hace 2 días», «termina hoy»: lo que dice una alerta de su fecha. */
export function textoDeAlerta(a: Alerta): string {
  const d = a.dias;
  if (a.tipo === "contrato") {
    if (d < 0) return `terminó hace ${-d} ${-d === 1 ? "día" : "días"}`;
    if (d === 0) return "termina hoy";
    return `termina en ${d} ${d === 1 ? "día" : "días"}`;
  }
  if (a.tipo === "capacitacion") {
    // Un curso o examen reservado cuya fecha llegó o ya pasó sin que nadie anotara que se rindió.
    if (d < 0) return `atrasado ${-d} ${-d === 1 ? "día" : "días"}`;
    return "es hoy";
  }
  if (d < 0) return `venció hace ${-d} ${-d === 1 ? "día" : "días"}`;
  if (d === 0) return "vence hoy";
  return `vence en ${d} ${d === 1 ? "día" : "días"}`;
}

export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => a.dias - b.dias || a.persona.localeCompare(b.persona, "es"));
}

// -----------------------------------------------------------------------------
//  Dotación: cuántas personas se deben contratar, y cuántas faltan
// -----------------------------------------------------------------------------

/**
 * ¿Cuenta como CONTRATADA en la dotación? Activa, con fecha de «Ingreso a contrato» cargada en
 * Datos, y sin la marca «sin contrato aún».
 *
 * La fecha es lo que dice «hay contrato»; la marca es la excepción para quien ya tiene fecha pero
 * cuyo contrato no se firma. Alguien en plena acreditación sin contrato sigue en la nómina y en el
 * avance de documentos, pero no infla el «6 de 10 contratadas».
 */
export function estaContratada(p: { activo: boolean; sinContrato: boolean; datos: Record<string, string | null> }): boolean {
  return p.activo && !p.sinContrato && Boolean(p.datos.fecha_ingreso);
}

export interface DotacionDeCargo {
  cargoId: string;
  nombre: string;
  requeridas: number;
  /**
   * El cargo existe pero nadie le definió cuántas personas hay que contratar. Aparece igual (con lo
   * que ya tiene), pero no suma a la meta ni tiene «faltan»: un cargo nuevo no puede quedar invisible
   * hasta que alguien se acuerde de ponerle una cantidad.
   */
  sinMeta: boolean;
  contratadas: number;
  /** Las registradas en la nómina con este cargo, tengan o no contrato todavía. */
  registradas: number;
  /** Registradas que aún no cuentan como contratadas. */
  sinContrato: number;
  faltan: number;
  /** Cuántas hay de más que lo pedido. */
  sobran: number;
}

export interface ResumenDeDotacion {
  /** Cuántas se deben contratar en total. Null si nadie ha definido una meta. */
  meta: number | null;
  /** De dónde sale la meta: la cifra del contrato, o la suma de las de los cargos. */
  origen: "contrato" | "cargos" | null;
  contratadas: number;
  /**
   * Las que ya están REGISTRADAS en la nómina (activas), tengan o no contrato todavía. Incluye a las
   * contratadas. Sirve para no dar a entender que hay una sola persona cuando hay siete en proceso.
   */
  registradas: number;
  /** Registradas que aún no cuentan como contratadas (sin fecha de ingreso o «sin contrato aún»). */
  sinContrato: number;
  faltan: number;
  sobran: number;
  /** 0–100, tope en 100: una meta superada no pasa de «completa». */
  porcentaje: number;
  /** 0–100: lo mismo pero con todas las registradas, para el tramo claro de la barra. */
  porcentajeRegistradas: number;
  /** Los cargos que tienen cantidad definida, para saber CUÁLES faltan. */
  porCargo: DotacionDeCargo[];
}

/**
 * La dotación: cuántas hay contra cuántas se deben contratar.
 *
 * El total del contrato manda si está definido; si no, la meta es la suma de las cantidades
 * de los cargos que la tengan. «Contratadas» son las personas ACTIVAS de la nómina: a quien se
 * dio de baja no se le cuenta, porque ya no está cubriendo el puesto.
 *
 * Una cantidad en 0 es una meta de verdad («a nadie con este cargo»), y null es «sin
 * definir»: se distinguen para que dejar un campo vacío no parezca una decisión.
 */
export function resumirDotacion(
  totalDelContrato: number | null,
  cargos: { id: string; nombre: string; cantidadRequerida: number | null; activo?: boolean }[],
  activas: { cargoId: string }[],
  /** Todas las registradas en la nómina (con o sin contrato); si no se dice, las mismas que `activas`. */
  registradasLista: { cargoId: string }[] = activas,
): ResumenDeDotacion {
  const contratadasPorCargo = new Map<string, number>();
  for (const p of activas) {
    contratadasPorCargo.set(p.cargoId, (contratadasPorCargo.get(p.cargoId) ?? 0) + 1);
  }

  const registradasPorCargo = new Map<string, number>();
  for (const p of registradasLista) {
    registradasPorCargo.set(p.cargoId, (registradasPorCargo.get(p.cargoId) ?? 0) + 1);
  }

  // Aparece el cargo que el contrato pide (tiene cantidad) y el que ya tiene gente registrada, aunque
  // nadie le haya puesto cantidad: un cargo con personas no puede quedar invisible. Los demás (el
  // catálogo entero de cargos o tipos de vehículo de ejemplo) no se listan: no son parte de lo que el
  // contrato requiere, y diez filas en cero esconden las dos que importan.
  const porCargo: DotacionDeCargo[] = cargos
    .filter((c) => c.cantidadRequerida !== null || registradasPorCargo.has(c.id))
    .map((c) => {
      const sinMeta = c.cantidadRequerida === null;
      const requeridas = sinMeta ? 0 : (c.cantidadRequerida as number);
      const contratadas = contratadasPorCargo.get(c.id) ?? 0;
      const registradas = Math.max(registradasPorCargo.get(c.id) ?? 0, contratadas);
      return {
        cargoId: c.id,
        nombre: c.nombre,
        requeridas,
        sinMeta,
        contratadas,
        registradas,
        sinContrato: registradas - contratadas,
        faltan: Math.max(requeridas - contratadas, 0),
        sobran: sinMeta ? 0 : Math.max(contratadas - requeridas, 0),
      };
    });

  const conMeta = porCargo.filter((c) => !c.sinMeta);
  const sumaDeCargos = conMeta.reduce((n, c) => n + c.requeridas, 0);
  const meta = totalDelContrato ?? (conMeta.length > 0 ? sumaDeCargos : null);
  const origen = totalDelContrato !== null ? "contrato" : conMeta.length > 0 ? "cargos" : null;
  const contratadas = activas.length;
  const registradas = Math.max(registradasLista.length, contratadas);

  return {
    meta,
    origen,
    contratadas,
    registradas,
    sinContrato: registradas - contratadas,
    porcentajeRegistradas: meta === null || meta === 0 ? 0 : Math.min(100, Math.round((registradas / meta) * 100)),
    faltan: meta === null ? 0 : Math.max(meta - contratadas, 0),
    sobran: meta === null ? 0 : Math.max(contratadas - meta, 0),
    porcentaje: meta === null || meta === 0 ? 0 : Math.min(100, Math.round((contratadas / meta) * 100)),
    porCargo,
  };
}
