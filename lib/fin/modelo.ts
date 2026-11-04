// Gestión financiera: vocabulario que comparten pantallas (cliente) y servidor. Sin base ni secretos.

import { peso } from "./reglas";

export const ETAPAS_OPORTUNIDAD = [
  { clave: "prospecto", etiqueta: "Prospecto", probabilidad: 10 },
  { clave: "calificada", etiqueta: "Calificada", probabilidad: 25 },
  { clave: "cotizacion", etiqueta: "Cotización enviada", probabilidad: 50 },
  { clave: "negociacion", etiqueta: "Negociación", probabilidad: 75 },
  { clave: "ganada", etiqueta: "Ganada", probabilidad: 100 },
  { clave: "perdida", etiqueta: "Perdida", probabilidad: 0 },
] as const;
export type EtapaOportunidad = (typeof ETAPAS_OPORTUNIDAD)[number]["clave"];

export const ETIQUETA_TIPO_VENTA: Record<string, string> = { servicio: "Servicio", arriendo: "Arriendo", venta: "Venta" };
export const ETIQUETA_TIPO_PROYECTO: Record<string, string> = { contrato: "Contrato", spot: "Spot", arriendo: "Arriendo", interno: "Interno" };
export const ETIQUETA_TRABAJO: Record<string, string> = { pendiente: "Pendiente", en_curso: "En curso", terminado: "Terminado" };
export const ETIQUETA_ESTADO_COTIZACION: Record<string, string> = {
  borrador: "Borrador", enviada: "Enviada", aceptada: "Aceptada", rechazada: "Rechazada", vencida: "Vencida", anulada: "Anulada", reemplazada: "Reemplazada",
};

export const TIPOS_DTE: Record<number, string> = {
  33: "Factura afecta",
  34: "Factura exenta",
  46: "Factura de compra",
  52: "Guía de despacho",
  56: "Nota de débito",
  61: "Nota de crédito",
  39: "Boleta",
  41: "Boleta exenta",
  110: "Factura de exportación",
};
export const DTE_CORTO: Record<number, string> = { 33: "FAC", 34: "FEX", 46: "FCO", 52: "GD", 56: "ND", 61: "NC", 39: "BOL", 41: "BEX", 110: "FEXP" };

export interface LineaCotizacion {
  productoId: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precioUnitario: number;
  descuentoPct: number;
  exento: boolean;
  meses: number | null;
}

/** Neto de una línea: cantidad × precio × (meses, en arriendo) − descuento, a peso. */
export function lineaNeta(l: Pick<LineaCotizacion, "cantidad" | "precioUnitario" | "descuentoPct" | "meses">): number {
  return peso(Number(l.cantidad) * Number(l.precioUnitario) * (l.meses ? Number(l.meses) : 1) * (1 - Math.max(0, Math.min(1, Number(l.descuentoPct) || 0))));
}

export function totalesCotizacion(lineas: LineaCotizacion[], tasaIva: number): { neto: number; exento: number; iva: number; total: number } {
  const netos = lineas.map((l) => ({ l, n: lineaNeta(l) }));
  const neto = netos.filter((x) => !x.l.exento).reduce((s, x) => s + x.n, 0);
  const exento = netos.filter((x) => x.l.exento).reduce((s, x) => s + x.n, 0);
  const iva = peso(neto * tasaIva);
  return { neto, exento, iva, total: neto + exento + iva };
}
