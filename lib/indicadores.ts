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

export type CodigoIndicador = "dolar" | "euro" | "uf" | "utm" | "ivp" | "ipc" | "tpm" | "imacec" | "desempleo" | "cobre" | "ipsa";

export interface Indicador {
  codigo: CodigoIndicador;
  nombre: string;
  valor: number;
  /** AAAA-MM-DD del dato (los mensuales traen el primer día de su mes). */
  fecha: string;
  unidad: "pesos" | "porcentaje" | "usd" | "puntos";
  /** Cambio respecto del dato anterior de la serie (solo dólar), en pesos. */
  variacion: number | null;
  /** Cambio porcentual en la ventana de la serie: dólar vs. el dato anterior, UF vs. hace 30 días. */
  variacionPct: number | null;
  /** Menor y mayor valor de los últimos 30 días (solo dólar). */
  minimo: number | null;
  maximo: number | null;
  /** IPC: lo acumulado en el año calendario y en los últimos 12 meses, en %. */
  acumuladoAnio: number | null;
  acumulado12m: number | null;
}

const BASE = "https://findic.cl/api";
const REVALIDAR_S = 30 * 60;

/** Qué se muestra, en qué unidad y con qué nombre; la clave es la de findic.cl. */
const CATALOGO: { clave: string; codigo: CodigoIndicador; nombre: string; unidad: Indicador["unidad"] }[] = [
  { clave: "dolar", codigo: "dolar", nombre: "Dólar observado", unidad: "pesos" },
  { clave: "euro", codigo: "euro", nombre: "Euro", unidad: "pesos" },
  { clave: "uf", codigo: "uf", nombre: "Unidad de fomento", unidad: "pesos" },
  { clave: "utm", codigo: "utm", nombre: "Unidad tributaria mensual", unidad: "pesos" },
  { clave: "ivp", codigo: "ivp", nombre: "Índice de valor promedio", unidad: "pesos" },
  { clave: "ipc", codigo: "ipc", nombre: "IPC mensual", unidad: "porcentaje" },
  { clave: "tpm", codigo: "tpm", nombre: "Tasa de política monetaria", unidad: "porcentaje" },
  { clave: "imacec", codigo: "imacec", nombre: "Imacec", unidad: "porcentaje" },
  { clave: "tasa_desempleo", codigo: "desempleo", nombre: "Tasa de desempleo", unidad: "porcentaje" },
  { clave: "libra_cobre", codigo: "cobre", nombre: "Cobre (por libra)", unidad: "usd" },
  { clave: "ipsa", codigo: "ipsa", nombre: "IPSA", unidad: "puntos" },
];

type Dato = { valor?: unknown; fecha?: unknown };
type Punto = { fecha: string; valor: number };

async function leer<T>(ruta: string): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, {
    next: { revalidate: REVALIDAR_S },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`findic.cl respondió ${r.status} para ${ruta || "/"}`);
  return (await r.json()) as T;
}

/** La serie de un indicador, del dato más reciente al más antiguo. Si falla, null: son adornos. */
async function serieDe(codigo: string): Promise<Punto[] | null> {
  try {
    const { serie } = await leer<{ serie?: { fecha?: unknown; valor?: unknown }[] }>(`/${codigo}`);
    if (!Array.isArray(serie)) return null;
    const puntos = serie
      .map((p) => ({ fecha: String(p.fecha ?? "").slice(0, 10), valor: Number(p.valor) }))
      .filter((p) => p.fecha && Number.isFinite(p.valor))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    return puntos.length ? puntos : null;
  } catch {
    return null;
  }
}

const pct = (nuevo: number, antiguo: number) => (antiguo ? ((nuevo - antiguo) / antiguo) * 100 : null);

/** Inflación acumulada de los primeros `meses` datos de la serie mensual (más reciente primero). */
function acumular(meses: Punto[]): number {
  return (meses.reduce((acc, m) => acc * (1 + m.valor / 100), 1) - 1) * 100;
}

export async function obtenerIndicadores(): Promise<{ indicadores: Indicador[]; fuente: string }> {
  const [todo, dolar, uf, ipc] = await Promise.all([
    leer<Record<string, Dato>>("/"),
    serieDe("dolar"),
    serieDe("uf"),
    serieDe("ipc"),
  ]);

  const indicadores = CATALOGO.flatMap(({ clave, codigo, nombre, unidad }): Indicador[] => {
    const d = todo?.[clave];
    if (!d || typeof d.valor !== "number") return [];
    const i: Indicador = {
      codigo, nombre, unidad,
      valor: d.valor,
      fecha: String(d.fecha ?? "").slice(0, 10),
      variacion: null, variacionPct: null, minimo: null, maximo: null, acumuladoAnio: null, acumulado12m: null,
    };

    if (codigo === "dolar" && dolar && dolar.length > 1) {
      i.variacion = dolar[0].valor - dolar[1].valor;
      i.variacionPct = pct(dolar[0].valor, dolar[1].valor);
      const valores = dolar.map((p) => p.valor);
      i.minimo = Math.min(...valores);
      i.maximo = Math.max(...valores);
    }
    if (codigo === "uf" && uf && uf.length > 1) {
      i.variacionPct = pct(uf[0].valor, uf[uf.length - 1].valor);
    }
    if (codigo === "ipc" && ipc && ipc.length) {
      const anio = ipc[0].fecha.slice(0, 4);
      i.acumuladoAnio = acumular(ipc.filter((m) => m.fecha.startsWith(anio)));
      // Con menos de 12 meses de historia, el acumulado a 12 meses sería mentira.
      if (ipc.length >= 12) i.acumulado12m = acumular(ipc.slice(0, 12));
    }
    return [i];
  });

  if (!indicadores.length) throw new Error("findic.cl no devolvió ningún indicador");
  return { indicadores, fuente: "findic.cl" };
}
