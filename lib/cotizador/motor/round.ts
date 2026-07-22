/** ROUND a 0 decimales, igual convención que Excel (redondeo half-away-from-zero). */
export function round0(x: number): number {
  return x >= 0 ? Math.round(x) : -Math.round(-x);
}

/** Descuento redondeado y negado, evitando el -0 cuando la tasa aplicable es 0. */
export function negRound0(x: number): number {
  return -round0(x) || 0;
}
