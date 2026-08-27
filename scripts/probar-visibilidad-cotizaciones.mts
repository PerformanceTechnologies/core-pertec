/**
 * Quién ve qué cotización.
 *
 * Correr con:  npm run probar-visibilidad
 *
 * La regla es de una línea, pero se equivoca en silencio: si falla de más, el
 * listado deja de mostrarle a alguien su propio trabajo; si falla de menos,
 * muestra precios y márgenes del cliente de otro. Así que va con prueba, y las
 * dos últimas verificaciones son sobre el código fuente: la parte frágil no es
 * la regla, es acordarse de aplicarla en cada punto de entrada.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { puedeVerCotizacion } from "../lib/permisos-cotizador";

const ANA = "11111111-1111-1111-1111-111111111111";
const BETO = "22222222-2222-2222-2222-222222222222";

const deAna = { creadoPor: ANA, esDemo: false };
const deBeto = { creadoPor: BETO, esDemo: false };
const ejemplo = { creadoPor: ANA, esDemo: true };
const sinDuenio = { creadoPor: null, esDemo: false };

// ── Cada uno ve las suyas ───────────────────────────────────────────────────
assert.equal(puedeVerCotizacion(deAna, ANA, "usuario"), true);
assert.equal(puedeVerCotizacion(deBeto, ANA, "usuario"), false);
assert.equal(puedeVerCotizacion(deAna, BETO, "usuario"), false);

// Un visualizador tampoco ve las de otro: el rol define qué puede TOCAR, no de
// quién es el trabajo.
assert.equal(puedeVerCotizacion(deBeto, ANA, "visualizador"), false);
assert.equal(puedeVerCotizacion(deAna, ANA, "visualizador"), true);

// ── El admin ve todas ───────────────────────────────────────────────────────
assert.equal(puedeVerCotizacion(deAna, BETO, "admin"), true);
assert.equal(puedeVerCotizacion(deBeto, ANA, "admin"), true);
assert.equal(puedeVerCotizacion(sinDuenio, BETO, "admin"), true);

// ── Las de ejemplo son de todos ─────────────────────────────────────────────
assert.equal(puedeVerCotizacion(ejemplo, BETO, "usuario"), true);
assert.equal(puedeVerCotizacion(ejemplo, BETO, "visualizador"), true);

// ── Sin dueño: solo el admin ────────────────────────────────────────────────
// Lo importante es que un id vacío NO calce con un creado_por en null, que es
// como se filtraría todo el portafolio de una sola vez.
assert.equal(puedeVerCotizacion(sinDuenio, ANA, "usuario"), false);
assert.equal(puedeVerCotizacion(sinDuenio, "", "usuario"), false);

// ── Que la regla esté aplicada donde entra un id ────────────────────────────
const acciones = readFileSync("app/(protegido)/cotizador/acciones.ts", "utf8");
for (const accion of [
  "actualizarMetaCotizacionAction",
  "actualizarInputCotizacionAction",
  "marcarEmitidaAction",
  "crearNuevaVersionAction",
  "eliminarCotizacionAction",
]) {
  const cuerpo = acciones.slice(acciones.indexOf(`export async function ${accion}`));
  const hasta = cuerpo.indexOf("\n}");
  assert.ok(
    cuerpo.slice(0, hasta).includes("exigirCotizacion("),
    `${accion} trabaja sobre una cotización por id: tiene que pasar por exigirCotizacion, no solo por exigirAccesoCotizador (el rol no dice de quién es la cotización).`,
  );
}

// El listado sin argumento ya no compila, pero la ruta del PDF no pasa por el
// guard (responde con status, no redirige), así que su verificación es esta.
const rutaPdf = readFileSync("app/api/cotizador/[id]/eco-pdf/route.ts", "utf8");
assert.ok(
  rutaPdf.includes("puedeVerCotizacion("),
  "La ruta del ECO-1 entrega los precios completos: tiene que verificar puedeVerCotizacion antes de imprimir.",
);

console.log("Todas las verificaciones pasaron.");
