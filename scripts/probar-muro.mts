// Pruebas del Muro: cómo se leen y se mezclan las reacciones. No usa la base real: se simula la
// API de Supabase (PostgREST) con un fetch falso, así se prueba el código de verdad (tramos de ids,
// paginado de filas, `null` si falla).
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://base-falsa.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "llave-falsa";

type Fila = { mensaje_id: string; correo: string; emoji: string };

const base: Fila[] = [];
const peticiones: URL[] = [];
let fallarEnLa: number | null = null; // número de petición (desde 1) que responde 500

const TOPE_FILAS_SUPABASE = 1000;

globalThis.fetch = (async (entrada: RequestInfo | URL) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  peticiones.push(url);
  const cabeceras = { "content-type": "application/json" };
  if (fallarEnLa === peticiones.length) return new Response(JSON.stringify({ message: "falla simulada" }), { status: 500, headers: cabeceras });

  const lista = /^in\.\((.*)\)$/.exec(url.searchParams.get("mensaje_id") ?? "")?.[1] ?? "";
  const ids = new Set(lista.split(",").map((s) => s.replace(/^"|"$/g, "")));
  const filas = base
    .filter((f) => ids.has(f.mensaje_id))
    .sort((a, b) => a.mensaje_id.localeCompare(b.mensaje_id) || a.correo.localeCompare(b.correo) || a.emoji.localeCompare(b.emoji));
  const desde = Number(url.searchParams.get("offset") ?? 0);
  const limite = Math.min(Number(url.searchParams.get("limit") ?? TOPE_FILAS_SUPABASE), TOPE_FILAS_SUPABASE);
  const pagina = filas.slice(desde, desde + limite);
  const rango = pagina.length ? `${desde}-${desde + pagina.length - 1}/${filas.length}` : `*/${filas.length}`;
  return new Response(JSON.stringify(pagina), { status: 200, headers: { ...cabeceras, "content-range": rango } });
}) as typeof fetch;

const { combinarReacciones } = await import("../lib/muro-modelo");
const { reaccionesDe } = await import("../lib/muro");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reiniciar = () => {
  base.length = 0;
  peticiones.length = 0;
  fallarEnLa = null;
};
async function conErroresMudos<T>(f: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = original;
  }
}
const prueba = async (nombre: string, f: () => void | Promise<void>) => {
  reiniciar();
  await f();
  console.log(`  ok  ${nombre}`);
};

console.log("Muro: reacciones");

await prueba("sin ids no consulta nada y devuelve {}", async () => {
  assert.deepEqual(await reaccionesDe([]), {});
  assert.equal(peticiones.length, 0);
});

await prueba("agrupa por mensaje y emoji, e ignora emojis que no existen", async () => {
  base.push(
    { mensaje_id: uuid(1), correo: "a@pertec.cl", emoji: "👍" },
    { mensaje_id: uuid(1), correo: "b@pertec.cl", emoji: "👍" },
    { mensaje_id: uuid(1), correo: "a@pertec.cl", emoji: "❤️" },
    { mensaje_id: uuid(2), correo: "a@pertec.cl", emoji: "🔥" }, // no es una de las cinco
  );
  const r = await reaccionesDe([uuid(1), uuid(2)]);
  assert.deepEqual(r, { [uuid(1)]: { "👍": ["a@pertec.cl", "b@pertec.cl"], "❤️": ["a@pertec.cl"] } });
});

await prueba("ids repetidos se consultan una sola vez", async () => {
  base.push({ mensaje_id: uuid(1), correo: "a@pertec.cl", emoji: "🎉" });
  const r = await reaccionesDe([uuid(1), uuid(1), uuid(1)]);
  assert.deepEqual(r, { [uuid(1)]: { "🎉": ["a@pertec.cl"] } });
  assert.equal(peticiones.length, 1);
  assert.equal(peticiones[0].searchParams.get("mensaje_id"), `in.(${uuid(1)})`);
});

await prueba("más de 400 mensajes: no se pierde ninguno (antes se cortaba en 400)", async () => {
  const ids = Array.from({ length: 450 }, (_, i) => uuid(i + 1));
  base.push({ mensaje_id: ids[0], correo: "a@pertec.cl", emoji: "👍" }, { mensaje_id: ids[449], correo: "b@pertec.cl", emoji: "😮" });
  const r = await reaccionesDe(ids);
  assert.deepEqual(r?.[ids[449]], { "😮": ["b@pertec.cl"] });
  assert.deepEqual(r?.[ids[0]], { "👍": ["a@pertec.cl"] });
  assert.equal(peticiones.length, 5); // 100 + 100 + 100 + 100 + 50
});

await prueba("la lista de ids viaja en tramos de 100 y la URL se mantiene corta", async () => {
  await reaccionesDe(Array.from({ length: 250 }, (_, i) => uuid(i + 1)));
  assert.equal(peticiones.length, 3);
  const largoMaximo = Math.max(...peticiones.map((u) => u.href.length));
  assert.ok(largoMaximo < 6000, `la URL más larga mide ${largoMaximo}`);
});

await prueba("si hay más filas que el tope por respuesta, las pide por tramos y no pierde ninguna", async () => {
  const correos = ["a", "b", "c", "d", "e"].map((c) => `${c}@pertec.cl`);
  const emojis = ["👍", "❤️", "😂", "🎉", "😮"];
  const ids = Array.from({ length: 100 }, (_, i) => uuid(i + 1));
  for (const id of ids) for (const c of correos) for (const e of emojis) base.push({ mensaje_id: id, correo: c, emoji: e });
  assert.equal(base.length, 2500);
  const r = await reaccionesDe(ids);
  const total = Object.values(r ?? {}).flatMap((m) => Object.values(m)).reduce((n, quienes) => n + (quienes?.length ?? 0), 0);
  assert.equal(total, 2500);
  assert.ok(peticiones.length >= 3, `se esperaban varias peticiones y hubo ${peticiones.length}`);
  for (const u of peticiones) assert.ok(Number(u.searchParams.get("limit")) <= TOPE_FILAS_SUPABASE);
});

await prueba("si falla la consulta devuelve null (no {}), para no vaciar lo que hay en pantalla", async () => {
  fallarEnLa = 1;
  assert.equal(await conErroresMudos(() => reaccionesDe([uuid(1)])), null);
});

await prueba("si falla un solo tramo, todo es null (nada a medias)", async () => {
  base.push({ mensaje_id: uuid(1), correo: "a@pertec.cl", emoji: "👍" });
  fallarEnLa = 2;
  const ids = Array.from({ length: 250 }, (_, i) => uuid(i + 1));
  assert.equal(await conErroresMudos(() => reaccionesDe(ids)), null);
});

console.log("Muro: combinar reacciones con lo que hay en pantalla");

await prueba("de lo consultado manda el servidor; lo que no vino ya no tiene reacciones", () => {
  const actual = { a: { "👍": ["x@pertec.cl"] }, b: { "❤️": ["y@pertec.cl"] } };
  const r = combinarReacciones(actual, ["a", "b"], { b: { "😮": ["z@pertec.cl"] } });
  assert.deepEqual(r, { b: { "😮": ["z@pertec.cl"] } });
});

await prueba("lo que no se consultó queda como estaba", () => {
  const actual = { a: { "👍": ["x@pertec.cl"] }, fuera: { "🎉": ["y@pertec.cl"] } };
  const r = combinarReacciones(actual, ["a"], {});
  assert.deepEqual(r, { fuera: { "🎉": ["y@pertec.cl"] } });
});

await prueba("suma las de mensajes que llegaron y no estaban en pantalla", () => {
  const r = combinarReacciones({ a: { "👍": ["x@pertec.cl"] } }, ["a"], { a: { "👍": ["x@pertec.cl"] }, nuevo: { "😂": ["w@pertec.cl"] } });
  assert.deepEqual(r, { a: { "👍": ["x@pertec.cl"] }, nuevo: { "😂": ["w@pertec.cl"] } });
});

await prueba("no modifica el objeto de entrada", () => {
  const actual = { a: { "👍": ["x@pertec.cl"] } };
  combinarReacciones(actual, ["a"], {});
  assert.deepEqual(actual, { a: { "👍": ["x@pertec.cl"] } });
});

console.log("\nMuro: todo en orden");
