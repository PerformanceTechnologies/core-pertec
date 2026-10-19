/**
 * La consulta en lenguaje natural sobre los datos del core (Ctrl+K).
 *
 * Correr con:  npm run probar-ia-core
 *
 * NO llama al modelo ni a la base: eso cuesta plata y depende de la red. Lo que
 * se mide acá es lo que se puede romper en silencio y ningún ojo detectaría
 * mirando la pantalla:
 *
 *  - que TODAS las herramientas declaren su app y revaliden el permiso ADENTRO,
 *    no solo al armar la lista que se le ofrece al modelo;
 *  - que ninguna herramienta reciba SQL del modelo;
 *  - que el bucle tenga tope y que cada consulta quede registrada.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function leer(ruta: string): string {
  return readFileSync(new URL(ruta, import.meta.url), "utf8");
}

// ── Las herramientas de consulta ────────────────────────────────────────────

const herramientas = leer("../lib/consulta-ia/herramientas.ts");

// Cada herramienta declara su app y revalida adentro.
const nombres = [...herramientas.matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1]);
assert.deepEqual(
  nombres.sort(),
  ["buscar_facturas", "buscar_proyectos", "buscar_tareas", "buscar_ventas"],
  "las cuatro herramientas declaradas",
);
assert.equal(
  // Solo como PROPIEDAD (con su sangría y su coma), no la mención del comentario
  // de cabecera: si no, el test cuenta la prosa y pasa aunque falte en una tool.
  (herramientas.match(/^ +strict: true,$/gm) ?? []).length,
  nombres.length,
  "TODAS llevan strict: true — sin eso la API no garantiza que los argumentos validen contra " +
    "el esquema y pueden llegar campos de más",
);
assert.equal(
  (herramientas.match(/^  app: "/gm) ?? []).length,
  nombres.length,
  "todas declaran de qué app dependen",
);
assert.ok(
  // puedeVerApp y no un helper local: la regla de acceso vive en lib/autorizacion.ts,
  // junto a exigirAccesoApp y verificarAccesoAppApi, que son la misma regla en otras
  // formas. Una copia propia acá es una copia que se puede quedar atrás.
  /if \(!\(await puedeVerApp\(usuario, h\.app\)\)\) \{/.test(herramientas),
  "ejecutarHerramienta revalida el permiso: filtrar la lista que se le ofrece al modelo es " +
    "comodidad, esta comprobación es la reja. Si mañana alguien agrega una herramienta y se " +
    "olvida de filtrarla, esto la ataja igual",
);
assert.ok(
  /usuarioPuedeVerSubpanelFinanzas\(usuario\.id, "sii"\)/.test(herramientas),
  "las facturas además exigen el subpanel del SII, no solo la app de Finanzas",
);

// El modelo no escribe SQL. Lo que se comprueba son las superficies por las que
// un argumento suyo podría llegar a una consulta cruda: rpc() y execute_sql. Con
// SQL generado bastaría una razón social con comillas para leer una tabla que esa
// persona no puede ver.
//
// (No se busca la palabra "select": el builder de Supabase se llama .select() y es
// justamente lo que SÍ queremos — un primer intento de este test se auto-matcheaba
// con eso y fallaba sobre código correcto.)
for (const superficie of [/\.rpc\s*\(/, /execute_sql/i]) {
  assert.ok(
    !superficie.test(herramientas),
    `las herramientas no pueden usar ${superficie}: el modelo elige la herramienta y sus ` +
      "parámetros, la consulta la escribe este archivo con el cliente de Supabase",
  );
}

// Y el lado positivo: cada consulta sale del builder, con la tabla escrita a mano acá.
const tablasConsultadas = [...herramientas.matchAll(/supabaseAdmin\s*\n?\s*\.from\("([a-z_]+)"\)/g)].map(
  (m) => m[1],
);
assert.deepEqual(
  [...new Set(tablasConsultadas)].sort(),
  ["facturas_sii", "panel_odoo_proyectos", "panel_odoo_tareas", "panel_odoo_ventas"],
  "las tablas que se consultan están escritas literalmente en el archivo, no las elige el modelo",
);

assert.ok(
  /const TOPE_FILAS = 50/.test(herramientas),
  "hay un tope duro de filas por herramienta",
);

// ── El bucle ────────────────────────────────────────────────────────────────

const responder = leer("../lib/consulta-ia/responder.ts");
assert.ok(/const TOPE_VUELTAS = 6/.test(responder), "el bucle tiene tope: sin él, un modelo confundido consulta hasta agotar el tiempo");
assert.ok(
  /messages\.push\(\{ role: "user", content: resultados \}\)/.test(responder),
  "TODOS los resultados vuelven en UN mensaje: partirlos le enseña al modelo a dejar de pedir " +
    "herramientas en paralelo",
);
assert.ok(
  /respuesta\.stop_reason === "refusal"/.test(responder),
  "se revisa stop_reason antes de leer el contenido",
);
assert.ok(/console\.log\(\s*`\[consulta-ia\]/.test(responder), "cada consulta queda registrada con quién la hizo");

const ruta = leer("../app/api/consulta/route.ts");
assert.ok(/obtenerUsuarioActivo\(session\?\.user\?\.email\)/.test(ruta), "la ruta exige sesión de alguien activo");
assert.ok(/pregunta\.length > 500/.test(ruta), "hay tope de largo de la pregunta");
assert.ok(
  !/error instanceof Error \? error\.message/.test(ruta),
  "el detalle del error va al log, no a la pantalla: puede traer el mensaje crudo de la API",
);

console.log(
  "Consulta IA del core: las rejas de permiso de cada herramienta, que ninguna reciba SQL, " +
    "y el bucle acotado y registrado. Todo verificado.",
);
