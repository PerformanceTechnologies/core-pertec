/**
 * Reglas de nombre de una cotización, con los casos reales que las motivaron.
 *
 * Correr con:  npm run probar-nombre
 */

import assert from "node:assert/strict";
import {
  LARGO_MAXIMO_NOMBRE,
  nombreDeCotizacionImportada,
  normalizarNombreCotizacion,
  normalizarNumeroOferta,
} from "../lib/cotizador/nombre-cotizacion";

// ── Los dos casos que ya están en la base ───────────────────────────────────
const os10 = nombreDeCotizacionImportada(
  "OS 010-2026",
  "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7",
);
assert.equal(os10, "OS 010-2026 · TRASLADO DE ROLLOS NUEVOS DE CORREA A CT-6 Y CT-7");
assert.ok(os10.length <= LARGO_MAXIMO_NOMBRE, `${os10.length} caracteres, tope ${LARGO_MAXIMO_NOMBRE}`);

const os9 = nombreDeCotizacionImportada(
  "OS 009 – 2026",
  "Servicio de reemplazo de correas transportadoras CT-6 y CT-7",
);
assert.equal(os9, "OS 009-2026 · REEMPLAZO DE CORREAS TRANSPORTADORAS CT-6 Y CT-7");

// ── El guion largo del PDF se normaliza ─────────────────────────────────────
assert.equal(normalizarNumeroOferta("OS 010 – 2026"), "OS 010-2026");
assert.equal(normalizarNumeroOferta("os 011—2026"), "OS 011-2026");

// ── El relleno del principio se va, pero solo del principio ─────────────────
assert.equal(normalizarNombreCotizacion("Oferta técnica y económica de mantención"), "DE MANTENCIÓN");
assert.equal(
  normalizarNombreCotizacion("Mantención y servicio de correas"),
  "MANTENCIÓN Y SERVICIO DE CORREAS",
  "el prefijo solo se saca del principio",
);

// ── Acotado en palabra entera, nunca al medio ───────────────────────────────
const largo = normalizarNombreCotizacion(
  "Reemplazo integral de correas transportadoras del sector chancado primario y secundario de la planta",
);
assert.ok(largo.length <= LARGO_MAXIMO_NOMBRE, `quedó en ${largo.length}`);
assert.ok(largo.endsWith("…"), "un nombre recortado tiene que avisar que se recortó");
assert.ok(!/\s…$/.test(largo), "no puede quedar un espacio antes de los puntos suspensivos");
assert.ok(largo.split(" ").every((p) => p.length > 0));

// ── Los acentos se conservan en mayúscula ───────────────────────────────────
assert.equal(normalizarNombreCotizacion("mantención pañol"), "MANTENCIÓN PAÑOL");

// ── Bordes ──────────────────────────────────────────────────────────────────
assert.equal(normalizarNombreCotizacion("   "), "COTIZACIÓN SIN NOMBRE");
assert.equal(nombreDeCotizacionImportada(null, null), "COTIZACIÓN SIN NOMBRE");
assert.equal(nombreDeCotizacionImportada("OS 012-2026", null), "OS 012-2026");
assert.equal(nombreDeCotizacionImportada(null, "traslado de rollos"), "TRASLADO DE ROLLOS");
assert.equal(normalizarNombreCotizacion("Traslado de rollos."), "TRASLADO DE ROLLOS");
// Un número tan largo que no deja espacio útil: se queda solo el número.
assert.equal(
  nombreDeCotizacionImportada("OS 013-2026 REVISIÓN 2 ANEXO COMPLEMENTARIO DE PRECIOS UNITARIOS", "traslado"),
  "OS 013-2026 REVISIÓN 2 ANEXO COMPLEMENTARIO DE PRECIOS UNITARIOS",
);
// Idempotente: normalizar dos veces no cambia nada.
assert.equal(normalizarNombreCotizacion(os10), os10);

console.log(`
Reglas de nombre — casos reales

  OS 010  ${os10}
  OS 009  ${os9}
  largo   ${largo}  (${largo.length} caracteres)
`);
console.log("Todas las verificaciones pasaron.");
