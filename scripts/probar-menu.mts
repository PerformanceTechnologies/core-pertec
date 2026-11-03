// Prueba el agrupado del menú de la izquierda (lib/menu-modelo.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agruparCatalogo, armarMenu, rutaDeModulo } from "../lib/menu-modelo";
import { estaPausada, SLUGS_PAUSADOS } from "../lib/apps-pausadas";
import { iconoDeModulo } from "../lib/iconos-menu";
import type { Aplicacion } from "../lib/tipos";

const app = (url: string, nombre: string, tipo: "interna" | "externa" = "interna"): Aplicacion =>
  ({ id: url, nombre, slug: url.slice(1), url, tipo, icono: "apps", color: "naranjo", descripcion: null, estado: "activa", orden: 0 }) as Aplicacion;

const todas = [
  app("/finanzas", "Herramientas Finanzas"), app("/rendir-gastos", "Rendir Gastos"),
  app("/cotizador", "Cotizador"), app("/ofertas", "Ofertas"), app("/contratos", "Contratos"),
  app("/reclutamiento", "Panel de postulación"), app("/pagina-web", "Página web"), app("/inventario", "Inventario"), app("/tareas", "Tareas"), app("/flota", "Flota"),
  app("/valorizacion-historica", "Valorización histórica"), app("/proyectos", "Proyectos"), app("/mi-dia", "Mi Día"),
];
const nombres = (g: ReturnType<typeof armarMenu>[number]) => g.items.map((i) => i.nombre);

// El admin: todo, en el orden pedido. «Página web» cierra la lista (arriba de Administración).
{
  const g = armarMenu(todas, ["sii", "facturas-historicas", "facturas-ih"]);
  assert.deepEqual(g.map((x) => x.titulo), ["Finanzas", "CRM", "Tareas", "Contratos", "Inventario", "Página web"]);
  assert.deepEqual(nombres(g[0]), ["Facturas compra y venta", "Rendir Gastos", "Históricos facturas"]);
  assert.deepEqual(nombres(g[1]), ["Cotizador", "Ofertas técnicas"]);
  assert.deepEqual(nombres(g[2]), ["Tareas"]);
  assert.deepEqual(nombres(g[3]), ["Contratos"]);
  // Flota y Valorización histórica cuelgan de Inventario (son otras aplicaciones, con su permiso y
  // sus rutas, pero el mismo módulo).
  assert.deepEqual(nombres(g[4]), ["Stock y bodegas", "Flota", "Valorización histórica"]);
  assert.deepEqual(g[4].items.map((i) => (i.tipo === "app" ? i.app.url : "")), ["/inventario", "/flota", "/valorizacion-historica"]);
  assert.deepEqual(nombres(g[5]), ["Configuración", "Postulaciones"]);
  assert.deepEqual(g[5].items.map((i) => i.tipo), ["app", "app"]);
  // Ocultos: Proyectos, Mi Día (va arriba a la derecha) y Facturas IH.
  const todo = g.flatMap(nombres).join("|");
  assert.ok(!/Proyectos|Mi Día|IH/.test(todo));
  // Una app que no calza en ningún grupo cae en «Otras», no desaparece.
  assert.deepEqual(armarMenu([app("/nueva", "Nueva")], []).map(nombres), [["Nueva"]]);
}

// «Página web» va SIEMPRE al final, incluso después de «Otras».
{
  const g = armarMenu([...todas, app("/nueva", "Nueva")], ["sii"]);
  assert.deepEqual(g.map((x) => x.titulo), ["Finanzas", "CRM", "Tareas", "Contratos", "Inventario", "Otras", "Página web"]);
  assert.equal(g.at(-1)?.titulo, "Página web");
}

// Sin permiso no aparece; un grupo sin nada real desaparece entero.
{
  const g = armarMenu([app("/finanzas", "F"), app("/inventario", "Inventario")], ["facturas-historicas"]);
  assert.deepEqual(g.map((x) => x.titulo), ["Finanzas", "Inventario"]);
  assert.deepEqual(nombres(g[0]), ["Históricos facturas"]);
}
// Contactos encabeza Finanzas: es la base de la facturación.
{
  const g = armarMenu(todas, ["contactos", "sii", "facturas-historicas"]);
  assert.deepEqual(nombres(g[0]), ["Contactos", "Facturas compra y venta", "Rendir Gastos", "Históricos facturas"]);
  assert.deepEqual(g[0].items[0].tipo === "enlace" ? g[0].items[0].href : null, "/finanzas/contactos");
}
// Subpanel concedido pero sin la app Finanzas: no se muestra.
assert.deepEqual(armarMenu([app("/rendir-gastos", "Rendir Gastos")], ["sii"]).flatMap(nombres), ["Rendir Gastos"]);
// La configuración de la web se concede como cualquier app: sin ella no aparece.
assert.deepEqual(
  armarMenu([app("/reclutamiento", "P")], []).find((g) => g.titulo === "Página web")?.items.map((i) => i.nombre),
  ["Postulaciones"],
);
// Sin Postulaciones ni Configuración, «Página web» no queda flotando con solo los «Pronto».
assert.ok(!armarMenu([app("/cotizador", "Cotizador")], []).some((g) => g.titulo === "Página web"));
assert.deepEqual(armarMenu([], []), []);

// Cada módulo tiene su identificador estable, su descripción, su icono y su página.
{
  const g = armarMenu(todas, ["sii", "facturas-historicas"], { admin: true });
  assert.deepEqual(g.map((x) => x.slug), ["finanzas", "crm", "tareas", "contratos", "inventario", "pagina-web", "administracion"]);
  assert.equal(new Set(g.map((x) => x.slug)).size, g.length, "los slugs no se repiten: son la dirección de la página del módulo");
  assert.ok(g.every((x) => x.descripcion.length > 10), "todo módulo explica en una línea qué hay adentro");
  for (const x of g) {
    assert.notEqual(iconoDeModulo(x.slug), iconoDeModulo("desconocido"), `«${x.titulo}» tiene su propio icono`);
  }
  assert.equal(rutaDeModulo("pagina-web"), "/modulos/pagina-web");
  // Los submódulos de Finanzas traen su descripción para la cartilla de la página del módulo.
  for (const i of g[0].items) if (i.tipo === "enlace") assert.ok(i.descripcion, `«${i.nombre}» trae descripción`);
  // «Administración» solo para el admin del Core, y siempre lo último (después de «Página web»).
  assert.equal(g.at(-1)?.titulo, "Administración");
  assert.deepEqual(nombres(g.at(-1)!), ["Usuarios", "Aplicaciones"]);
  assert.ok(!armarMenu(todas, ["sii"]).some((x) => x.slug === "administracion"), "sin admin no hay Administración");
  // Sin ningún submódulo visible, el módulo no existe (su página daría 404).
  assert.deepEqual(armarMenu([], [], { admin: false }), []);
}

// Sin permiso sobre Inventario pero CON permiso sobre Flota: Flota sigue apareciendo, en su módulo.
{
  const g = armarMenu([app("/flota", "Flota")], []);
  assert.deepEqual(g.map((x) => x.titulo), ["Inventario"]);
  assert.deepEqual(nombres(g[0]), ["Flota"]);
}

// Proyectos está en pausa: se esconde de todos lados (menú, Inicio, buscador, su página y su API),
// pero NO del catálogo de Administración, donde se reactiva y se sigue asignando.
{
  assert.deepEqual([...SLUGS_PAUSADOS], ["proyectos"]);
  assert.ok(estaPausada("proyectos"));
  assert.ok(!estaPausada("flota") && !estaPausada("inventario"));
  const grupos = agruparCatalogo(todas);
  assert.deepEqual(grupos.map((x) => x.slug), ["finanzas", "crm", "tareas", "contratos", "inventario", "pagina-web", "fuera-del-menu", "en-pausa"]);
  assert.deepEqual(grupos.find((x) => x.slug === "inventario")?.apps.map((a) => a.nombre), ["Inventario", "Flota", "Valorización histórica"]);
  assert.deepEqual(grupos.find((x) => x.slug === "finanzas")?.apps.map((a) => a.nombre), ["Herramientas Finanzas", "Rendir Gastos"]);
  assert.deepEqual(grupos.find((x) => x.slug === "en-pausa")?.apps.map((a) => a.nombre), ["Proyectos"]);
  assert.deepEqual(grupos.find((x) => x.slug === "fuera-del-menu")?.apps.map((a) => a.nombre), ["Mi Día"]);
  // Ninguna aplicación se pierde ni se repite al agrupar.
  const todasLasAgrupadas = grupos.flatMap((x) => x.apps.map((a) => a.id));
  assert.equal(new Set(todasLasAgrupadas).size, todas.length);
  // Una aplicación nueva cae en «Otras», antes de «Página web».
  const conNueva = agruparCatalogo([...todas, app("/nueva", "Nueva")]).map((x) => x.slug);
  assert.deepEqual(conNueva.slice(-4), ["otras", "pagina-web", "fuera-del-menu", "en-pausa"]);
}

// La barra: el botón de plegar SIEMPRE funciona. Lo que toca la persona manda sobre el valor por
// omisión (antes, el módulo donde estaba la página abierta se forzaba abierto y el botón parecía roto),
// y un módulo arranca plegado.
{
  const barra = readFileSync(new URL("../components/BarraLateral.tsx", import.meta.url), "utf8");
  assert.match(barra, /tocados\[clave\] \?\? porDefecto/, "lo tocado manda sobre el valor por omisión");
  assert.match(barra, /despliegue\.abierto\(clave, false\)/, "un módulo arranca plegado");
  assert.doesNotMatch(barra, /plegado = .*conActiva/, "el módulo con la página abierta ya no se fuerza abierto");
  assert.match(barra, /inert=\{!abierto\}/, "lo plegado sale del orden del teclado");
  assert.match(barra, /motion-reduce:transition-none/, "las animaciones respetan «reducir movimiento»");
}

console.log("Menú verificado: módulos con slug, descripción e icono; Página web siempre al final y Administración solo para el admin; Flota dentro de Inventario; Proyectos en pausa (fuera del menú y presente en el catálogo) y Facturas IH ocultos; nada sin permiso; el botón de plegar siempre funciona.");
