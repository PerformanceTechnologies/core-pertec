// Lo que comparten los Excel que salen del core: los colores (los mismos que la pantalla), el estilo
// de los encabezados y cómo escribir fechas y montos para que Excel no los desfigure.
//
// Sin "server-only" y sin dependencias: es solo estilo y formato, y se prueba sin la librería.

export type Celda = Record<string, unknown> | string | number | boolean | Date | null;
export type FilaDeExcel = Celda[];

// Verde = bien, ámbar = en curso o por mirar, rojo = hay que corregir, gris = no cuenta. Quien abre el
// Excel y la pantalla del core tiene que leer lo mismo sin aprender dos códigos.
export const VERDE = "#bbf7d0";
export const AMBAR = "#fde68a";
export const ROJO = "#fecaca";
export const GRIS = "#e5e7eb";
export const CELESTE = "#bae6fd";
export const AZUL = "#092970";
export const AZUL_CLARO = "#224dab";
export const BORDE = "#c7d0de";

export const ENCABEZADO = {
  fontWeight: "bold",
  backgroundColor: AZUL,
  textColor: "#ffffff",
  align: "center",
  alignVertical: "center",
  wrap: true,
  borderColor: BORDE,
} as const;

export const NEGRITA = { fontWeight: "bold" } as const;

/** «2026-10-05» → una fecha que Excel no corre un día por la zona horaria (a las 12:00 UTC). */
export function aFecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const [a, m, d] = valor.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(Date.UTC(a, m - 1, d, 12));
}

/**
 * Una celda de fecha, o una de texto vacío si no hay fecha. No `{ value: null, format: ... }`: la
 * librería rechaza un formato de fecha en una celda sin fecha.
 */
export function celdaDeFecha(valor: string | null | undefined, extras: Record<string, unknown> = {}): Celda {
  const fecha = aFecha(valor);
  return fecha ? { ...extras, value: fecha, format: "dd-mm-yyyy" } : { ...extras, value: "" };
}

/**
 * Un monto en pesos como NÚMERO con formato de miles, no como texto: así se puede sumar, filtrar y
 * ordenar en Excel. Sin monto, una celda vacía (no un cero, que diría «costó cero»).
 */
export function celdaDePesos(valor: number | null | undefined, extras: Record<string, unknown> = {}): Celda {
  if (valor === null || valor === undefined) return { ...extras, value: "" };
  return { ...extras, value: valor, format: "$#,##0", align: "right" };
}

/** Un porcentaje de 0 a 1 mostrado como «45%». */
export function celdaDePorcentaje(valor: number | null | undefined, extras: Record<string, unknown> = {}): Celda {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return { ...extras, value: "" };
  return { ...extras, value: valor, format: "0%", align: "center" };
}

/** El nombre del archivo en ASCII: viaja en una cabecera HTTP, donde un acento o una eñe se rompen. */
export function nombreDeArchivo(base: string, hoy: string, extension = "xlsx"): string {
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${limpio || "reporte"}-${hoy}.${extension}`;
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface Hoja {
  data: FilaDeExcel[];
  sheet: string;
  columns: { width: number }[];
  stickyRowsCount?: number;
  stickyColumnsCount?: number;
  /** false = sin la cuadrícula gris: las hojas tipo portada se ven como un informe, no como una planilla. */
  showGridLines?: boolean;
  /** Cómo sale al imprimir: las matrices anchas, apaisadas. */
  orientation?: "portrait" | "landscape";
}
