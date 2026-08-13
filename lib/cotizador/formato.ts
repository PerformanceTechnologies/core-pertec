// Helpers de formato compartidos por los componentes cliente de /cotizador.
// Sin "server-only": corren en el navegador.

export function money(v: number): string {
  return "$" + Math.round(v).toLocaleString("es-CL");
}

export function pct(v: number, decimales = 1): string {
  return (v * 100).toFixed(decimales) + "%";
}

export function fechaCl(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Una fracción a su número de porcentaje, sin ruido de punto flotante.
 *
 * `0.014 * 100` NO da 1.4 en JavaScript: da 1.4000000000000001. Y `0.29 * 100` da
 * 28.999999999999996. Puesto en un `<input type="number">` eso se muestra tal cual
 * y, en un campo angosto, cortado: el usuario ve "1.40000000000" donde debería
 * leer "1,4".
 *
 * No sirve para mostrar texto —para eso está `pct`— sino para el VALOR de un input
 * numérico, que necesita un número y no una cadena formateada.
 *
 * Redondea a cuatro decimales del porcentaje, que es más precisión de la que
 * cualquier margen de una cotización va a necesitar.
 */
export function aNumeroPorcentaje(fraccion: number): number {
  return Math.round(fraccion * 1e6) / 1e4;
}
