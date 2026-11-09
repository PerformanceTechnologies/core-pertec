import "server-only";

// -----------------------------------------------------------------------------
//  Indicadores económicos de Chile para la cartilla de Finanzas.
//
//  UNA sola fuente: findic.cl (mismo formato que mindicador.cl). Se dejó fuera mindicador.cl
//  como respaldo a propósito: si dos fuentes difieren, la cartilla mostraría un valor u otro
//  según cuál alcanzó a responder, y nadie sabría cuál es el bueno.
//
//  Los valores cambian una vez al día, así que el servidor los pide a lo más cada 30 minutos
//  (caché de fetch de Next) sin importar cuánta gente tenga la cartilla abierta.
// -----------------------------------------------------------------------------

export interface Indicador {
  codigo: "dolar" | "uf" | "utm" | "ipc" | "tpm";
  nombre: string;
  valor: number;
  /** AAAA-MM-DD del dato (el IPC y la TPM traen la fecha de su último período). */
  fecha: string;
  unidad: "pesos" | "porcentaje";
  /** Cambio respecto del dato anterior de la serie (solo dólar), en pesos. */
  variacion: number | null;
}

const BASE = "https://findic.cl/api";
const REVALIDAR_S = 30 * 60;

const CODIGOS: { codigo: Indicador["codigo"]; nombre: string; unidad: Indicador["unidad"] }[] = [
  { codigo: "dolar", nombre: "Dólar observado", unidad: "pesos" },
  { codigo: "uf", nombre: "Unidad de fomento", unidad: "pesos" },
  { codigo: "utm", nombre: "Unidad tributaria mensual", unidad: "pesos" },
  { codigo: "ipc", nombre: "IPC mensual", unidad: "porcentaje" },
  { codigo: "tpm", nombre: "Tasa de política monetaria", unidad: "porcentaje" },
];

type Dato = { valor?: unknown; fecha?: unknown };

async function leer<T>(ruta: string): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, {
    next: { revalidate: REVALIDAR_S },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`findic.cl respondió ${r.status} para ${ruta || "/"}`);
  return (await r.json()) as T;
}

export async function obtenerIndicadores(): Promise<{ indicadores: Indicador[]; fuente: string }> {
  const [todo, dolar] = await Promise.all([
    leer<Record<string, Dato>>("/"),
    // La variación del dólar es un adorno: si su consulta falla, la cartilla sigue sin ella.
    leer<{ serie?: { valor?: unknown }[] }>("/dolar").catch(() => null),
  ]);

  const serie = dolar?.serie;
  const variacionDolar =
    Array.isArray(serie) && serie.length > 1 && Number.isFinite(Number(serie[0].valor)) && Number.isFinite(Number(serie[1].valor))
      ? Number(serie[0].valor) - Number(serie[1].valor)
      : null;

  const indicadores = CODIGOS.flatMap(({ codigo, nombre, unidad }): Indicador[] => {
    const d = todo?.[codigo];
    if (!d || typeof d.valor !== "number") return [];
    return [{ codigo, nombre, unidad, valor: d.valor, fecha: String(d.fecha ?? "").slice(0, 10), variacion: codigo === "dolar" ? variacionDolar : null }];
  });

  if (!indicadores.length) throw new Error("findic.cl no devolvió ningún indicador");
  return { indicadores, fuente: "findic.cl" };
}
