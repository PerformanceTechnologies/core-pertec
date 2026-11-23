import "server-only";
import type { MovimientoEmisso, NominaEmisso, SaldoEmisso } from "./banco-emisso-modelo";

// -----------------------------------------------------------------------------
//  Emisso Connect: cliente de SOLO LECTURA.
//
//  · La clave vive en EMISSO_API_KEY y la conexión de Itaú en EMISSO_ITAU_CONEXION, en el servidor (Vercel).
//    Este repositorio es público: nada de esto se escribe en el código ni llega al navegador.
//  · La dirección es fija (connect.emisso.ai): una variable mal puesta no puede mandar la clave a otro sitio.
//  · Solo se llaman herramientas de consulta. NO se piden sincronizaciones: Emisso ya sincroniza Itaú solo
//    (cada 4 h según conexiones.estado.consultar), y cada sincronización es un login al banco. Así el Core no
//    agrega ni un ingreso al portal.
//  · Los errores llevan el código de Emisso, no el cuerpo completo (puede traer datos bancarios).
// -----------------------------------------------------------------------------

const BASE = "https://connect.emisso.ai/api/v1";
const TIEMPO_MAXIMO_MS = 30_000;

interface Config {
  clave: string;
  conexion: string;
}

function configuracion(): Config | null {
  const clave = process.env.EMISSO_API_KEY?.trim();
  const conexion = process.env.EMISSO_ITAU_CONEXION?.trim();
  if (!clave || !conexion) return null;
  if (!clave.startsWith("connect_sk_")) throw new Error("[emisso] EMISSO_API_KEY no tiene la forma connect_sk_….");
  if (!/^conn_[a-z0-9]+$/i.test(conexion)) throw new Error("[emisso] EMISSO_ITAU_CONEXION no tiene la forma conn_….");
  return { clave, conexion };
}

export function emissoConfigurado(): boolean {
  try {
    return configuracion() !== null;
  } catch {
    return true; // está puesto pero mal: que la corrida muestre ese error y no «sin configurar»
  }
}

export class ErrorEmisso extends Error {
  constructor(
    message: string,
    readonly codigo: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function ejecutar<T>(herramienta: string, input: Record<string, unknown>, conConexion = true): Promise<T> {
  const cfg = configuracion();
  if (!cfg) throw new ErrorEmisso("[emisso] Faltan EMISSO_API_KEY o EMISSO_ITAU_CONEXION.", "sin_configurar", 0);
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.clave}`, "Content-Type": "application/json" };
  if (conConexion) headers["X-Connect-Connection"] = cfg.conexion;
  const r = await fetch(`${BASE}/tools/${encodeURIComponent(herramienta)}/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
  });
  const cuerpo = (await r.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!r.ok || !cuerpo?.data) {
    const codigo = cuerpo?.error?.code ?? `http_${r.status}`;
    // El mensaje de Emisso es texto de ayuda (no datos del banco); se recorta por si acaso.
    const detalle = (cuerpo?.error?.message ?? "").slice(0, 200);
    throw new ErrorEmisso(`[emisso] ${herramienta}: ${codigo}${detalle ? ` — ${detalle}` : ""}`, codigo, r.status);
  }
  return cuerpo.data;
}

/** Recorre todas las páginas (Emisso pagina con un cursor opaco). Tope de páginas por si el cursor no termina. */
async function todasLasPaginas<T>(herramienta: string, clave: "movimientos" | "saldos" | "nominas", input: Record<string, unknown>, limite = 500): Promise<T[]> {
  const filas: T[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    const data: Record<string, unknown> = await ejecutar(herramienta, { ...input, limit: limite, ...(cursor ? { cursor } : {}) });
    filas.push(...((data[clave] as T[]) ?? []));
    cursor = (data.cursor as string | null) ?? null;
    if (!cursor) return filas;
  }
  throw new ErrorEmisso(`[emisso] ${herramienta}: más de 20 páginas, se cortó para no gastar la cuota.`, "demasiadas_paginas", 0);
}

export interface EstadoConexion {
  id: string;
  sistema: string;
  empresaRut: string | null;
  estado: string;
  pausa: unknown;
  credencial: string;
  cadencia: string | null;
  cadenciaEstado: string | null;
  atenciones: { codigo?: string; motivo?: string; mensaje?: string; [k: string]: unknown }[];
  trabajos: { id: string; estado: string; actualizadoEn: string; outcomes?: { alcance: string; status: string; motivo: string | null }[]; error: unknown }[];
  datosListos: boolean;
  uso: { llamadas: number; limite: number; seRenueva: string } | null;
}

/** Estado de la conexión de Itaú: atenciones pendientes, pausa, última sincronización. */
export async function estadoConexionItau(): Promise<EstadoConexion | null> {
  const cfg = configuracion();
  if (!cfg) return null;
  // Esta herramienta es de la organización, no de una conexión: va sin X-Connect-Connection.
  const data = await ejecutar<{ conexiones: EstadoConexion[] }>("conexiones.estado.consultar", {}, false);
  return data.conexiones.find((c) => c.id === cfg.conexion) ?? null;
}

/** Movimientos ya guardados en Emisso (no contacta al banco). Del mes indicado, o todos si no se indica. */
export async function movimientosItau(periodo?: string): Promise<MovimientoEmisso[]> {
  return todasLasPaginas<MovimientoEmisso>("itau_corporate.movimientos.consultar", "movimientos", periodo ? { periodo } : {});
}

/**
 * Las fotos de saldo más recientes (no contacta al banco). Una sola página: Emisso las entrega de la más nueva a la
 * más vieja y aquí solo interesa la vigente de cada cuenta; recorrer todo el historial gastaría cuota cada día más.
 */
export async function saldosItau(): Promise<SaldoEmisso[]> {
  const data = await ejecutar<{ saldos: SaldoEmisso[] }>("itau_corporate.saldos.consultar", { limit: 50 });
  return data.saldos ?? [];
}

/**
 * Todas las nóminas de pago masivo guardadas en Emisso, con sus pagos (no contacta al banco). Se piden todas y no solo
 * las del mes: una nómina cambia de estado después («En proceso» → «Pagada») y Emisso la actualiza hasta 90 días. Son
 * pocas (unas 15 al mes) y la herramienta admite 50 por página.
 */
export async function nominasItau(): Promise<NominaEmisso[]> {
  return todasLasPaginas<NominaEmisso>("itau_corporate.nominas.consultar", "nominas", {}, 50);
}
