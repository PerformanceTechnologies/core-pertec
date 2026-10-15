// El vocabulario de Logística y Gastos de arranque: estados, etiquetas y cómo se
// calcula el avance de cada uno.
//
// Sin "server-only" y sin tocar la base, por lo mismo que contratos-estado.ts: lo
// importan componentes cliente (el filtro de la lista, el selector de estado) y los
// cálculos tienen que poder probarse sin Supabase.

import type { Avance } from "./contratos-estado";
import { diasHasta } from "./acreditacion-modelo";

export type ModuloArranque = "logistica" | "gastos";

/**
 * En qué tramo de la vida de una partida está un estado.
 *
 * `final` es lo que cuenta como hecho —ejecutada, pagada—, y `fuera` lo que sale de la
 * cuenta, igual que «No aplica» en los documentos: una partida cancelada no es una
 * pendiente, y dejarla en el total haría el 100% inalcanzable.
 */
export type Fase = "inicio" | "curso" | "final" | "fuera";

export interface EstadoDePartida {
  clave: string;
  etiqueta: string;
  fase: Fase;
}

export interface ConfiguracionDeModulo {
  modulo: ModuloArranque;
  /** El slug de la aplicación en el catálogo (lo que se asigna en /usuarios). */
  appSlug: string;
  /** La ruta del módulo. */
  ruta: string;
  titulo: string;
  /** El título de la tarjeta de la portada, en mayúsculas como las demás. */
  tituloTarjeta: string;
  /** Lo que se cuenta en la tarjeta: «ejecutadas», «pagadas». */
  unidad: string;
  singular: string;
  plural: string;
  descripcion: string;
  etiquetaFecha: string;
  etiquetaPresupuesto: string;
  etiquetaReal: string;
  etiquetaReferencia: string;
  /** Qué es una alerta en este módulo. */
  etiquetaAlerta: string;
  estados: EstadoDePartida[];
}

export const MODULOS: Record<ModuloArranque, ConfiguracionDeModulo> = {
  logistica: {
    modulo: "logistica",
    appSlug: "logistica",
    ruta: "/contratos/logistica",
    titulo: "Logística",
    tituloTarjeta: "LOGÍSTICA",
    unidad: "ejecutadas",
    singular: "requerimiento",
    plural: "requerimientos",
    descripcion:
      "Lo que hay que mover, alojar, alimentar y proveer para que el contrato arranque, y para cuándo.",
    etiquetaFecha: "Fecha requerida",
    etiquetaPresupuesto: "Costo estimado",
    etiquetaReal: "Costo real",
    etiquetaReferencia: "N° de OC o guía",
    etiquetaAlerta: "atrasados",
    estados: [
      { clave: "por_solicitar", etiqueta: "Por solicitar", fase: "inicio" },
      { clave: "solicitado", etiqueta: "Solicitado", fase: "curso" },
      { clave: "confirmado", etiqueta: "Confirmado", fase: "curso" },
      { clave: "ejecutado", etiqueta: "Ejecutado", fase: "final" },
      { clave: "cancelado", etiqueta: "Cancelado", fase: "fuera" },
    ],
  },
  gastos: {
    modulo: "gastos",
    appSlug: "gastos-arranque",
    ruta: "/contratos/gastos-arranque",
    titulo: "Gastos de arranque",
    tituloTarjeta: "GASTOS ARRANQUE",
    unidad: "pagados",
    singular: "gasto",
    plural: "gastos",
    descripcion:
      "Lo presupuestado, aprobado y pagado para poner en marcha el contrato, contra lo que se estimó.",
    etiquetaFecha: "Fecha del gasto",
    etiquetaPresupuesto: "Estimado",
    etiquetaReal: "Monto pagado",
    etiquetaReferencia: "N° de OC o factura",
    etiquetaAlerta: "sobre presupuesto",
    // El camino de una línea de gasto: se estima, se cotiza, se aprueba una cotización, se emite la
    // orden de compra y se paga. Las claves «aprobado» y «comprometido» ya existían (con otros
    // nombres en pantalla): se conservan para no tocar lo que ya estaba cargado.
    estados: [
      { clave: "presupuestado", etiqueta: "Por cotizar", fase: "inicio" },
      { clave: "cotizando", etiqueta: "Cotizando", fase: "curso" },
      { clave: "cotizada", etiqueta: "Con cotizaciones", fase: "curso" },
      { clave: "aprobado", etiqueta: "Aprobado", fase: "curso" },
      { clave: "comprometido", etiqueta: "OC emitida", fase: "curso" },
      { clave: "pagado", etiqueta: "Pagado", fase: "final" },
      { clave: "anulado", etiqueta: "Anulado", fase: "fuera" },
    ],
  },
};

export function esModulo(valor: unknown): valor is ModuloArranque {
  return valor === "logistica" || valor === "gastos";
}

export function estadoInicial(modulo: ModuloArranque): string {
  return MODULOS[modulo].estados[0].clave;
}

export function estadoValido(modulo: ModuloArranque, clave: string): boolean {
  return MODULOS[modulo].estados.some((e) => e.clave === clave);
}

export function faseDe(modulo: ModuloArranque, clave: string): Fase {
  return MODULOS[modulo].estados.find((e) => e.clave === clave)?.fase ?? "inicio";
}

export function etiquetaDeEstadoDePartida(modulo: ModuloArranque, clave: string): string {
  return MODULOS[modulo].estados.find((e) => e.clave === clave)?.etiqueta ?? clave;
}

export interface Categoria {
  id: string;
  modulo: ModuloArranque;
  nombre: string;
  orden: number;
  activo: boolean;
  /** Lo asignado a este ítem (solo Gastos). Null = sin presupuesto definido. */
  presupuesto: number | null;
}

export interface Partida {
  id: string;
  /** El que lleva su carpeta en SharePoint («0007 - …»). Lo asigna la base. */
  numero: number;
  /** La carpeta en SharePoint; nula hasta que se sube el primer archivo. */
  carpetaItemId: string | null;
  carpetaUrl: string | null;
  modulo: ModuloArranque;
  categoriaId: string;
  descripcion: string;
  proveedor: string | null;
  referencia: string | null;
  estado: string;
  fecha: string | null;
  montoPresupuestado: number | null;
  montoReal: number | null;
  /** El total de la cotización aprobada (solo Gastos). Lo escribe la aprobación, no el formulario. */
  montoComprometido: number | null;
  /** Cuántas unidades se compran: lo que multiplica el precio de las cotizaciones. */
  cantidad: number;
  /** Cotización, compra directa o por otra vía (solo Gastos). */
  modalidad: "cotizacion" | "compra_directa" | "otra_via";
  /**
   * La partida del OTRO módulo con la que se relaciona (un gasto con el requerimiento de logística
   * que lo mueve, o al revés). Opcional y solo informativo: no cambia estados, plazos ni montos.
   */
  partidaVinculadaId: string | null;
  enlace: string | null;
  notas: string | null;
  responsableId: string | null;
  /** O la contraparte, si lo que falta depende de afuera. Nunca los dos a la vez. */
  responsableExternoId: string | null;
  creadoPor: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Lo mínimo para el resumen: leer solo esto es lo que hace barata la tarjeta de la portada. */
export type PartidaResumida = Pick<
  Partida,
  "estado" | "fecha" | "montoPresupuestado" | "montoReal"
>;

/**
 * Una alerta es algo que alguien tiene que mirar HOY:
 *  · logística: lo que se necesitaba para una fecha que ya pasó y no se ejecutó;
 *  · gastos: lo que costó más de lo presupuestado.
 *
 * Lo que está en la fase final o fuera de la cuenta nunca alerta: un requerimiento
 * ejecutado tarde ya no es un problema de hoy, y un gasto anulado no cuesta nada.
 */
export function esAlerta(modulo: ModuloArranque, p: PartidaResumida, hoy: string): boolean {
  const fase = faseDe(modulo, p.estado);
  if (fase === "fuera") return false;

  if (modulo === "logistica") {
    if (fase === "final") return false;
    const dias = diasHasta(p.fecha, hoy);
    return dias !== null && dias < 0;
  }

  return (
    p.montoPresupuestado !== null &&
    p.montoPresupuestado > 0 &&
    p.montoReal !== null &&
    p.montoReal > p.montoPresupuestado
  );
}

export interface ResumenDeArranque {
  avance: Avance;
  alertas: number;
  /** Suma de lo presupuestado, sin contar lo cancelado o anulado. */
  presupuestado: number;
  /** Suma de lo real registrado, sin contar lo cancelado o anulado. */
  real: number;
  /** Lo real de las partidas ya en su fase final (pagadas, ejecutadas). */
  cerrado: number;
  /** Cuántas siguen en el primer estado: nadie ha movido nada. */
  porIniciar: number;
}

/**
 * El resumen de un módulo, calculado UNA vez.
 *
 * La tarjeta de la portada y el encabezado del módulo muestran los mismos números; si
 * cada uno los calculara por su cuenta, el día que cambie una regla habría que
 * acordarse de dos lugares.
 */
export function resumir(
  modulo: ModuloArranque,
  partidas: PartidaResumida[],
  hoy: string,
): ResumenDeArranque {
  let fuera = 0;
  let finalizadas = 0;
  let total = 0;
  let alertas = 0;
  let presupuestado = 0;
  let real = 0;
  let cerrado = 0;
  let porIniciar = 0;

  for (const p of partidas) {
    const fase = faseDe(modulo, p.estado);
    if (fase === "fuera") {
      fuera++;
      continue;
    }

    total++;
    if (fase === "final") finalizadas++;
    if (fase === "inicio") porIniciar++;
    if (esAlerta(modulo, p, hoy)) alertas++;

    presupuestado += p.montoPresupuestado ?? 0;
    real += p.montoReal ?? 0;
    if (fase === "final") cerrado += p.montoReal ?? 0;
  }

  return {
    avance: {
      total,
      subidos: finalizadas,
      pendientes: total - finalizadas,
      noAplican: fuera,
      porcentaje: total === 0 ? 0 : Math.round((finalizadas / total) * 100),
    },
    alertas,
    presupuestado,
    real,
    cerrado,
    porIniciar,
  };
}

const PESOS = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** «$1.234.567», o un guion si no hay monto. */
export function formatearPesos(monto: number | null | undefined): string {
  return monto === null || monto === undefined ? "—" : PESOS.format(monto);
}

/**
 * Un monto escrito por una persona → entero, o null si está vacío.
 *
 * Acepta «1.500.000», «$ 1500000» y «1,500,000»: lo que se pega desde un correo o una
 * planilla. Rechaza decimales y negativos en vez de redondearlos en silencio: un monto
 * de 1.500,50 casi seguro es un error de tipeo, y guardar 1.500 o 150.050 sería elegir
 * por la persona.
 */
export function leerMonto(valor: unknown, etiqueta: string): number | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  const limpio = texto.replace(/[$\s]/g, "");
  if (!/^\d{1,3}([.,]\d{3})+$|^\d+$/.test(limpio)) {
    throw new Error(`${etiqueta}: escribe un monto en pesos, sin decimales (por ejemplo 1.500.000).`);
  }

  const numero = Number(limpio.replace(/[.,]/g, ""));
  if (!Number.isSafeInteger(numero)) throw new Error(`${etiqueta}: el monto es demasiado grande.`);
  return numero;
}

/** Solo http(s): un enlace «javascript:» pegado en un campo no debe convertirse en un <a>. */
export function leerEnlace(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new Error("El enlace al respaldo no es una dirección válida (debe empezar con https://).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("El enlace al respaldo debe empezar con https://.");
  }
  return url.toString();
}
