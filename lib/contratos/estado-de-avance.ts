// El estado visual de una carpeta o de un submódulo, igual en la tarjeta de la portada
// y en la fila de la lista.
//
// Sin "server-only": lo usan componentes de servidor y de cliente por igual. Y en un
// solo lugar, porque dos formas de decidir "esto va en curso" son la manera más rápida
// de que una carpeta aparezca ámbar en la portada y verde en su lista.

import type { Avance } from "./contratos-estado";

export type EstadoVisual = "vacia" | "sin" | "curso" | "alerta" | "completa";

const ETIQUETA: Record<Exclude<EstadoVisual, "alerta">, string> = {
  vacia: "Sin requisitos",
  sin: "Sin iniciar",
  curso: "En curso",
  completa: "Completa",
};

/**
 * Una alerta pesa más que un 100%: una carpeta «completa» con documentos vencidos no
 * está al día, y pintarla de verde sería mentir.
 */
export function estadoDeAvance(avance: Avance, alertas = 0): EstadoVisual {
  if (alertas > 0) return "alerta";
  // Nada que contar: ni requisitos ni nada marcado, o TODO marcado «no aplica». En
  // los dos casos no hay avance que mostrar, y decir «Sin iniciar» de una carpeta cuyos
  // requisitos no corresponden a este contrato sería pedir que alguien la inicie.
  if (avance.total === 0) return "vacia";
  if (avance.total > 0 && avance.subidos === avance.total) return "completa";
  return avance.subidos === 0 ? "sin" : "curso";
}

export function etiquetaDeEstado(estado: EstadoVisual, alertas = 0): string {
  if (estado === "alerta") return `${alertas} ${alertas === 1 ? "alerta" : "alertas"}`;
  return ETIQUETA[estado];
}
