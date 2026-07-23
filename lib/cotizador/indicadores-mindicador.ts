import "server-only";

// Cliente mínimo para mindicador.cl (API pública gratuita que agrega datos
// oficiales del Banco Central/SII de Chile: UF, UTM, dólar, IPC, etc).
// `serie[0]` es siempre el valor más reciente (la API los devuelve en orden
// cronológico descendente).

interface RespuestaMindicador {
  codigo: string;
  serie: { fecha: string; valor: number }[];
}

async function obtenerIndicador(codigo: "uf" | "utm"): Promise<{ valor: number; fecha: string }> {
  const res = await fetch(`https://mindicador.cl/api/${codigo}`, {
    // Nunca cachear: se llama una vez al día desde el cron, siempre se
    // quiere el valor más fresco disponible en ese momento.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`mindicador.cl respondió ${res.status} para /${codigo}`);

  const data = (await res.json()) as RespuestaMindicador;
  const ultimo = data.serie?.[0];
  if (!ultimo || typeof ultimo.valor !== "number") {
    throw new Error(`mindicador.cl no devolvió un valor válido para /${codigo}`);
  }
  return { valor: ultimo.valor, fecha: ultimo.fecha };
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
