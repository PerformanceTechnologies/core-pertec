import "server-only";

// Cliente JSON-RPC generico contra Odoo (mismo patron que el script
// exploratorio scripts/probar-odoo.mjs, pero reutilizable desde lib/).
// Por defecto solo lectura: no se expone un execute_kw generico, para que
// sea imposible que un sincronizador futuro escriba por error en la
// instancia de Odoo que el equipo sigue desarrollando. La unica excepcion es
// odooCreate — necesaria para crear clientes (res.partner) desde el
// Cotizador (ver lib/cotizador/clientes-odoo.ts) — expuesta a proposito y de
// forma acotada (un solo metodo, "create"), no un wildcard de escritura.

interface ConfigOdoo {
  url: string;
  db: string;
  login: string;
  apiKey: string;
}

function leerConfig(): ConfigOdoo {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const login = process.env.ODOO_LOGIN;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !login || !apiKey) {
    throw new Error("Faltan ODOO_URL / ODOO_DB / ODOO_LOGIN / ODOO_API_KEY en las variables de entorno.");
  }
  return { url, db, login, apiKey };
}

async function llamarJsonRpc(url: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e6),
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(mensajeDeErrorOdoo(json.error));
  return json.result;
}

interface ErrorRpcOdoo {
  message?: string;
  data?: { name?: string; message?: string; debug?: string };
}

/**
 * Saca el mensaje util de un error RPC de Odoo.
 *
 * Antes se serializaba el objeto entero con JSON.stringify, y ese objeto incluye
 * `data.debug`: el traceback completo de Python. El resultado eran ~40 lineas de
 * rutas /home/odoo/src/... en pantalla, con el mensaje real —lo unico
 * accionable— enterrado al final. Ademas exponia la estructura interna del
 * servidor a cualquiera que viera la UI.
 *
 * `data.message` es el texto que Odoo escribe para leer (el de un ValidationError,
 * por ejemplo). El traceback se conserva, pero en el log del servidor.
 */
function mensajeDeErrorOdoo(error: unknown): string {
  const e = error as ErrorRpcOdoo;

  if (e?.data?.debug) console.error("[odoo] Traceback del servidor:", e.data.debug);

  const mensaje = (e?.data?.message ?? e?.message ?? "").trim();
  if (!mensaje) return "Odoo devolvió un error sin mensaje. Revisá el log del servidor.";

  // Odoo suele mandar el mensaje con saltos de linea y una "Nota:" al final; se
  // deja en una sola linea para que quepa en un aviso de la UI.
  return mensaje.replace(/\s*\n+\s*/g, " ");
}

// Cachea el uid dentro de la misma invocacion de funcion serverless -- cada
// sync ejecuta varias llamadas seguidas y no vale la pena re-autenticar en
// cada una.
let uidCacheado: number | null = null;

async function obtenerUid(config: ConfigOdoo): Promise<number> {
  if (uidCacheado !== null) return uidCacheado;
  const uid = await llamarJsonRpc(config.url, "common", "authenticate", [config.db, config.login, config.apiKey, {}]);
  if (!uid || typeof uid !== "number") {
    throw new Error("Login a Odoo fallido: revisa ODOO_DB/ODOO_LOGIN/ODOO_API_KEY.");
  }
  uidCacheado = uid;
  return uid;
}

// searchRead cubre todo lo que necesitan los sincronizadores de Panel Odoo:
// no se expone un execute_kw generico para no tentar a usarlo para escribir.
export async function odooSearchRead<T = Record<string, unknown>>(
  model: string,
  domain: unknown[],
  fields: string[],
  opciones: { limit?: number; order?: string } = {}
): Promise<T[]> {
  const config = leerConfig();
  const uid = await obtenerUid(config);
  const resultado = await llamarJsonRpc(config.url, "object", "execute_kw", [
    config.db,
    uid,
    config.apiKey,
    model,
    "search_read",
    [domain],
    { fields, limit: opciones.limit, order: opciones.order },
  ]);
  return resultado as T[];
}

// Unica excepcion de escritura del archivo (ver comentario arriba) — crea un
// registro y devuelve su id. Acotado a un solo metodo ("create"), no un
// execute_kw generico.
export async function odooCreate(model: string, valores: Record<string, unknown>): Promise<number> {
  const config = leerConfig();
  const uid = await obtenerUid(config);
  const resultado = await llamarJsonRpc(config.url, "object", "execute_kw", [
    config.db,
    uid,
    config.apiKey,
    model,
    "create",
    [valores],
  ]);
  return resultado as number;
}
