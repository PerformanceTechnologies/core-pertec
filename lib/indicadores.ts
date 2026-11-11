import "server-only";
import { supabaseAdmin } from "./supabase-admin";

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

// Fuentes, en orden: findic.cl y, si falla, mindicador.cl (mismo formato). Si ambas fallan, el
// último valor guardado en la base (indicadores_respaldo).
const FUENTES = ["https://findic.cl/api", "https://mindicador.cl/api"];
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

async function leer<T>(ruta: string, base = FUENTES[0]): Promise<T> {
  const r = await fetch(`${base}${ruta}`, {
    next: { revalidate: REVALIDAR_S },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${new URL(base).host} respondió ${r.status} para ${ruta || "/"}`);
  return (await r.json()) as T;
}

/** La serie de un indicador, del dato más reciente al más antiguo. Si falla, null: son adornos. */
async function serieDe(codigo: string, base = FUENTES[0]): Promise<Punto[] | null> {
  try {
    const { serie } = await leer<{ serie?: { fecha?: unknown; valor?: unknown }[] }>(`/${codigo}`, base);
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

async function leerDe(base: string): Promise<{ indicadores: Indicador[]; fuente: string }> {
  const [todo, dolar, uf, ipc] = await Promise.all([
    leer<Record<string, Dato>>("/", base),
    serieDe("dolar", base),
    serieDe("uf", base),
    serieDe("ipc", base),
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

  if (!indicadores.length) throw new Error(`${new URL(base).host} no devolvió ningún indicador`);
  return { indicadores, fuente: new URL(base).host };
}

/**
 * Los indicadores de hoy. Prueba las fuentes en orden y guarda en la base lo que lee bien; si
 * ninguna responde, devuelve lo último guardado (con su fecha en `fuente`). Solo falla si nunca
 * se ha leído nada.
 */
// ---------- Banco Central de Chile (BDE, API SieteRestWS) ------------------------------------
//
// La fuente oficial. Pide usuario y clave (registro gratuito en si3.bcentral.cl): van en las
// variables BCCH_USUARIO y BCCH_CLAVE. Sin ellas, se usan las fuentes públicas de siempre.

const BCCH = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";
const SERIES_BCCH: { serie: string; codigo: CodigoIndicador; nombre: string; unidad: Indicador["unidad"]; dias: number }[] = [
  { serie: "F073.TCO.PRE.Z.D", codigo: "dolar", nombre: "Dólar observado", unidad: "pesos", dias: 45 },
  { serie: "F072.CLP.EUR.N.O.D", codigo: "euro", nombre: "Euro", unidad: "pesos", dias: 15 },
  { serie: "F073.UFF.PRE.Z.D", codigo: "uf", nombre: "Unidad de fomento", unidad: "pesos", dias: 40 },
  { serie: "F073.UTR.PRE.Z.M", codigo: "utm", nombre: "Unidad tributaria mensual", unidad: "pesos", dias: 70 },
  { serie: "F074.IPC.VAR.Z.Z.C.M", codigo: "ipc", nombre: "IPC mensual", unidad: "porcentaje", dias: 420 },
  { serie: "F022.TPM.TIN.D001.NO.Z.D", codigo: "tpm", nombre: "Tasa de política monetaria", unidad: "porcentaje", dias: 60 },
];

async function serieBcch(serie: string, dias: number): Promise<Punto[]> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86_400_000);
  const q = new URLSearchParams({
    user: process.env.BCCH_USUARIO!,
    pass: process.env.BCCH_CLAVE!,
    firstdate: desde.toISOString().slice(0, 10),
    lastdate: hasta.toISOString().slice(0, 10),
    timeseries: serie,
    function: "GetSeries",
  });
  const r = await fetch(`${BCCH}?${q}`, { next: { revalidate: REVALIDAR_S }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Banco Central respondió ${r.status}`);
  const j = (await r.json()) as { Codigo?: number; Descripcion?: string; Series?: { Obs?: { indexDateString?: string; value?: string; statusCode?: string }[] } };
  if (j.Codigo !== 0) throw new Error(`Banco Central: ${j.Descripcion ?? "error"}`);
  return (j.Series?.Obs ?? [])
    .filter((o) => o.statusCode === "OK" && o.value && o.value !== "NaN")
    .map((o) => {
      const [d, m, a] = String(o.indexDateString).split("-");
      return { fecha: `${a}-${m}-${d}`, valor: Number(o.value) };
    })
    .filter((p) => Number.isFinite(p.valor))
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
}

async function leerBcch(): Promise<{ indicadores: Indicador[]; fuente: string }> {
  const series = await Promise.all(SERIES_BCCH.map((s) => serieBcch(s.serie, s.dias).catch(() => [] as Punto[])));
  const indicadores = SERIES_BCCH.flatMap((s, k): Indicador[] => {
    const p = series[k];
    if (!p.length) return [];
    const i: Indicador = {
      codigo: s.codigo, nombre: s.nombre, unidad: s.unidad, valor: p[0].valor, fecha: p[0].fecha,
      variacion: null, variacionPct: null, minimo: null, maximo: null, acumuladoAnio: null, acumulado12m: null,
    };
    if (s.codigo === "dolar" && p.length > 1) {
      i.variacion = p[0].valor - p[1].valor;
      i.variacionPct = pct(p[0].valor, p[1].valor);
      const ult30 = p.filter((x) => x.fecha >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)).map((x) => x.valor);
      if (ult30.length) { i.minimo = Math.min(...ult30); i.maximo = Math.max(...ult30); }
    }
    if (s.codigo === "uf" && p.length > 1) i.variacionPct = pct(p[0].valor, p[p.length - 1].valor);
    if (s.codigo === "ipc") {
      const anio = p[0].fecha.slice(0, 4);
      i.acumuladoAnio = acumular(p.filter((m) => m.fecha.startsWith(anio)));
      if (p.length >= 12) i.acumulado12m = acumular(p.slice(0, 12));
    }
    return [i];
  });
  if (!indicadores.length) throw new Error("El Banco Central no devolvió ningún indicador.");
  return { indicadores, fuente: "Banco Central de Chile" };
}

export async function obtenerIndicadores(): Promise<{ indicadores: Indicador[]; fuente: string }> {
  let ultimoError: unknown = null;
  // Primero el Banco Central (si hay credenciales); lo que no traiga (cobre, IPSA…) lo completa la
  // fuente pública.
  const lectores: (() => Promise<{ indicadores: Indicador[]; fuente: string }>)[] = [
    ...(process.env.BCCH_USUARIO && process.env.BCCH_CLAVE
      ? [async () => {
          const oficial = await leerBcch();
          const extra = await leerDe(FUENTES[0]).catch(() => null);
          const ya = new Set(oficial.indicadores.map((i) => i.codigo));
          return { indicadores: [...oficial.indicadores, ...(extra?.indicadores.filter((i) => !ya.has(i.codigo)) ?? [])], fuente: oficial.fuente };
        }]
      : []),
    ...FUENTES.map((base) => () => leerDe(base)),
  ];
  for (const leerFuente of lectores) {
    try {
      const r = await leerFuente();
      await supabaseAdmin
        .from("indicadores_respaldo")
        .upsert({ id: "ultimo", datos: r.indicadores, fuente: r.fuente, actualizado_en: new Date().toISOString() })
        .then(({ error }) => error && console.error("[indicadores] no se pudo guardar el respaldo:", error.message));
      return r;
    } catch (e) {
      ultimoError = e;
    }
  }
  const { data } = await supabaseAdmin.from("indicadores_respaldo").select("datos, fuente, actualizado_en").eq("id", "ultimo").maybeSingle();
  if (data && Array.isArray(data.datos) && data.datos.length) {
    const cuando = new Date(data.actualizado_en as string).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
    return { indicadores: data.datos as Indicador[], fuente: `${data.fuente} (guardado el ${cuando})` };
  }
  throw new Error(`No se pudieron leer los indicadores: ${ultimoError instanceof Error ? ultimoError.message : "sin respuesta"}`);
}
