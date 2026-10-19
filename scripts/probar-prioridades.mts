/**
 * Mi Día: tachar prioridades, y que nadie reciba alertas de módulos que no tiene.
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
 *  - El filtro de permisos de los pendientes. Un módulo que se olvida de
 *    preguntar no falla: manda datos de ese módulo a alguien que no lo tiene.
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

// ── Permisos: cada fuente pregunta por SU módulo ────────────────────────────
//
// Esta es la parte que puede filtrar datos. Antes solo las facturas preguntaban,
// y por eso alguien sin Panel Odoo igual recibía tareas de Odoo — que además se
// cruzan por NOMBRE, así que ni siquiera eran datos suyos.

const pendientes = leer("../lib/resumen-diario/pendientes-core.ts");
for (const slug of ["rendir-gastos", "ofertas", "cotizador", "panel-odoo", "finanzas"]) {
  assert.ok(
    new RegExp(`puedeVerApp\\(\\s*\\w+,\\s*"${slug}"\\s*\\)`).test(pendientes),
    `los pendientes tienen que preguntar por la app "${slug}" antes de nombrar nada suyo`,
  );
}
assert.ok(
  /usuarioPuedeVerSubpanelFinanzas\(usuarioId, "sii"\)/.test(pendientes),
  "las facturas además exigen el subpanel del SII: la app de Finanzas sola no alcanza",
);
assert.ok(
  /const conAcceso = await obtenerUsuarioActivo\(/.test(pendientes),
  "los permisos se leen frescos acá y no se reciben del llamador: a quien le quitaron un " +
    "módulo ayer, hoy ya no se le nombra",
);

// La regla de acceso vive en UN solo lugar.
const autorizacion = leer("../lib/autorizacion.ts");
assert.ok(
  /export async function puedeVerApp\(/.test(autorizacion),
  "puedeVerApp vive en lib/autorizacion.ts, junto a las otras dos formas de la misma regla",
);
const herramientas = leer("../lib/consulta-ia/herramientas.ts");
assert.ok(
  !/async function puedeVer\(usuario/.test(herramientas),
  "las herramientas de consulta NO pueden tener su propia copia: una copia que se olvida de " +
    "mirar el rol deja pasar datos y no falla ruidosamente",
);

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

console.log(
  "Prioridades de Mi Día: la misma reconocida pese a la reescritura, dos distintas sin " +
    "confundirse, el filtro, y que cada pendiente pregunte por su módulo. Todo verificado.",
);
