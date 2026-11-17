import "server-only";
import type { BloqueContable, ItemContable } from "./remuneraciones-modelo";

// -----------------------------------------------------------------------------
//  BUK (remuneraciones): cliente de SOLO LECTURA de su API.
//
//  · La clave vive en BUK_API_TOKEN y la dirección en BUK_URL, en el servidor (Vercel). Este repositorio es público:
//    nada de esto se escribe en el código ni llega al navegador.
//  · Solo GET. Solo https y solo dominios *.buk.cl: una variable mal puesta no puede mandar la clave a otro sitio,
//    y tampoco se sigue ningún enlace de paginación que apunte a otro host.
//  · La clave que usamos tiene permiso de Contabilidad (la centralización del libro) pero NO el de ver información
//    sensible: el detalle de liquidaciones por persona (payroll_detail) responde 401, y no se necesita.
//  · Los errores no incluyen el cuerpo de la respuesta, que puede traer datos de personas.
// -----------------------------------------------------------------------------

export interface ProcesoBuk {
  id: number;
  name: string;
  process_type: string;
  payment_date: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface EmpresaBuk {
  id: number;
  name: string;
  rut: string;
}

interface Config {
  base: URL;
  token: string;
}

/** null si falta la clave o la dirección: la pantalla lo explica en vez de fallar. */
function configuracion(): Config | null {
  const url = process.env.BUK_URL?.trim();
  const token = process.env.BUK_API_TOKEN?.trim();
  if (!url || !token) return null;
  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    throw new Error("[buk] BUK_URL no es una dirección válida.");
  }
  if (base.protocol !== "https:" || !base.hostname.endsWith(".buk.cl")) throw new Error("[buk] BUK_URL debe ser una dirección https de buk.cl.");
  return { base, token };
}

export function bukConfigurado(): boolean {
  try {
    return configuracion() !== null;
  } catch {
    return true; // está puesto pero mal: que la pantalla muestre ese error y no «sin configurar»
  }
}

// Caché en memoria de esta instancia: la API tarda ~1 s por consulta y el libro de un mes viejo casi no cambia.
// Los meses recientes (el abierto y el que acaba de cerrarse) se refrescan seguido. «Actualizar» en la pantalla la vacía.
const TTL_RECIENTE = 10 * 60_000;
const TTL_ANTIGUO = 6 * 60 * 60_000;
const cache = new Map<string, { vence: number; leidoEn: number; valor: unknown }>();

export function limpiarCacheBuk(): void {
  cache.clear();
}

async function pedir<T>(url: URL, cfg: Config): Promise<T> {
  if (url.origin !== cfg.base.origin) throw new Error("[buk] Se rechazó una consulta a otro sitio distinto de BUK.");
  const r = await fetch(url, { headers: { auth_token: cfg.token, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(25_000) });
  if (r.status === 401 || r.status === 403) throw new Error(`[buk] BUK rechazó la consulta (${r.status}). Revisa que la clave siga vigente y tenga permiso de lectura de Contabilidad.`);
  if (!r.ok) throw new Error(`[buk] BUK respondió con el error ${r.status}.`);
  return (await r.json()) as T;
}

function construir(cfg: Config, ruta: string, params: Record<string, string | number>): URL {
  const url = new URL(`/api/v1/chile/${ruta}`, cfg.base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return url;
}

/** Todas las filas de un listado paginado de BUK (`data` + `pagination.next`). */
async function todas<T>(ruta: string, params: Record<string, string | number>, cfg: Config): Promise<T[]> {
  const salida: T[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    // Se arma cada página con nuestros mismos parámetros, sin seguir el enlace `next` que entrega BUK.
    const r = await pedir<{ data?: T[]; pagination?: { next?: string | null } }>(construir(cfg, ruta, { ...params, page_size: 100, ...(pagina > 1 ? { page: pagina } : {}) }), cfg);
    salida.push(...(r.data ?? []));
    if (!r.pagination?.next) break;
  }
  return salida;
}

async function conCache<T>(clave: string, ttl: number, leer: () => Promise<T>): Promise<{ valor: T; leidoEn: number }> {
  const hit = cache.get(clave);
  if (hit && hit.vence > Date.now()) return { valor: hit.valor as T, leidoEn: hit.leidoEn };
  const valor = await leer();
  const leidoEn = Date.now();
  cache.set(clave, { vence: leidoEn + ttl, leidoEn, valor });
  return { valor, leidoEn };
}

const rutLimpio = (r: string | null | undefined) => (r ?? "").replace(/[.\-\s]/g, "").toUpperCase();

/**
 * La empresa de BUK que corresponde a la del Core. La centralización se pide SIEMPRE con su company_id: si algún día
 * BUK suma otra empresa, sus sueldos no se mezclan con los de esta.
 */
export async function empresaBuk(rutEsperado: string | null): Promise<EmpresaBuk> {
  const cfg = configuracion();
  if (!cfg) throw new Error("[buk] Falta configurar BUK_URL y BUK_API_TOKEN.");
  const { valor: empresas } = await conCache("empresas", TTL_ANTIGUO, async () => {
    const filas = await todas<{ id: number; name: string; rut: string }>("companies", {}, cfg);
    return filas.map((e) => ({ id: Number(e.id), name: String(e.name), rut: String(e.rut ?? "") }));
  });
  if (empresas.length === 0) throw new Error("[buk] BUK no devolvió ninguna empresa.");
  const esperado = rutLimpio(rutEsperado);
  if (esperado) {
    const e = empresas.find((x) => rutLimpio(x.rut) === esperado);
    if (!e) throw new Error("[buk] Ninguna empresa de BUK tiene el mismo RUT que la empresa del Core: no se muestra nada para no mezclar sueldos.");
    return e;
  }
  if (empresas.length === 1) return empresas[0];
  throw new Error("[buk] BUK tiene varias empresas y la del Core no tiene RUT cargado para elegir cuál mostrar.");
}

/** Los procesos de remuneración de un mes (nombre, tipo, fecha de pago, abierto o cerrado). `periodo` = «2026-10». */
export async function procesosDeMes(periodo: string, reciente: boolean): Promise<ProcesoBuk[]> {
  const cfg = configuracion();
  if (!cfg) throw new Error("[buk] Falta configurar BUK_URL y BUK_API_TOKEN.");
  const { valor } = await conCache(`procesos:${periodo}`, reciente ? TTL_RECIENTE : TTL_ANTIGUO, async () => {
    const filas = await todas<ProcesoBuk>("process", { date: `${periodo}-01` }, cfg);
    return filas.map((p): ProcesoBuk => ({
      id: Number(p.id), name: String(p.name ?? ""), process_type: String(p.process_type ?? ""), payment_date: p.payment_date ?? null,
      status: String(p.status ?? ""), start_date: p.start_date ?? null, end_date: p.end_date ?? null,
    }));
  });
  return valor;
}

/**
 * La centralización contable de un mes: las líneas del libro de remuneraciones. De cada línea se guarda solo lo que
 * el resumen usa (concepto, monto, cuenta, centro de costo y el RUT, que se usa para CONTAR personas y nunca se muestra).
 */
export async function libroDeMes(periodo: string, empresaId: number, reciente: boolean): Promise<{ bloques: BloqueContable[]; leidoEn: number }> {
  const cfg = configuracion();
  if (!cfg) throw new Error("[buk] Falta configurar BUK_URL y BUK_API_TOKEN.");
  const [anio, mes] = periodo.split("-").map(Number);
  const { valor, leidoEn } = await conCache(`libro:${empresaId}:${periodo}`, reciente ? TTL_RECIENTE : TTL_ANTIGUO, async () => {
    const filas = await todas<{ id: number; items?: Partial<ItemContable>[] }>("accounting", { month: mes, year: anio, company_id: empresaId }, cfg);
    return filas.map((b): BloqueContable => ({
      id: Number(b.id),
      items: (b.items ?? []).map((i): ItemContable => ({
        description: String(i.description ?? ""), amount: Number(i.amount) || 0, entry_type: String(i.entry_type ?? ""),
        account: i.account ?? null, cost_center: i.cost_center ?? null, employee_rut: i.employee_rut ?? null,
      })),
    }));
  });
  return { bloques: valor, leidoEn };
}
