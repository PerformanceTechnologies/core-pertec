import "server-only";

// Cliente mínimo para mindicador.cl (API pública gratuita que agrega datos
// oficiales del Banco Central/SII de Chile: UF, UTM, dólar, IPC, etc).
// `serie[0]` es siempre el valor más reciente (la API los devuelve en orden
// cronológico descendente).

interface RespuestaMindicador {
  codigo: string;
  serie: { fecha: string; valor: number }[];
}

// El cron tiene maxDuration = 30 s y el fetch sin tope de tiempo lo dejaba
// colgado cuando mindicador.cl no contestaba (falló por timeout el 2026-08-05 y
// el 2026-11-01). Cada intento corta a los 8 s y se reintenta con una pausa
// corta; el presupuesto total (22 s) deja margen bajo los 30 s para escribir en
// la base y avisar por correo si igual falla.
const TIMEOUT_INTENTO_MS = 8000;
const PRESUPUESTO_TOTAL_MS = 22000;
const MAX_INTENTOS = 3;
const PAUSA_ENTRE_INTENTOS_MS = 1500;

async function consultarIndicador(
  codigo: "uf" | "utm",
  timeoutMs: number
): Promise<{ valor: number; fecha: string }> {
  const res = await fetch(`https://mindicador.cl/api/${codigo}`, {
    // Nunca cachear: se llama una vez al día desde el cron, siempre se
    // quiere el valor más fresco disponible en ese momento.
    cache: "no-store",
    // La señal sigue activa mientras se lee el body, así que también corta
    // una respuesta que empieza y se queda a medias.
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`mindicador.cl respondió ${res.status} para /${codigo}`);

  const data = (await res.json()) as RespuestaMindicador;
  const ultimo = data.serie?.[0];
  if (!ultimo || typeof ultimo.valor !== "number") {
    throw new Error(`mindicador.cl no devolvió un valor válido para /${codigo}`);
  }
  return { valor: ultimo.valor, fecha: ultimo.fecha };
}

async function obtenerIndicador(codigo: "uf" | "utm"): Promise<{ valor: number; fecha: string }> {
  const inicio = Date.now();
  let ultimoError: unknown;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    // El último intento usa solo lo que queda del presupuesto, para que 3 x 8 s
    // + pausas no se pase de los 22 s.
    const restante = PRESUPUESTO_TOTAL_MS - (Date.now() - inicio);
    if (restante < 1000) break;

    try {
      return await consultarIndicador(codigo, Math.min(TIMEOUT_INTENTO_MS, restante));
    } catch (error) {
      ultimoError = error;
      if (intento < MAX_INTENTOS) {
        console.warn(
          `[mindicador] /${codigo} falló (intento ${intento}/${MAX_INTENTOS}):`,
          error instanceof Error ? error.message : error
        );
        await new Promise((listo) => setTimeout(listo, PAUSA_ENTRE_INTENTOS_MS));
      }
    }
  }

  throw ultimoError instanceof Error ? ultimoError : new Error(String(ultimoError));
}

export async function obtenerUfUtmVigentes(): Promise<{
  uf: number;
  utm: number;
  fechaUf: string;
  fechaUtm: string;
}> {
  const [uf, utm] = await Promise.all([obtenerIndicador("uf"), obtenerIndicador("utm")]);
  return { uf: uf.valor, utm: utm.valor, fechaUf: uf.fecha, fechaUtm: utm.fecha };
}
