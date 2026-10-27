/**
 * Rendir Gastos: quién ve las rendiciones de quién.
 *
 * Correr con:  npm run probar-permisos-rendidor
 *
 * El módulo tenía la misma comparación —`creadoPor !== id && rol !== "admin"`—
 * copiada en ocho archivos. Con ocho copias, agregar un rol significa acordarse
 * de las ocho, y la que se olvida NO falla ruidosamente: deja a alguien viendo
 * de menos (molesto) o de más (una filtración).
 *
 * De hecho ya había pasado: app/api/rendidor/[id]/excel/route.ts nunca tuvo la
 * comparación, así que cualquiera con la app podía bajar la planilla completa de
 * otra persona —con las boletas embebidas— pidiendo su id.
 *
 * Por eso acá se prueban dos cosas: la REGLA, que ahora vive en un solo lugar, y
 * que NINGUNA ruta que lea una rendición se saltee ese lugar.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  puedeAbrirRendicion,
  puedeVerRendicionesAjenas,
  ROLES_RENDIDOR,
} from "../lib/permisos-rendidor";

const YO = "usuario-1";
const OTRO = "usuario-2";

// ── La regla ────────────────────────────────────────────────────────────────

assert.equal(
  puedeAbrirRendicion(YO, YO, "usuario", "usuario"),
  true,
  "la propia siempre se puede abrir",
);
assert.equal(
  puedeAbrirRendicion(OTRO, YO, "usuario", "usuario"),
  false,
  "un usuario normal NO abre la de otra persona: es el comportamiento que el módulo tuvo siempre",
);
assert.equal(
  puedeAbrirRendicion(OTRO, YO, "usuario", "admin"),
  true,
  "el administrador de gastos sí, que es justamente para lo que se creó el rol",
);
assert.equal(
  puedeAbrirRendicion(OTRO, YO, "admin", "usuario"),
  true,
  "el admin del core entra a todo, como en el resto del sistema",
);

// Rendiciones viejas, de antes de que se guardara el autor.
assert.equal(
  puedeAbrirRendicion(null, YO, "usuario", "usuario"),
  false,
  "sin autor NO es de nadie, así que un usuario normal no la ve. Tratarla como propia habría " +
    "sido lo cómodo y se la habría mostrado a toda la empresa",
);
assert.equal(
  puedeAbrirRendicion(null, YO, "usuario", "admin"),
  true,
  "pero quien ve las ajenas sí la ve: si no, quedaría invisible para todos",
);

assert.equal(puedeVerRendicionesAjenas("usuario", "usuario"), false);
assert.equal(puedeVerRendicionesAjenas("usuario", "admin"), true);
assert.equal(puedeVerRendicionesAjenas("admin", "usuario"), true);

// ── El rol por omisión no amplía nada ──────────────────────────────────────

const permisos = readFileSync(new URL("../lib/rendidor/permisos.ts", import.meta.url), "utf8");
assert.ok(
  /=== "admin" \? "admin" : "usuario"/.test(permisos),
  "el rol por omisión es 'usuario': quien tiene la app pero nadie le asignó nada ve lo suyo. " +
    "Un rol nuevo no puede ampliar lo que alguien ve sin que un admin lo decida",
);

// ── Ninguna ruta se saltea la regla ─────────────────────────────────────────
//
// Esta es la prueba que importa. Recorre las rutas de verdad, no una lista
// escrita a mano que se desactualiza.

const raiz = fileURLToPath(new URL("../app/api/rendidor/", import.meta.url));

function rutasDeApi(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return rutasDeApi(ruta);
    return e.name === "route.ts" ? [ruta] : [];
  });
}

const sinChequeo: string[] = [];
for (const ruta of rutasDeApi(raiz)) {
  const codigo = readFileSync(ruta, "utf8");
  // Solo las que LEEN una rendición concreta: las de catálogo (empleados,
  // proveedores, fondos) no tienen dueño que comprobar.
  if (!codigo.includes("obtenerRendicion(")) continue;
  if (!codigo.includes("puedeAbrirRendicion(")) sinChequeo.push(ruta.replace(raiz, ""));
}
assert.deepEqual(
  sinChequeo,
  [],
  `Estas rutas abren una rendición sin comprobar de quién es: ${sinChequeo.join(", ")}. ` +
    "Así fue como el endpoint del Excel quedó abierto durante semanas.",
);

// Y lo mismo del lado de las páginas y las acciones.
for (const archivo of [
  "../app/(protegido)/rendir-gastos/[id]/page.tsx",
  "../app/(protegido)/rendir-gastos/[id]/odoo/page.tsx",
  "../app/(protegido)/rendir-gastos/acciones.ts",
]) {
  const codigo = readFileSync(new URL(archivo, import.meta.url), "utf8");
  assert.ok(
    codigo.includes("puedeAbrirRendicion("),
    `${archivo} abre una rendición y tiene que pasar por la regla compartida`,
  );
}

// Y que no haya quedado ninguna copia suelta de la comparación vieja.
for (const archivo of [...rutasDeApi(raiz)]) {
  const codigo = readFileSync(archivo, "utf8");
  assert.ok(
    !/creadoPor !== \w+\.id/.test(codigo),
    `${archivo.replace(raiz, "")} todavía compara el autor a mano en vez de usar la regla compartida`,
  );
}

// ── El filtro del listado sale de la regla, no de un rol a mano ────────────

const datos = readFileSync(new URL("../lib/rendidor/datos.ts", import.meta.url), "utf8");
assert.ok(
  /quien\.verTodas/.test(datos) && !/quien\.rol === "admin"/.test(datos),
  "listarRendiciones recibe si ve todas, ya decidido: no vuelve a interpretar el rol por su " +
    "cuenta, que es como las dos interpretaciones se separan con el tiempo",
);
assert.ok(
  /\.eq\("creado_por", quien\.usuarioId\)/.test(datos),
  "el filtro sigue yendo en la CONSULTA y no sobre el resultado: filtrar después trae las " +
    "rendiciones de toda la empresa a memoria para descartarlas",
);

// ── La pantalla de Usuarios puede asignarlo ────────────────────────────────

assert.deepEqual(
  ROLES_RENDIDOR.map((r) => r.valor),
  ["usuario", "admin"],
  "los dos roles que ofrece el selector",
);
// El valor guardado tiene que ser uno de los que esa columna ya acepta.
// usuario_aplicaciones.rol_extra la comparten todos los módulos, y la primera
// versión de este rol guardaba "administrador" —un valor inédito— así que el
// guardado se caía con un error de Server Components, sin mensaje a la vista.
const VALORES_YA_EN_USO = ["admin", "especial", "usuario", "visualizador"];
for (const r of ROLES_RENDIDOR) {
  assert.ok(
    VALORES_YA_EN_USO.includes(r.valor),
    `"${r.valor}" no es un valor que rol_extra ya use. La etiqueta puede decir lo que quiera ` +
      `("Administrador de gastos"), pero el valor guardado tiene que ser del esquema compartido.`,
  );
}
const formulario = readFileSync(new URL("../components/FormularioUsuario.tsx", import.meta.url), "utf8");
assert.ok(
  /app\.slug === "rendir-gastos"/.test(formulario) && /ROLES_RENDIDOR/.test(formulario),
  "sin el selector en Usuarios el rol existe pero nadie puede asignarlo",
);

console.log(
  "Permisos de Rendir Gastos: la regla en un solo lugar, el rol por omisión sin ampliar nada, " +
    "y ninguna ruta, página o acción salteándose la comprobación. Todo verificado.",
);
