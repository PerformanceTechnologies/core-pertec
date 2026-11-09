// Pruebas de la campana de notificaciones (el buzón): que lo del Muro no aparezca. No usa la base
// real: se simula la API de Supabase (PostgREST) con un fetch falso que aplica de verdad los filtros
// `or` que arma lib/buzon.ts, así se prueba la consulta de verdad y no solo su texto.
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://base-falsa.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "llave-falsa";

type Fila = {
  id: string;
  modulo: string | null;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  severidad: string;
  creado_en: string;
  clave: string | null;
  destinatario: string | null;
};

const notificaciones: Fila[] = [];
const vistas: { notificacion_id: string; usuario_id: string }[] = [];
const peticiones: URL[] = [];

/** Parte «a,b.in.(c,d),e» en sus condiciones, sin cortar las comas de adentro de paréntesis o comillas. */
function condiciones(texto: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let nivel = 0;
  let comillas = false;
  for (const c of texto) {
    if (c === '"') comillas = !comillas;
    else if (!comillas && c === "(") nivel++;
    else if (!comillas && c === ")") nivel--;
    if (c === "," && nivel === 0 && !comillas) {
      partes.push(actual);
      actual = "";
    } else actual += c;
  }
  if (actual) partes.push(actual);
  return partes;
}

/** Evalúa una condición de PostgREST: col.is.null, col.eq.x, col.in.(a,b), col.not.like.pre* */
function cumple(fila: Fila, condicion: string): boolean {
  const [, columna, resto] = /^([a-z_]+)\.(.*)$/.exec(condicion) ?? [];
  assert.ok(columna, `condición que la simulación no entiende: ${condicion}`);
  const valor = (fila as Record<string, unknown>)[columna] as string | null;
  const sinComillas = (s: string) => s.replace(/^"|"$/g, "");
  if (resto === "is.null") return valor === null;
  if (resto.startsWith("eq.")) return valor === sinComillas(resto.slice(3));
  if (resto.startsWith("in.(")) return valor !== null && condiciones(resto.slice(4, -1)).map(sinComillas).includes(valor);
  const noComo = /^not\.like\.(.*)\*$/.exec(resto);
  if (noComo) return valor !== null && !valor.startsWith(noComo[1]);
  assert.fail(`operador que la simulación no entiende: ${condicion}`);
}

const cabeceras = { "content-type": "application/json" };

globalThis.fetch = (async (entrada: RequestInfo | URL) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  peticiones.push(url);
  const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200, headers: cabeceras });

  if (url.pathname.endsWith("/aplicaciones")) {
    return json([{ id: "app-tareas", slug: "tareas", nombre: "Tareas", orden: 0 }, { id: "app-fin", slug: "finanzas", nombre: "Finanzas", orden: 1 }]);
  }
  if (url.pathname.endsWith("/notificaciones_vistas")) {
    const ids = condiciones(/^in\.\((.*)\)$/.exec(url.searchParams.get("notificacion_id") ?? "")?.[1] ?? "");
    return json(vistas.filter((v) => ids.includes(v.notificacion_id)));
  }
  if (url.pathname.endsWith("/notificaciones")) {
    // Cada `or=(…)` es un filtro aparte y todos tienen que cumplirse a la vez.
    const filtros = url.searchParams.getAll("or").map((o) => condiciones(o.replace(/^\(|\)$/g, "")));
    const soloSinModulo = url.searchParams.get("modulo") === "is.null";
    const filas = notificaciones
      .filter((f) => filtros.every((alguna) => alguna.some((c) => cumple(f, c))))
      .filter((f) => !soloSinModulo || f.modulo === null)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
      .slice(0, Number(url.searchParams.get("limit") ?? 1000));
    return json(filas);
  }
  assert.fail(`petición inesperada: ${url.pathname}`);
}) as typeof fetch;

const { listarNotificaciones } = await import("../lib/buzon");
type Usuario = Parameters<typeof listarNotificaciones>[0];

const ana = { id: "u-ana", correo: "Ana@pertec.cl", rol: "usuario", aplicacionIds: ["app-tareas"] } as unknown as Usuario;
const admin = { id: "u-admin", correo: "admin@pertec.cl", rol: "admin", aplicacionIds: [] } as unknown as Usuario;

let reloj = 0;
const nueva = (id: string, datos: Partial<Fila>): Fila => ({
  id,
  modulo: null,
  tipo: "info",
  titulo: id,
  cuerpo: null,
  enlace: null,
  severidad: "info",
  creado_en: new Date(Date.UTC(2026, 10, 1, 12, 0, ++reloj)).toISOString(),
  clave: `clave:${id}`,
  destinatario: null,
  ...datos,
});

const reiniciar = () => {
  notificaciones.length = 0;
  vistas.length = 0;
  peticiones.length = 0;
  reloj = 0;
};
const prueba = async (nombre: string, f: () => void | Promise<void>) => {
  reiniciar();
  await f();
  console.log(`  ok  ${nombre}`);
};
const ids = (lista: { id: string }[]) => lista.map((n) => n.id).sort();

console.log("Buzón: el Muro no aparece en la campana");

await prueba("las menciones y respuestas del Muro que ya estaban guardadas no se muestran", async () => {
  notificaciones.push(
    nueva("mencion-vieja", { tipo: "mencion", enlace: "/muro#m-1", clave: "muro:m-1:ana@pertec.cl", destinatario: "ana@pertec.cl" }),
    nueva("respuesta-vieja", { tipo: "respuesta", enlace: "/muro#m-2", clave: "muro:m-3:respuesta:ana@pertec.cl", destinatario: "ana@pertec.cl" }),
    nueva("tarea", { modulo: "tareas", tipo: "asignada", clave: "tarea:t-1:asignada:ana@pertec.cl:x", destinatario: "ana@pertec.cl" }),
  );
  assert.deepEqual(ids(await listarNotificaciones(ana, 30, true)), ["tarea"]);
  assert.deepEqual(ids(await listarNotificaciones(ana, 30, false)), ["tarea"]);
});

await prueba("se descartan por el origen (la clave), no por el tipo: un aviso futuro del Muro también queda fuera", async () => {
  notificaciones.push(nueva("reaccion", { tipo: "reaccion", clave: "muro:m-9:reaccion:ana@pertec.cl", destinatario: "ana@pertec.cl" }));
  assert.deepEqual(await listarNotificaciones(ana, 30, true), []);
});

await prueba("un aviso de otro módulo con tipo «mencion» sí se ve", async () => {
  notificaciones.push(nueva("mencion-de-tareas", { modulo: "tareas", tipo: "mencion", clave: "tarea:t-2:mencion:ana@pertec.cl:x", destinatario: "ana@pertec.cl" }));
  assert.deepEqual(ids(await listarNotificaciones(ana, 30, true)), ["mencion-de-tareas"]);
});

await prueba("una notificación sin clave no es del Muro y se sigue viendo", async () => {
  notificaciones.push(nueva("sin-clave", { clave: null }));
  assert.deepEqual(ids(await listarNotificaciones(ana, 30, true)), ["sin-clave"]);
});

await prueba("lo que ya se veía sigue igual: globales, de sus módulos y las personales, y no las de otro", async () => {
  notificaciones.push(
    nueva("global", {}),
    nueva("de-tareas", { modulo: "tareas" }),
    nueva("de-finanzas", { modulo: "finanzas", tipo: "factura_reclamada" }), // Ana no tiene Finanzas
    nueva("personal-de-ana", { modulo: "tareas", destinatario: "ana@pertec.cl" }),
    nueva("personal-de-otro", { modulo: "tareas", destinatario: "otro@pertec.cl" }),
  );
  assert.deepEqual(ids(await listarNotificaciones(ana, 30, true)), ["de-tareas", "global", "personal-de-ana"]);
  // El admin ve todos los módulos, pero no las personales de Ana ni de otro.
  assert.deepEqual(ids(await listarNotificaciones(admin, 30, true)), ["de-finanzas", "de-tareas", "global"]);
});

await prueba("las que ya abrió siguen sin aparecer en las pendientes", async () => {
  notificaciones.push(nueva("abierta", {}), nueva("pendiente", {}), nueva("mencion-vieja", { tipo: "mencion", clave: "muro:m-1:ana@pertec.cl" }));
  vistas.push({ notificacion_id: "abierta", usuario_id: ana.id });
  assert.deepEqual(ids(await listarNotificaciones(ana, 30, true)), ["pendiente"]);
});

await prueba("las del Muro no se cuelan entre las 30 de la campana aunque sean muchas y más nuevas", async () => {
  for (let i = 0; i < 200; i++) notificaciones.push(nueva(`muro-${i}`, { tipo: "mencion", clave: `muro:m-${i}:ana@pertec.cl`, destinatario: "ana@pertec.cl" }));
  notificaciones.push(nueva("la-unica", { modulo: "tareas" }));
  // Las del Muro son más nuevas que «la-unica» y llenarían el tope de la consulta si se filtraran después.
  notificaciones.find((n) => n.id === "la-unica")!.creado_en = "2026-01-01T00:00:00.000Z";
  assert.deepEqual(ids(await listarNotificaciones(ana, 30, true)), ["la-unica"]);
});

console.log("Buzón: todo bien");
