// La Orden de Compra (OC): líneas, monedas y totales. Sin "server-only": lo usan el formulario, el PDF y las pruebas.
//
// A diferencia de la cotización, la OC admite UF y dólares: el neto lleva 2 decimales en esas monedas y el
// redondeo a peso entero solo vale para CLP. El flujo de caja sigue en pesos (ver `aPesos`).

export const MONEDAS = ["CLP", "UF", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];
export const esMoneda = (x: unknown): x is Moneda => typeof x === "string" && (MONEDAS as readonly string[]).includes(x);

export const ETIQUETA_MONEDA: Record<Moneda, string> = { CLP: "Pesos chilenos (CLP)", UF: "Unidad de fomento (UF)", USD: "Dólares (USD)" };

export interface LineaOc {
  productoId: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precioUnitario: number;
  /** 0–1 (0,1 = 10 %). */
  descuentoPct: number;
  exento: boolean;
  nota: string | null;
}

export const LINEA_OC_VACIA: LineaOc = { productoId: null, descripcion: "", cantidad: 1, unidad: "un", precioUnitario: 0, descuentoPct: 0, exento: false, nota: null };

/** CLP a peso entero; UF y USD a centavos. */
export function redondear(moneda: Moneda, n: number): number {
  return moneda === "CLP" ? Math.round(n) : Math.round(n * 100) / 100;
}

export function netoLineaOc(l: Pick<LineaOc, "cantidad" | "precioUnitario" | "descuentoPct">, moneda: Moneda): number {
  const dto = Math.max(0, Math.min(1, Number(l.descuentoPct) || 0));
  return redondear(moneda, Number(l.cantidad) * Number(l.precioUnitario) * (1 - dto));
}

export interface TotalesOc {
  /** Afecto a IVA. */
  neto: number;
  exento: number;
  iva: number;
  total: number;
}

export function totalesOc(lineas: LineaOc[], tasaIva: number, moneda: Moneda): TotalesOc {
  const afecto = lineas.filter((l) => !l.exento).reduce((s, l) => s + netoLineaOc(l, moneda), 0);
  const exento = lineas.filter((l) => l.exento).reduce((s, l) => s + netoLineaOc(l, moneda), 0);
  const neto = redondear(moneda, afecto);
  const ex = redondear(moneda, exento);
  const iva = redondear(moneda, neto * tasaIva);
  return { neto, exento: ex, iva, total: redondear(moneda, neto + ex + iva) };
}

/** Pasa un monto de la moneda de la OC a pesos (el flujo de caja y los pagos trabajan en pesos). */
export function aPesos(monto: number, moneda: Moneda, tipoCambio: number): number {
  return moneda === "CLP" ? Math.round(monto) : Math.round(monto * (Number(tipoCambio) > 0 ? Number(tipoCambio) : 0));
}

const nf = (n: number, dec: number) => n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** «$1.234.567», «UF 12,34», «US$ 1.234,56». */
export function formatoMonto(monto: number, moneda: Moneda): string {
  if (moneda === "CLP") return `${monto < 0 ? "−" : ""}$${nf(Math.abs(Math.round(monto)), 0)}`;
  if (moneda === "UF") return `UF ${nf(monto, 2)}`;
  return `US$ ${nf(monto, 2)}`;
}

/** Quién solicita la compra: uno mismo, otra persona del Core, u otra persona (texto libre). */
export type SolicitanteTipo = "yo" | "usuario" | "otro";

/** Condiciones generales que salen por omisión en la OC si la empresa no cargó las suyas. */
export const CONDICIONES_OC_POR_OMISION = [
  "La factura debe emitirse a nombre de la empresa indicada en «Facturar a» y citar el N° de esta orden de compra.",
  "El proveedor debe confirmar la recepción y aceptación de esta orden.",
  "Los bienes o servicios deben ajustarse a lo cotizado; cualquier diferencia debe informarse antes de despachar.",
  "El pago se realiza según la condición indicada, contra recepción conforme y factura.",
].join("\n");

/**
 * Colores del PDF de cada empresa: el acento (títulos, barra, total) y un fondo claro con su tono.
 * Mismos tonos que la marca de cada empresa en el Core (app/globals.css).
 */
export const COLORES_OC: Record<string, { acento: string; claro: string; borde: string }> = {
  pertec: { acento: "#c85217", claro: "#fdf3ec", borde: "#f0d8c7" },
  zeus: { acento: "#b08419", claro: "#fbf6e6", borde: "#ecdfb8" },
  "performance-service": { acento: "#3e4650", claro: "#eff1f4", borde: "#d5d9df" },
};
export const coloresDeEmpresa = (slug: string) => COLORES_OC[slug] ?? COLORES_OC.pertec;
