// El grosor de una barra horizontal, en el porcentaje que pide ApexCharts.
//
// Existe porque Apex y Recharts piensan el grosor al revés. Recharts tenía `maxBarSize`:
// un TOPE en píxeles, así que con dos o tres filas las barras quedaban finas y prolijas.
// Apex solo acepta `barHeight` en porcentaje del espacio que le toca a cada fila, y ese
// espacio es "alto / cantidad de filas": con tres filas en 260 px, un 65% son barras de
// 56 px, tres lingotes que ocupan todo el gráfico.
//
// Esto convierte un tope en píxeles al porcentaje equivalente, así que las barras miden
// lo mismo tengan una fila o diez.

/**
 * @param alto Alto del gráfico en px.
 * @param filas Cuántas categorías se dibujan.
 * @param topeEnPx Grosor máximo de cada barra.
 * @param proporcionMaxima Cuánto del espacio de la fila puede ocupar como máximo, para
 *   que con muchas filas las barras no se peguen entre sí.
 */
export function grosorDeBarra(alto: number, filas: number, topeEnPx: number, proporcionMaxima = 0.65): string {
  // Sin filas no hay gráfico; el valor da igual pero no puede ser una división por cero.
  if (filas <= 0) return `${Math.round(proporcionMaxima * 100)}%`;
  const espacioPorFila = alto / filas;
  const proporcion = Math.min(proporcionMaxima, topeEnPx / espacioPorFila);
  // Un mínimo para que una barra no desaparezca cuando hay muchísimas filas.
  return `${Math.max(8, Math.round(proporcion * 100))}%`;
}
