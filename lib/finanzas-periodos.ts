/**
 * Qué períodos del RCV se releen, y con qué frecuencia.
 *
 * Sin "server-only" a propósito: lo comparten el cron y el botón de la pantalla, y si
 * cada uno tuviera su propio número, el botón diría "4 meses" el día que el cron pase a
 * leer tres.
 */

/**
 * Cuántos meses se releen completos, contando el actual.
 *
 * Cuatro y no la ventana de quince días que había antes. La ventana alcanza para detectar
 * un reclamo —el cliente tiene 8 días corridos— pero NO para arreglar el pasado, y eso
 * costó dos días de trabajo: cuando cambió cómo se deriva el estado de una venta, las
 * facturas más viejas que la ventana quedaron con el dato anterior y nada las volvía a
 * mirar. Releer cuatro meses en cada corrida hace que un cambio de lógica se cure solo.
 *
 * El costo es leer de nuevo meses que ya no pueden cambiar: son unos 9 segundos por mes
 * (medido) y ninguna escritura nueva, porque el upsert deja la fila igual.
 */
export const MESES_QUE_SE_RELEEN = 4;

/** Un período del RCV como lo espera el scraper: "2026-09". */
export const comoPeriodo = (fecha: Date): string =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;

/**
 * Los últimos `cuantos` meses, del MÁS VIEJO al más nuevo.
 *
 * En ese orden porque si el tope de tiempo corta el recorrido, lo que queda al día es lo
 * más viejo — que es justamente lo que ninguna otra corrida vuelve a mirar. Los meses
 * recientes se releen varias veces al día de todas formas.
 */
export function ultimosPeriodos(hoy: Date, cuantos = MESES_QUE_SE_RELEEN): string[] {
  return Array.from({ length: cuantos }, (_, i) =>
    comoPeriodo(new Date(hoy.getFullYear(), hoy.getMonth() - (cuantos - 1 - i), 1)),
  );
}
