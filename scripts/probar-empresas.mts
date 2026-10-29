/**
 * Multiempresa: quién puede pararse en qué empresa.
 *
 * Correr con:  npm run probar-empresas
 *
 * Cuál empresa está activa viaja en una COOKIE, porque el servidor la necesita
 * para armar cada página. Y una cookie la escribe el navegador: cualquiera puede
 * poner ahí 'zeus' y recargar. Lo único que impide que eso funcione es que el
 * servidor NUNCA devuelve lo que dice la cookie, sino una de las empresas
 * permitidas, usando la cookie apenas como preferencia.
 *
 * Esta prueba vigila esa regla y la del usuario sin empresas asignadas, que es
 * el estado natural de todo usuario recién creado y por lo tanto el que no puede
 * terminar dando acceso a todo.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COOKIE_EMPRESA,
  SLUG_POR_OMISION,
  empresasPermitidas,
  inicialesDe,
  mostrarSelector,
  puedeVerEmpresa,
  resolverEmpresaActiva,
  type Empresa,
} from "../lib/empresas-modelo";

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

const empresa = (slug: string, nombre: string, extra: Partial<Empresa> = {}): Empresa => ({
  id: `id-${slug}`,
  nombre,
  slug,
  rut: null,
  color: "gris",
  logo: null,
  orden: 0,
  activa: true,
  ...extra,
});

const PERTEC = empresa("pertec", "Performance Technologies");
const ZEUS = empresa("zeus", "Zeus");
const PS = empresa("performance-service", "Performance Service");
const TODAS = [PERTEC, ZEUS, PS];

// ── Quién ve qué ────────────────────────────────────────────────────────────

assert.deepEqual(
  empresasPermitidas(TODAS, [], "admin"),
  TODAS,
  "el admin del core entra a todas, como en el resto del sistema",
);

assert.deepEqual(
  empresasPermitidas(TODAS, [ZEUS.id], "usuario").map((e) => e.slug),
  ["zeus"],
  "con una asignada, ve esa y nada más",
);

assert.deepEqual(
  empresasPermitidas(TODAS, [PERTEC.id, ZEUS.id], "usuario").map((e) => e.slug),
  ["pertec", "zeus"],
  "con dos asignadas, ve las dos",
);

assert.deepEqual(
  empresasPermitidas(TODAS, [], "usuario").map((e) => e.slug),
  ["pertec"],
  "SIN NINGUNA asignada ve solo la de por omisión, NO todas. Devolver todas acá habría sido el " +
    "atajo cómodo —'si no se restringió, no hay restricción'— y le habría dado las tres empresas " +
    "a cada usuario nuevo, que arranca justamente sin filas en usuario_empresas",
);

assert.deepEqual(
  empresasPermitidas(TODAS, ["id-de-una-empresa-borrada"], "usuario").map((e) => e.slug),
  ["pertec"],
  "una asignación que apunta a una empresa que ya no está cae a la de por omisión, no a vacío",
);

// Una empresa desactivada desaparece para todos, incluso para quien la tenía
// asignada y para el admin: desactivarla es la forma de sacarla de circulación.
const CON_ZEUS_INACTIVA = [PERTEC, { ...ZEUS, activa: false }, PS];
assert.deepEqual(
  empresasPermitidas(CON_ZEUS_INACTIVA, [ZEUS.id], "usuario").map((e) => e.slug),
  ["pertec"],
  "una empresa desactivada no se puede elegir aunque esté asignada",
);
assert.ok(
  !empresasPermitidas(CON_ZEUS_INACTIVA, [], "admin").some((e) => e.slug === "zeus"),
  "ni siquiera el admin se para en una empresa desactivada",
);

// ── La cookie es una preferencia, no una orden ─────────────────────────────
//
// ESTA es la prueba que importa. Si alguna vez resolverEmpresaActiva devuelve
// algo que no está en `permitidas`, el selector pasa a ser decorativo y basta
// editar una cookie para mirar la contabilidad de otra empresa.

const soloPertec = empresasPermitidas(TODAS, [PERTEC.id], "usuario");

assert.equal(
  resolverEmpresaActiva("zeus", soloPertec)?.slug,
  "pertec",
  "una cookie que pide una empresa NO permitida cae a la de por omisión. La cookie la escribe el " +
    "navegador: si se le hiciera caso, el permiso no existiría",
);
assert.equal(
  resolverEmpresaActiva("empresa-inventada", soloPertec)?.slug,
  "pertec",
  "un slug que no existe tampoco rompe nada",
);
assert.equal(resolverEmpresaActiva(null, soloPertec)?.slug, "pertec", "sin cookie, la de por omisión");
assert.equal(resolverEmpresaActiva(undefined, soloPertec)?.slug, "pertec", "undefined tampoco explota");
assert.equal(resolverEmpresaActiva("", soloPertec)?.slug, "pertec", "cookie vacía tampoco");

// Sea cual sea la cookie, lo devuelto SIEMPRE sale de la lista permitida.
const permitidasDeAlguien = empresasPermitidas(TODAS, [ZEUS.id, PS.id], "usuario");
for (const intento of ["pertec", "zeus", "performance-service", "inventada", "", "../pertec", "ZEUS"]) {
  const elegida = resolverEmpresaActiva(intento, permitidasDeAlguien);
  assert.ok(
    elegida && permitidasDeAlguien.some((e) => e.slug === elegida.slug),
    `con la cookie "${intento}" se devolvió una empresa fuera de las permitidas`,
  );
}

assert.equal(
  resolverEmpresaActiva("zeus", permitidasDeAlguien)?.slug,
  "zeus",
  "y cuando la cookie SÍ pide una permitida, se respeta: para eso está",
);

// Quien no tiene PERTEC entre las suyas igual necesita caer en algo.
assert.equal(
  resolverEmpresaActiva(null, permitidasDeAlguien)?.slug,
  "zeus",
  "sin la de por omisión disponible, la primera de la lista. Nunca null con permitidas no vacía",
);
assert.equal(resolverEmpresaActiva("zeus", []), null, "sin ninguna empresa permitida no hay activa");

// ── puedeVerEmpresa: lo que valida el cambio ───────────────────────────────

assert.equal(puedeVerEmpresa("pertec", soloPertec), true);
assert.equal(puedeVerEmpresa("zeus", soloPertec), false);
assert.equal(puedeVerEmpresa("zeus", permitidasDeAlguien), true);
assert.equal(puedeVerEmpresa("", soloPertec), false, "el slug vacío no pasa por descuido");

// ── El selector solo aparece cuando sirve ──────────────────────────────────

assert.equal(mostrarSelector([]), false);
assert.equal(
  mostrarSelector(soloPertec),
  false,
  "con una sola empresa no hay nada que elegir: un combo de un ítem es ruido. Hugo lo pidió " +
    "sutil, y lo más sutil es no estar cuando no sirve",
);
assert.equal(mostrarSelector(permitidasDeAlguien), true);
assert.equal(mostrarSelector(TODAS), true);

// ── Las iniciales del chip ─────────────────────────────────────────────────

assert.equal(inicialesDe("Performance Technologies"), "PT");
assert.equal(inicialesDe("Performance Service"), "PS");
assert.equal(inicialesDe("Zeus"), "ZE", "una sola palabra usa sus dos primeras letras");
assert.equal(inicialesDe("  Zeus  "), "ZE", "los espacios de más no cuentan");
assert.equal(inicialesDe(""), "?", "un nombre vacío no deja el chip en blanco");
assert.equal(inicialesDe("a b"), "AB", "siempre en mayúsculas");

// ═══════════════════════════════════════════════════════════════════════════
//  Los candados del lado del servidor
// ═══════════════════════════════════════════════════════════════════════════

const accion = leer("../app/(protegido)/cambiar-empresa.ts");

// La acción NO puede confiar en lo que le mandan: se invoca por HTTP directo,
// igual que cualquier Server Action.
assert.ok(
  /await auth\(\)/.test(accion) && /obtenerUsuarioActivo/.test(accion),
  "cambiarEmpresaAction tiene que identificar a la persona por la sesión",
);
assert.ok(
  /empresasPermitidas\(/.test(accion) && /puedeVerEmpresa\(slug, permitidas\)/.test(accion),
  "y volver a calcular los permisos acá adentro. El slug que llega del formulario es tan poco de " +
    "fiar como la cookie que va a escribir",
);
const posValidacion = accion.indexOf("puedeVerEmpresa(slug, permitidas)");
const posEscritura = accion.indexOf("galletas.set(");
assert.ok(
  posValidacion !== -1 && posValidacion < posEscritura,
  "la validación va ANTES de escribir la cookie",
);
assert.ok(
  /if \(!puedeVerEmpresa\(slug, permitidas\)\) return;/.test(accion),
  "y si no corresponde, se sale sin escribir nada",
);

// El resolutor del servidor pasa por las reglas, no las reinterpreta.
const servidor = leer("../lib/empresas.ts");
assert.ok(/^import "server-only";/m.test(servidor), "lib/empresas.ts usa supabaseAdmin: va server-only");
assert.ok(
  !/^import "server-only";/m.test(leer("../lib/empresas-modelo.ts")),
  "el modelo NO lleva server-only a propósito: lo importa el selector del menú, que es cliente",
);
assert.ok(
  /empresasPermitidas\(todas, asignadas, rolDelCore\)/.test(servidor) &&
    /resolverEmpresaActiva\(galletas\.get\(COOKIE_EMPRESA\)\?\.value, permitidas\)/.test(servidor),
  "contextoDeEmpresa tiene que armar las permitidas y pasar la cookie por el resolutor, no leerla " +
    "y usarla directo",
);

// El menú recibe lo ya resuelto.
const layout = leer("../app/(protegido)/layout.tsx");
assert.ok(
  /contextoDeEmpresa\(usuario\.id, usuario\.rol\)/.test(layout) &&
    /empresaActiva=\{empresa\.activa\}/.test(layout),
  "el layout resuelve la empresa y se la pasa al menú ya decidida",
);

// La pantalla de Usuarios puede asignar empresas: sin eso el permiso existe
// pero nadie lo puede otorgar, que fue justo lo que pasó con el rol de gastos.
const formulario = leer("../components/FormularioUsuario.tsx");
assert.ok(
  /name="empresas"/.test(formulario) && /todasLasEmpresas/.test(formulario),
  "sin las casillas en Usuarios, las empresas no se pueden asignar",
);
const acciones = leer("../app/(protegido)/usuarios/acciones.ts");
assert.ok(
  /reemplazarEmpresas\(usuario\.id, leerEmpresas\(form\)\)/.test(acciones) &&
    /reemplazarEmpresas\(id, leerEmpresas\(form\)\)/.test(acciones),
  "y hay que guardarlas tanto al crear como al editar: guardarlas solo en uno de los dos es el " +
    "error que no se nota hasta que alguien edita un usuario y pierde sus empresas",
);

// La migración.
const sql = leer("../supabase/empresas/0001_empresas.sql");
for (const slug of ["pertec", "zeus", "performance-service"]) {
  assert.ok(new RegExp(`'${slug}'`).test(sql), `falta la empresa ${slug} en la migración`);
}
assert.ok(
  new RegExp(`'${SLUG_POR_OMISION}', 'naranjo', 0`).test(sql),
  "la empresa de por omisión va con orden 0: es la primera del selector y la dueña de lo que hay hoy",
);
for (const t of ["empresas", "usuario_empresas"]) {
  assert.ok(
    new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql),
    `${t} sin RLS quedaría legible con la llave pública`,
  );
}
assert.ok(
  /on delete cascade/.test(sql),
  "borrar un usuario tiene que llevarse sus empresas: si no, quedan filas apuntando a nadie",
);
assert.ok(
  /primary key \(usuario_id, empresa_id\)/.test(sql),
  "la clave compuesta impide asignar dos veces la misma empresa a la misma persona",
);
assert.ok(
  new RegExp(`"${COOKIE_EMPRESA}"`).test(leer("../lib/empresas-modelo.ts")),
  "el nombre de la cookie sale del modelo, no escrito a mano en cada archivo",
);

console.log(
  "Multiempresa verificada: el admin entra a todas, quien no tiene ninguna asignada ve solo " +
    "PERTEC (nunca todas), una empresa desactivada desaparece para todos, y la cookie jamás " +
    "decide por su cuenta — se devuelve siempre una de las permitidas.",
);

// ── El filtro por empresa ────────────────────────────────────────────────────
{
  const { tieneDatosCargados } = await import("../lib/empresas-modelo");
  const { readFileSync, existsSync } = await import("node:fs");
  assert.equal(tieneDatosCargados({ slug: "pertec" }), true);
  assert.equal(tieneDatosCargados({ slug: "zeus" }), false);
  assert.equal(tieneDatosCargados({ slug: "performance-service" }), false);
  // Sin migración corrida todavía no hay empresa activa: el Core sigue como antes.
  assert.equal(tieneDatosCargados(null), true);

  // Todo módulo con datos pasa por el filtro; un módulo nuevo que se olvide de
  // envolverse le mostraría a Zeus los datos de PERTEC.
  for (const m of ["buzon", "contratos", "cotizador", "finanzas", "inventario", "mi-dia", "ofertas",
                   "panel-odoo", "proyectos", "reclutamiento", "rendir-gastos"]) {
    const ruta = `app/(protegido)/${m}/layout.tsx`;
    assert.ok(existsSync(ruta) && /<FiltroDeEmpresa>/.test(readFileSync(ruta, "utf8")), `${m} no filtra por empresa`);
  }
  assert.match(readFileSync("supabase/empresas/0001_empresas.sql", "utf8"), /'zeus', 'dorado'/);
}
console.log("Filtro por empresa: solo PERTEC muestra datos; Zeus y Performance Service quedan vacíos.");
