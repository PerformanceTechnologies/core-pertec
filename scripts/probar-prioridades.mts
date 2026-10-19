/**
 * Mi Día: tachar prioridades para que no vuelvan a proponerse.
 *
 * Correr con:  npm run probar-prioridades
 *
 * Dos cosas que se rompen en silencio:
 *
 *  - La normalización que reconoce "la misma prioridad" escrita de otra forma. Si
 *    se vuelve demasiado estricta, lo tachado reaparece al día siguiente y la
 *    función no sirve. Si se vuelve demasiado laxa, tachar una cosa silencia otra
 *    distinta, que es peor: se pierde trabajo sin que nadie se entere.
 *
 *  - Que el guard del lado del servidor sea el que pone el usuario, y no el
 *    cliente: si el id viajara como parámetro, cualquiera podría tachar
 *    prioridades ajenas con un fetch a mano.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarPrioridad, sinLasDescartadas, bloqueDescartadas } from "../lib/resumen-diario/prioridades";

function leer(ruta: string): string {
  return readFileSync(new URL(ruta, import.meta.url), "utf8");
}

// ── La misma prioridad, escrita distinto ────────────────────────────────────

const MISMA = [
  "Gestionar el cobro de las facturas reclamadas más antiguas (Caucho Val y Salfa, sobre 130 días)",
  "gestionar el cobro de las facturas reclamadas mas antiguas (caucho val y salfa, sobre 145 dias)",
];
assert.equal(
  normalizarPrioridad(MISMA[0]),
  normalizarPrioridad(MISMA[1]),
  "la misma prioridad con otra antigüedad y sin tildes tiene que dar la misma clave: si no, " +
    "reaparece mañana porque el contador de días cambió",
);

assert.equal(
  normalizarPrioridad("Emitir la oferta técnica para AES Andes"),
  normalizarPrioridad("la oferta técnica para AES Andes, emitirla"),
  "el orden de las palabras no puede cambiar la clave: el modelo reescribe la frase cada día",
);

// ── Pero NO dos prioridades distintas ───────────────────────────────────────

assert.notEqual(
  normalizarPrioridad("Emitir la oferta técnica para AES Andes"),
  normalizarPrioridad("Emitir la oferta técnica para Codelco"),
  "dos ofertas de clientes distintos NO son la misma prioridad. Si cayeran en la misma clave, " +
    "tachar una silenciaría la otra y se perdería trabajo sin aviso",
);
assert.notEqual(
  normalizarPrioridad("Revisar las facturas reclamadas"),
  normalizarPrioridad("Revisar las cotizaciones en borrador"),
  "los verbos de apertura se descartan justamente para que lo que distinga sea el sustantivo",
);
assert.notEqual(
  normalizarPrioridad("Destrabar la cotización CT-6"),
  normalizarPrioridad("Destrabar la cotización CT-7"),
  "un identificador distinto es una prioridad distinta",
);

// ── Casos borde ─────────────────────────────────────────────────────────────

assert.equal(normalizarPrioridad(""), "", "vacío da clave vacía");
assert.equal(
  normalizarPrioridad("de la y el con por"),
  "",
  "solo palabras vacías da clave vacía — y descartarPrioridad la ignora, porque una clave " +
    "vacía igualaría cualquier otra cosa igual de vacía",
);
assert.ok(
  !normalizarPrioridad("Cobrar 137 facturas").includes("137"),
  "los números se van: la misma prioridad vuelve mañana con otra cuenta",
);

// ── El filtro ───────────────────────────────────────────────────────────────

const descartadas = [
  { clave: normalizarPrioridad("Emitir la oferta técnica para AES Andes"), texto: "Emitir la oferta técnica para AES Andes" },
];
assert.deepEqual(
  sinLasDescartadas(
    [
      "emitir la oferta tecnica para AES Andes",   // misma idea, sin tildes y en minúscula
      "Destrabar las cotizaciones CT-6 y CT-7",
    ],
    descartadas,
  ),
  ["Destrabar las cotizaciones CT-6 y CT-7"],
  "la tachada se cae pese a tildes y mayúsculas distintas",
);

// Lo que la clave NO agarra, y está bien que no lo agarre.
//
// Una palabra de contenido de más ("pendiente") cambia la clave, así que el
// filtro exacto deja pasar la prioridad. Para ESO se le pasan al modelo los
// textos tachados con la instrucción de no repetir la idea (ver bloqueDescartadas
// y el punto 11 de INSTRUCCIONES en ./generar.ts): la clave es el filtro barato,
// el modelo es el que entiende.
//
// Hacer la clave más laxa para atrapar esto sería el error: ahí empezaría a
// confundir prioridades distintas, y ese daño —trabajo silenciado sin aviso— es
// mucho peor que una reaparición.
assert.deepEqual(
  sinLasDescartadas(["Emitir la oferta técnica pendiente para AES Andes"], descartadas),
  ["Emitir la oferta técnica pendiente para AES Andes"],
  "una palabra de contenido de más escapa al filtro exacto: es el límite conocido, y lo " +
    "cubre la instrucción al modelo, no una clave más permisiva",
);
assert.deepEqual(
  sinLasDescartadas(["Algo nuevo"], []),
  ["Algo nuevo"],
  "sin nada tachado no se filtra nada",
);

// Al modelo se le pasa el TEXTO, no la clave.
const bloque = bloqueDescartadas(descartadas);
assert.ok(bloque.includes("AES Andes"), "el bloque lleva el texto original");
assert.ok(
  !bloque.includes(descartadas[0].clave),
  "y NO la clave: es un amasijo de palabras ordenadas alfabéticamente que no significa nada " +
    "para el modelo",
);
assert.equal(bloqueDescartadas([]), "(ninguna)", "sin tachadas se dice explícitamente");

// ── Que el guard esté del lado del servidor ─────────────────────────────────

const accion = leer("../app/(protegido)/mi-dia/acciones.ts");
assert.ok(
  /const usuario = await exigirAccesoApp\(SLUG_APP\)/.test(accion),
  "la acción saca el usuario del guard",
);
assert.ok(
  !/usuarioId|usuario_id/.test(accion.slice(accion.indexOf("export async function"))),
  "el id NUNCA llega del cliente: si viajara como parámetro, cualquiera podría tachar " +
    "prioridades ajenas con un fetch a mano",
);
assert.ok(/limpio\.length > 600/.test(accion), "hay tope de largo para lo que llega del cliente");

// ── La tabla que falta se dice, no se disfraza de error pasajero ────────────
//
// La migración se corre a mano, así que su ausencia es un estado esperable. Sin
// distinguirla, la pantalla decía "no se pudo guardar, probá de nuevo" — y
// reintentar no iba a funcionar nunca. Pasó de verdad al estrenar la función.

const prioridades = leer("../lib/resumen-diario/prioridades.ts");
assert.ok(
  /export class TablaSinCrear extends Error/.test(prioridades),
  "la falta de la tabla tiene su propio tipo de error, no un string suelto",
);
assert.ok(
  /error\.code === "42P01"/.test(prioridades),
  "se reconoce por el código de Postgres (42P01 = la relación no existe) y no solo por el texto",
);
assert.ok(
  /0001_prioridades_descartadas\.sql/.test(prioridades),
  "el mensaje nombra el archivo que hay que correr: mandar a 'revisar la base' no ayuda a nadie",
);
assert.ok(
  /error instanceof TablaSinCrear/.test(accion),
  "la acción deja pasar ese mensaje tal cual en vez de taparlo con el genérico",
);

console.log(
  "Prioridades de Mi Día: la misma reconocida pese a la reescritura, dos distintas sin " +
    "confundirse, el filtro, y el guard del lado del servidor. Todo verificado.",
);
