import "server-only";
import { cache } from "react";

/**
 * Medición TEMPORAL de cuánto tarda cada parte de una carpeta de Contratos.
 *
 * Se agregó para encontrar qué hace lenta la portada y Documentos generales (no hay acceso a los
 * registros de Vercel desde donde se trabaja). Solo la ve un administrador que abre la página con
 * `?medir=1`. Se saca cuando se sepa qué atacar.
 */
interface Marca {
  nombre: string;
  /** Milisegundos desde que empezó la página hasta que partió esta parte. */
  desde: number;
  ms: number;
}

/** Uno por petición (cache() de React): cada página tiene su propia lista. */
export const registroDeMedicion = cache(() => ({ inicio: performance.now(), marcas: [] as Marca[], llamadasGraph: 0, listadosPedidos: 0 }));

/** Cuenta una llamada real a Microsoft Graph (para saber si el caché acierta). */
export function contarLlamadaGraph(): void {
  try {
    registroDeMedicion().llamadasGraph++;
  } catch {
    /* fuera de una petición */
  }
}

/** Cuenta un listado pedido para bajar el árbol (acierte o no el caché). */
export function contarListado(): void {
  try {
    registroDeMedicion().listadosPedidos++;
  } catch {
    /* fuera de una petición */
  }
}

export async function medir<T>(nombre: string, trabajo: Promise<T> | (() => Promise<T>)): Promise<T> {
  const registro = registroDeMedicion();
  const t0 = performance.now();
  try {
    return await (typeof trabajo === "function" ? trabajo() : trabajo);
  } finally {
    registro.marcas.push({ nombre, desde: Math.round(t0 - registro.inicio), ms: Math.round(performance.now() - t0) });
  }
}

/** La tabla, al pie de la página. Se dibuja al final, cuando todo lo medido ya terminó. */
export function TablaDeMedicion() {
  const { inicio, marcas, llamadasGraph, listadosPedidos } = registroDeMedicion();
  // eslint-disable-next-line react-hooks/purity -- medición temporal: leer el reloj es justamente lo que se quiere
  const total = Math.round(performance.now() - inicio);
  const filas = [...marcas].sort((a, b) => a.desde - b.desde);
  return (
    <details open className="mt-8 rounded-xl border border-dashed border-borde p-4 text-xs text-gris">
      <summary className="cursor-pointer font-semibold text-tinta">Medición (solo administradores) · total en el servidor: {total} ms · {listadosPedidos} listados del árbol · {llamadasGraph} llamadas reales a Graph</summary>
      <table className="mt-3 w-full font-mono">
        <thead>
          <tr className="text-left"><th className="pr-4">Parte</th><th className="pr-4 text-right">Parte en (ms)</th><th className="text-right">Duró (ms)</th></tr>
        </thead>
        <tbody>
          {filas.map((m, i) => (
            <tr key={i} className={m.ms > 500 ? "font-bold text-tinta" : ""}>
              <td className="pr-4">{m.nombre}</td>
              <td className="pr-4 text-right">{m.desde}</td>
              <td className="text-right">{m.ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
