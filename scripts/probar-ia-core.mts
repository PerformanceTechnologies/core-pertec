/**
 * Las dos piezas de IA nuevas: pendientes del core en el resumen diario, y
 * consulta en lenguaje natural sobre los datos.
 *
 * Correr con:  npm run probar-ia-core
 *
 * NO llama al modelo ni a la base: eso cuesta plata y depende de la red. Lo que
 * se mide acá es lo que se puede romper en silencio y ningún ojo detectaría
 * mirando la pantalla:
 *
 *  - que el servidor, y no el modelo, siga poniendo los enlaces y los conteos.
 *    Es LA regla de este resumen (ver el comentario de ResumenModelo) y la que
 *    se rompe sin querer al agregar una sección: basta con dejar que el modelo
 *    devuelva la URL "porque ya la tiene" para que un día mande a alguien a la
 *    rendición de otro;
 *  - que un índice inventado por el modelo termine en una fila sin enlace y no
 *    en el registro equivocado;
 *  - que TODAS las herramientas de consulta declaren su app y revaliden el
 *    permiso adentro, no solo al armar la lista;
 *  - que ninguna herramienta reciba SQL del modelo;
 *  - que el correo diario siga sin llevar contenido del core, solo el conteo.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bloquePendientes, type PendienteCore } from "../lib/resumen-diario/pendientes-core";

function leer(ruta: string): string {
  return readFileSync(new URL(ruta, import.meta.url), "utf8");
}

// ── El bloque que ve el modelo ───────────────────────────────────────────────

const PENDIENTES: PendienteCore[] = [
  {
    modulo: "Rendir Gastos",
    titulo: "Viaje a Calama",
    detalle: "Fondo asignado de 400.000, sin cargar a Odoo",
    antiguedadDias: 23,
    enlace: "/rendir-gastos/abc-123",
  },
  {
    modulo: "Ofertas Técnicas",
    titulo: "Mantención correa CV-007",
    detalle: "Para SALFA, sin emitir",
    antiguedadDias: 1,
    enlace: "/ofertas/def-456",
  },
];

const bloque = bloquePendientes(PENDIENTES);

assert.ok(bloque.includes("[1]") && bloque.includes("[2]"), "los pendientes van numerados desde 1");
assert.ok(
  !bloque.includes("/rendir-gastos/abc-123") && !bloque.includes("/ofertas/def-456"),
  "el modelo NO ve los enlaces: si los viera, un día devolvería uno copiado a mano y mal. " +
    "Los pega el servidor por índice (ver conDatosReales en lib/resumen-diario/datos.ts)",
);
assert.ok(bloque.includes("hace 23 días"), "la antigüedad va en el bloque: es el dato que ordena");
assert.ok(bloque.includes("hace 1 día"), "y en singular cuando corresponde");
assert.equal(
  bloquePendientes([]),
  "(sin pendientes en el core)",
  "sin pendientes se dice explícitamente, para que el modelo no invente una sección",
);

// ── Que el servidor ponga los datos exactos ─────────────────────────────────

const datos = leer("../lib/resumen-diario/datos.ts");
assert.ok(
  /pendientesCore: delModelo\.pendientesCore\.map\(\(\{ indice, \.\.\.resto \}\)/.test(datos),
  "los pendientes se rehidratan por índice, igual que los correos y las reuniones",
);
assert.ok(
  /const real = pendientes\[indice - 1\];/.test(datos),
  "el índice del prompt empieza en 1, de ahí el -1",
);
assert.ok(
  /enlace: real\?\.enlace \?\? null/.test(datos),
  "un índice inventado o fuera de rango deja la fila SIN enlace — no clickeable — en vez de " +
    "mandar a alguien al registro de otra persona",
);
assert.ok(
  /pendientesCoreTotales: pendientes\.length/.test(datos),
  "el total lo cuenta el servidor: pedirle a un modelo que cuente es donde inventa",
);

const tipos = leer("../lib/resumen-diario/tipos.ts");
assert.ok(
  /export const VERSION_RESUMEN = 6;/.test(tipos),
  "subir la versión hace que los resúmenes de hoy con el formato viejo se regeneren en vez " +
    "de pintar una sección vacía",
);
assert.ok(
  !/enlace/.test(tipos.slice(tipos.indexOf("PendienteDestacadoModelo"), tipos.indexOf("PendienteDestacado extends"))),
  "lo que devuelve el modelo NO incluye enlace",
);

// ── El correo sigue sin llevar contenido ────────────────────────────────────

const correo = leer("../lib/resumen-diario/correo-html.ts");
assert.ok(
  /pendientes = 0/.test(correo),
  "el correo recibe el conteo de pendientes",
);
for (const filtrado of ["titulo", "detalle", "modulo", "enlace"]) {
  assert.ok(
    !new RegExp(`\\$\\{[^}]*${filtrado}`).test(correo),
    `el cuerpo del correo NO puede interpolar ${filtrado}: se sincroniza en teléfonos y ` +
      "clientes de escritorio, y por eso deliberadamente no lleva contenido (solo el número)",
  );
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
  /if \(!\(await puedeVer\(usuario, h\.app\)\)\) \{/.test(herramientas),
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
  "IA del core: el bloque sin enlaces, la rehidratación por índice, el correo sin contenido, " +
    "las rejas de permiso de cada herramienta y el bucle acotado, todo verificado.",
);
