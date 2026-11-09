import "server-only";

// -----------------------------------------------------------------------------
//  Indicadores económicos de Chile para el panel de Finanzas (UF, dólar, UTM, IPC, TPM).
//  Fuente: findic.cl (mismo formato que mindicador.cl, que queda de respaldo).
// -----------------------------------------------------------------------------

export interface Indicador {
  codigo: string;
  nombre: string;
  valor: number;
  fecha: string;
  unidad: "pesos" | "porcentaje";
  /** Cambio respecto del valor anterior (solo dólar). */
  variacion?: number | null;
}

const FUENTES = ["https://findic.cl/api", "https://mindicador.cl/api"];
const CODIGOS: { codigo: string; nombre: string; unidad: Indicador["unidad"] }[] = [
  { codigo: "uf", nombre: "UF", unidad: "pesos" },
  { codigo: "dolar", nombre: "Dólar observado", unidad: "pesos" },
  { codigo: "utm", nombre: "UTM", unidad: "pesos" },
  { codigo: "ipc", nombre: "IPC (mensual)", unidad: "porcentaje" },
  { codigo: "tpm", nombre: "Tasa de política monetaria", unidad: "porcentaje" },
];

async function leer(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function obtenerIndicadores(): Promise<{ indicadores: Indicador[]; fuente: string }> {
  let ultimoError: unknown = null;
  for (const base of FUENTES) {
    try {
      const [todo, dolar] = await Promise.all([leer(`${base}/`) as Promise<any>, (leer(`${base}/dolar`) as Promise<any>).catch(() => null)]);
      const indicadores: Indicador[] = CODIGOS.flatMap(({ codigo, nombre, unidad }) => {
        const d = todo?.[codigo];
        if (!d || typeof d.valor !== "number") return [];
        let variacion: number | null = null;
        if (codigo === "dolar" && Array.isArray(dolar?.serie) && dolar.serie.length > 1) {
          variacion = Number(dolar.serie[0].valor) - Number(dolar.serie[1].valor);
        }
        return [{ codigo, nombre, valor: d.valor, fecha: String(d.fecha).slice(0, 10), unidad, variacion }];
      });
      if (indicadores.length) return { indicadores, fuente: new URL(base).host };
    } catch (e) {
      ultimoError = e;
    }
  }
  throw new Error(`No se pudieron leer los indicadores: ${ultimoError instanceof Error ? ultimoError.message : "sin respuesta"}`);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
