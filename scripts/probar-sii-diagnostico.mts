/**
 * La traducción de un fallo del SII a un mensaje que se pueda leer.
 *
 * Correr con:  npm run probar-sii-diagnostico
 *
 * Todo lo que decide QUÉ se lee en pantalla vive en lib/sii-diagnostico.ts, puro y sin
 * React, justamente para poder medirlo acá. Lo que se prueba no es que las funciones
 * existan, sino cada regla que se puede romper sin que se note:
 *
 *  - que el mensaje de pantalla NUNCA traiga jerga de Playwright (es la regresión que
 *    esto vino a arreglar: el "Call log" en rojo al lado de los botones);
 *  - que el texto original se conserve ÍNTEGRO, porque es el que sirve para diagnosticar;
 *  - que un fallo que se arregla solo no se anuncie igual que uno que pide una acción —si
 *    todo se ve grave, después nadie cree el que sí lo es;
 *  - que el orden de las reglas aguante: los errores reales traen varias palabras clave a
 *    la vez ("Timeout" aparece hasta cuando el navegador se murió), así que la primera
 *    regla que matchea tiene que ser la correcta.
 *
 * Los mensajes crudos de acá son REALES: salieron de finanzas_sii_ejecuciones.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clasificarFalloSii, mensajeDeFallo } from "../lib/sii-diagnostico";

// El que motivó todo esto (21-09-2026, 12:54 UTC).
const TIMEOUT_SELECTOR_RUT =
  "page.waitForSelector: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('select[name=\\'rut\\']') to be visible\n";

const CLICK_COMPRA =
  "locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator('a, li').filter({ hasText: /^COMPRA$/i }).first()";

const NAVEGADOR_CERRADO =
  'page.goto: Target page, context or browser has been closed\nCall log:\n  - navigating to "https://zeusr.sii.cl/AUT2000/..."';

const SIN_RECURSOS =
  "page.goto: net::ERR_INSUFFICIENT_RESOURCES at https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html";

const MODULO_FALTANTE =
  "Failed to load external module playwright-core-f386a448524c7e9d: Error: Cannot find module '/var/task/node_modules/playwright-core/browsers.json'";

const LOGIN_RECHAZADO = "Login SII fallido: RUT o clave tributaria incorrectos.";

const SIN_CREDENCIALES = "Faltan las credenciales del SII en el entorno.";

// ── Clasificación ────────────────────────────────────────────────────────────

assert.equal(
  clasificarFalloSii(TIMEOUT_SELECTOR_RUT).clase,
  "sii_no_respondio",
  "el timeout del selector es el SII que no contestó a tiempo",
);
assert.equal(
  clasificarFalloSii(CLICK_COMPRA).clase,
  "sii_no_respondio",
  "el timeout del click de pestaña es el mismo problema un paso más adelante",
);
assert.equal(
  clasificarFalloSii(LOGIN_RECHAZADO).clase,
  "login_rechazado",
  "el texto que lanza login() en lib/sii-rcv.ts",
);
assert.equal(clasificarFalloSii(SIN_CREDENCIALES).clase, "credenciales_faltantes");
assert.equal(clasificarFalloSii(SIN_RECURSOS).clase, "navegador_muerto");
assert.equal(clasificarFalloSii(MODULO_FALTANTE).clase, "navegador_muerto");
assert.equal(
  clasificarFalloSii("Algo que nunca vimos antes").clase,
  "desconocido",
  "lo que no se reconoce no se disfraza de nada",
);

// El orden de las reglas: un mismo mensaje trae varias palabras clave a la vez.
assert.equal(
  clasificarFalloSii(NAVEGADOR_CERRADO).clase,
  "navegador_muerto",
  "dice 'navigating' (marcador de sii_no_respondio) pero la causa es el navegador muerto: " +
    "si esta regla quedara después, el motivo real se perdería",
);
assert.equal(
  clasificarFalloSii("Login SII fallido: RUT o clave tributaria incorrectos. Timeout 20000ms").clase,
  "login_rechazado",
  "un login rechazado que además trae 'Timeout' sigue siendo un login rechazado: es el " +
    "único de los dos sobre el que una persona puede hacer algo",
);

// ── Lo que se arregla solo y lo que no ───────────────────────────────────────

assert.equal(
  clasificarFalloSii(TIMEOUT_SELECTOR_RUT).seResuelveSolo,
  true,
  "el SII lento se resuelve en la corrida siguiente: 4 fallas en ~145 corridas y la de " +
    "después siempre funcionó",
);
assert.equal(
  clasificarFalloSii(LOGIN_RECHAZADO).seResuelveSolo,
  false,
  "una clave rechazada NO se arregla esperando, y decir que sí manda a la gente a esperar " +
    "para nada",
);
assert.equal(clasificarFalloSii(SIN_CREDENCIALES).seResuelveSolo, false);
assert.equal(
  clasificarFalloSii("Algo que nunca vimos antes").seResuelveSolo,
  false,
  "prometer que algo se arregla solo cuando no se sabe es peor que no decir nada",
);

// ── La regresión que esto vino a arreglar ────────────────────────────────────

const JERGA = [
  "waitForSelector",
  "Call log",
  "locator",
  "page.goto",
  "Timeout 30000ms",
  "net::",
  "node_modules",
  "/var/task",
];

const TODOS = [
  TIMEOUT_SELECTOR_RUT,
  CLICK_COMPRA,
  NAVEGADOR_CERRADO,
  SIN_RECURSOS,
  MODULO_FALTANTE,
  LOGIN_RECHAZADO,
  SIN_CREDENCIALES,
  "Algo que nunca vimos antes",
];

for (const crudo of TODOS) {
  const fallo = clasificarFalloSii(crudo);
  for (const palabra of JERGA) {
    assert.ok(
      !fallo.mensajeUsuario.includes(palabra),
      `el mensaje de pantalla no puede contener "${palabra}" (crudo: ${crudo.slice(0, 40)}…)`,
    );
  }
  assert.ok(
    fallo.mensajeUsuario.length > 20,
    "un mensaje de pantalla vacío o de dos palabras no explica nada",
  );
  // Lo técnico se conserva ÍNTEGRO: es lo que sirve para diagnosticar después.
  assert.equal(fallo.mensajeTecnico, crudo.trim(), "el texto original no se toca");
}

// Un error sin mensaje no puede dejar la pantalla en blanco.
assert.equal(clasificarFalloSii("").mensajeTecnico, "Error desconocido");
assert.ok(clasificarFalloSii("").mensajeUsuario.length > 20);

// ── El "se alcanzó a guardar" va después del motivo ──────────────────────────

const fallo = clasificarFalloSii(TIMEOUT_SELECTOR_RUT);
const conGuardado = mensajeDeFallo(fallo, "2 de 4 meses");
assert.ok(
  conGuardado.startsWith(fallo.mensajeUsuario),
  "lo primero que se lee tiene que ser si hay que hacer algo; lo que entró es la letra chica",
);
assert.ok(conGuardado.includes("2 de 4 meses"));
assert.equal(
  mensajeDeFallo(fallo),
  fallo.mensajeUsuario,
  "sin nada guardado no se agrega una frase vacía",
);

// ── Que la UI siga mostrando el crudo ────────────────────────────────────────
//
// Es la mitad del trato: se traduce lo que se lee primero, no se esconde el detalle.

const boton = readFileSync(
  new URL("../components/finanzas/BotonSincronizarSii.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  boton.includes("errorTecnico"),
  "el botón tiene que recibir el mensaje crudo: traducir sin conservar el original deja " +
    "a quien diagnostica sin nada",
);
assert.ok(
  boton.includes("Detalle técnico"),
  "y tiene que haber un <details> para abrirlo",
);

const acciones = readFileSync(
  new URL("../app/(protegido)/finanzas/sii/acciones.ts", import.meta.url),
  "utf8",
);
assert.ok(
  acciones.includes("registrarEjecucion(false, 0, mensaje)"),
  "en finanzas_sii_ejecuciones se sigue guardando el CRUDO, no el traducido: esa tabla es " +
    "el registro técnico",
);

console.log(
  "Diagnóstico del SII: clasificación, orden de reglas, qué se arregla solo, y que la " +
    "pantalla no muestre jerga de Playwright sin perder el detalle, todo verificado.",
);
