// El vocabulario de Acreditación Vehículos: tipos, etiquetas y cómo se calcula el avance.
//
// Es el hermano de acreditacion-modelo.ts, y reutiliza de ahí todo lo que no depende de si lo que
// se acredita es una persona o un vehículo: el catálogo de documentos, el estado de cada uno, el
// avance y el conteo de vencimientos. Un documento vencido no cuenta como cumplido, y «no
// aplica» sale del denominador, en los dos módulos por igual: que el porcentaje signifique lo
// mismo en todo el core.
//
// Sin "server-only", por lo mismo que contratos-estado.ts: los componentes cliente necesitan las
// etiquetas y el cálculo.

import { FAENAS } from "./acreditacion-catalogos";
import {
  avanceDePersona,
  contarVencimientos,
  diasHasta,
  esRequerido,
  estadoVisible,
  DIAS_AVISO_VENCIMIENTO,
  type CampoBase,
  type CeldaDeDocumento,
  type TipoDocumento,
  type DocumentoPersona,
} from "./acreditacion-modelo";
import type { Avance } from "./contratos-estado";

// El documento de un vehículo es el mismo objeto que el de una persona: estado, archivos, fechas.
export type DocumentoDeVehiculo = DocumentoPersona;

// -----------------------------------------------------------------------------
//  Web Control y la etapa del camino
// -----------------------------------------------------------------------------

/** En qué va la documentación del vehículo en Web Control, la plataforma del mandante. */
export type EstadoWebControlVehiculo = "sin_cargar" | "en_revision" | "observado" | "al_dia";

export const ESTADOS_WEB_CONTROL_VEHICULO: EstadoWebControlVehiculo[] = [
  "sin_cargar",
  "en_revision",
  "observado",
  "al_dia",
];

export const ETIQUETAS_WEB_CONTROL_VEHICULO: Record<EstadoWebControlVehiculo, string> = {
  sin_cargar: "Sin cargar en Web Control",
  en_revision: "Cargado, en revisión",
  observado: "Observado: falta corregir",
  al_dia: "Documentación al día",
};

/**
 * En qué punto del camino está un vehículo: documentos → Web Control → acreditado.
 *
 * A diferencia de una persona no hay BUK (el sistema de remuneraciones): un vehículo se acredita
 * cuando tiene TODOS los documentos que se le exigen cargados y vigentes, y está acreditado en
 * Web Control. Se avisa lo PRIMERO que falta, no todo lo que falta.
 */
export type EtapaVehiculo = "documentacion" | "web_control" | "acreditado";

export const ETIQUETAS_ETAPA_VEHICULO: Record<EtapaVehiculo, string> = {
  documentacion: "En documentación",
  web_control: "Falta Web Control",
  acreditado: "Acreditado",
};

export function etapaDeVehiculo(avance: Avance, vehiculo: { wcAcreditado: boolean }): EtapaVehiculo {
  const documentosCompletos = avance.total > 0 && avance.subidos === avance.total;
  if (!documentosCompletos) return "documentacion";
  return vehiculo.wcAcreditado ? "acreditado" : "web_control";
}

// -----------------------------------------------------------------------------
//  Tipos de vehículo
// -----------------------------------------------------------------------------

/** El equivalente a un cargo: de él depende qué documentos se piden. */
export interface CategoriaDeVehiculo {
  id: string;
  nombre: string;
  activo: boolean;
  /** Los documentos que pide este tipo de vehículo. */
  tipoIds: string[];
  /** Cuántos vehículos lo tienen. Un tipo en uso no se puede eliminar. */
  vehiculos: number;
  /** Cuántos vehículos de este tipo se deben contratar. Null = no se ha definido. */
  cantidadRequerida: number | null;
}

// -----------------------------------------------------------------------------
//  Datos del vehículo
// -----------------------------------------------------------------------------

export const SECCIONES_DE_VEHICULO = ["Identificación", "Operación"] as const;

export type CampoDeVehiculo = CampoBase & { seccion: (typeof SECCIONES_DE_VEHICULO)[number] };

const GPS = ["Sí", "No"] as const;

/**
 * Los datos de un vehículo. Una sola lista que alimenta el formulario, la lectura de la base y el
 * guardado: agregar un dato es una línea acá y una columna en la migración, sin tocar los tres
 * lugares por separado. Usan los mismos controles y la misma validación que los de una persona.
 *
 * Quedan fuera la patente y el tipo (la identidad de la ficha), y lo que es seguimiento: Web
 * Control y las observaciones.
 */
export const CAMPOS_DE_VEHICULO: CampoDeVehiculo[] = [
  { campo: "marca", etiqueta: "Marca", tipo: "texto", seccion: "Identificación", marcador: "Toyota" },
  { campo: "modelo", etiqueta: "Modelo", tipo: "texto", seccion: "Identificación", marcador: "Hilux" },
  {
    campo: "anio",
    etiqueta: "Año",
    tipo: "numero",
    seccion: "Identificación",
    min: 1980,
    max: 2100,
    paso: 1,
    marcador: "2022",
  },
  { campo: "color", etiqueta: "Color", tipo: "texto", seccion: "Identificación" },
  {
    campo: "vin",
    etiqueta: "N.º de chasis (VIN)",
    tipo: "texto",
    seccion: "Identificación",
    ancho: 2,
    marcador: "17 caracteres",
  },

  { campo: "propietario", etiqueta: "Propietario", tipo: "texto", seccion: "Operación", ancho: 2 },
  { campo: "conductor", etiqueta: "Conductor asignado", tipo: "texto", seccion: "Operación", ancho: 2 },
  { campo: "faena", etiqueta: "Faena", tipo: "lista", seccion: "Operación", opciones: FAENAS, permiteOtro: true },
  { campo: "gps", etiqueta: "Tiene GPS", tipo: "lista", seccion: "Operación", opciones: GPS },
  { campo: "fecha_ingreso", etiqueta: "Ingreso a contrato", tipo: "fecha", seccion: "Operación" },
];

export interface Vehiculo {
  id: string;
  numero: number;
  /** Normalizada («ABCD12»); para mostrarla, formatearPatente(). */
  patente: string;
  categoriaId: string;
  activo: boolean;
  estadoWebControl: EstadoWebControlVehiculo;
  wcAcreditado: boolean;
  observaciones: string | null;
  carpetaItemId: string | null;
  carpetaUrl: string | null;
  creadoEn: string;
  /** Los campos de CAMPOS_DE_VEHICULO, por nombre de columna. */
  datos: Record<string, string | null>;
}

// -----------------------------------------------------------------------------
//  La patente
// -----------------------------------------------------------------------------

/** «bcdf-12», «BCDF 12» → «BCDF12». */
export function normalizarPatente(crudo: string): string {
  return crudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * ¿Parece una patente chilena? Cuatro letras y dos números (formato vigente), dos letras y
 * cuatro números (el anterior), o tres letras y dos o tres números (motos y remolques).
 *
 * Es la forma, no que exista: no hay forma de saber desde acá si esa patente está inscrita. Lo
 * que sí evita es lo común —una letra por un número, una patente con la «O» por un cero— antes
 * de que se vuelva una ficha que nadie encuentra.
 */
export function patenteEsValida(patente: string): boolean {
  return /^[A-Z]{4}\d{2}$/.test(patente) || /^[A-Z]{2}\d{4}$/.test(patente) || /^[A-Z]{3}\d{2,3}$/.test(patente);
}

/** «ABCD12» → «ABCD-12»: como se escribe una patente. */
export function formatearPatente(patente: string): string {
  const p = normalizarPatente(patente);
  if (/^[A-Z]{4}\d{2}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4)}`;
  if (/^[A-Z]{2}\d{4}$/.test(p)) return `${p.slice(0, 2)}-${p.slice(2)}`;
  if (/^[A-Z]{3}\d{2,3}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3)}`;
  return p;
}

/** «Toyota Hilux», o el tipo de vehículo si no se ha anotado la marca ni el modelo. */
export function descripcionDeVehiculo(v: Pick<Vehiculo, "datos">, respaldo = ""): string {
  return [v.datos.marca, v.datos.modelo].filter(Boolean).join(" ") || respaldo;
}

// -----------------------------------------------------------------------------
//  El análisis de un vehículo, calculado UNA vez
//
//  La nómina de la flota, la matriz y el reporte muestran los mismos números. Si cada pantalla
//  los calculara por su cuenta, el día que cambie una regla habría que acordarse de varios
//  lugares, y el que se olvide mostraría un porcentaje distinto al de la ficha.
// -----------------------------------------------------------------------------

export interface AnalisisDeVehiculo {
  avance: Avance;
  etapa: EtapaVehiculo;
  vencidos: number;
  porVencer: number;
  /** Por id de tipo. Están todos los del catálogo, requeridos o no. */
  celdas: Map<string, CeldaDeDocumento>;
}

export function analizarVehiculo(
  vehiculo: Vehiculo,
  documentos: ReadonlyMap<string, DocumentoDeVehiculo>,
  tipos: TipoDocumento[],
  tiposDeLaCategoria: ReadonlySet<string>,
  hoy: string,
): AnalisisDeVehiculo {
  const celdas = new Map<string, CeldaDeDocumento>();
  for (const tipo of tipos) {
    const doc = documentos.get(tipo.id);
    celdas.set(tipo.id, {
      requerido: esRequerido(tipo.id, tiposDeLaCategoria, doc),
      estado: estadoVisible(doc, hoy),
      diasParaVencer: doc?.estado === "cargado" ? diasHasta(doc.fechaVencimiento, hoy) : null,
    });
  }

  const avance = avanceDePersona(tipos, tiposDeLaCategoria, documentos, hoy);
  return {
    avance,
    etapa: etapaDeVehiculo(avance, vehiculo),
    ...contarVencimientos(tipos, tiposDeLaCategoria, documentos, hoy),
    celdas,
  };
}

// -----------------------------------------------------------------------------
//  Alertas
// -----------------------------------------------------------------------------

export interface AlertaDeVehiculo {
  vehiculoId: string;
  patente: string;
  tipo: "vencido" | "por_vencer";
  /** Qué documento. */
  asunto: string;
  /** Negativo = ya pasó. Ordena por urgencia. */
  dias: number;
}

/** Lo que requiere atención de un vehículo: documentos vencidos o por vencer. */
export function alertasDeVehiculo(
  vehiculo: Pick<Vehiculo, "id" | "patente">,
  analisis: AnalisisDeVehiculo,
  tipos: TipoDocumento[],
): AlertaDeVehiculo[] {
  const alertas: AlertaDeVehiculo[] = [];

  for (const tipo of tipos) {
    const celda = analisis.celdas.get(tipo.id);
    if (!celda?.requerido || celda.diasParaVencer === null) continue;
    const base = { vehiculoId: vehiculo.id, patente: vehiculo.patente, asunto: tipo.nombre, dias: celda.diasParaVencer };
    if (celda.diasParaVencer < 0) alertas.push({ ...base, tipo: "vencido" });
    else if (celda.diasParaVencer <= DIAS_AVISO_VENCIMIENTO) alertas.push({ ...base, tipo: "por_vencer" });
  }

  return alertas;
}

/** Lo más urgente primero: lo que ya pasó, y después lo que está por pasar. */
export function ordenarAlertasDeVehiculos(alertas: AlertaDeVehiculo[]): AlertaDeVehiculo[] {
  return [...alertas].sort((a, b) => a.dias - b.dias || a.patente.localeCompare(b.patente, "es"));
}

/** «vence en 5 días», «venció hace 2 días», «vence hoy». */
export function textoDeAlertaDeVehiculo(a: AlertaDeVehiculo): string {
  const d = a.dias;
  if (d < 0) return `venció hace ${-d} ${-d === 1 ? "día" : "días"}`;
  if (d === 0) return "vence hoy";
  return `vence en ${d} ${d === 1 ? "día" : "días"}`;
}
