// Prueba lo puro de la página de cada módulo y de Administración: las cifras (vocabulario y reglas
// de lib/modulos-resumen-modelo.ts), los filtros de Usuarios y Aplicaciones y las iniciales.
import assert from "node:assert/strict";
import { claveDeResumen, cuenta, haceCuanto, pideAtencion } from "../lib/modulos-resumen-modelo";
import {
  appsAsignadasVigentes,
  contarAppsPorEstado,
  filtrarApps,
  filtrarUsuarios,
  hayFiltrosDeApps,
  hayFiltrosDeUsuarios,
  hrefConFiltros,
  iniciales,
  leerFiltrosDeApps,
  leerFiltrosDeUsuarios,
  normalizar,
  parametrosDeApps,
  parametrosDeUsuarios,
} from "../lib/administracion-modelo";
import { armarMenu } from "../lib/menu-modelo";
import type { Aplicacion, UsuarioConAcceso } from "../lib/tipos";

const app = (slug: string, url: string, estado: Aplicacion["estado"] = "activa", nombre = slug): Aplicacion =>
  ({ id: `id-${slug}`, nombre, slug, url, tipo: "interna", icono: "apps", color: "naranjo", descripcion: null, estado, orden: 0 }) as Aplicacion;

const usuario = (
  id: string,
  correo: string,
  nombre: string | null,
  rol: "admin" | "usuario",
  activo: boolean,
  aplicacionIds: string[],
): UsuarioConAcceso =>
  ({ id, correo, nombre, rol, activo, creado_en: "2026-01-01", ultimo_ingreso: null, aplicacionIds, rolesExtra: {} }) as UsuarioConAcceso;

// ─── Cifras de un módulo ───────────────────────────────────────────────────────────────
{
  assert.equal(cuenta(1, "producto", "productos"), "1 producto");
  assert.equal(cuenta(1200, "producto", "productos"), "1.200 productos");

  const ahora = new Date("2026-11-02T12:00:00Z");
  assert.equal(haceCuanto("2026-11-02T11:59:00Z", ahora), "recién");
  assert.equal(haceCuanto("2026-11-02T11:30:00Z", ahora), "hace 30 min");
  assert.equal(haceCuanto("2026-11-02T09:00:00Z", ahora), "hace 3 h");
  assert.equal(haceCuanto("2026-11-01T11:00:00Z", ahora), "ayer");
  assert.equal(haceCuanto("2026-10-28T12:00:00Z", ahora), "hace 5 días");
  assert.equal(haceCuanto("basura", ahora), "—");

  assert.equal(pideAtencion(null), false);
  assert.equal(pideAtencion({ metricas: [{ etiqueta: "a", valor: "1", tono: "ok" }], avisos: [] }), false);
  assert.equal(pideAtencion({ metricas: [{ etiqueta: "a", valor: "1", tono: "alerta" }], avisos: [] }), true);
  assert.equal(pideAtencion({ metricas: [], avisos: [{ texto: "x", tono: "aviso", href: "/x" }] }), true);
}

// Cada submódulo del menú con pantalla propia se reconoce por su ruta; los externos y «próximamente» no.
{
  const g = armarMenu(
    [app("flota", "/flota"), app("inventario", "/inventario"), app("finanzas", "/finanzas")],
    ["sii", "facturas-historicas"],
    { admin: true },
  );
  const claves = g.flatMap((x) => x.items.map(claveDeResumen));
  assert.deepEqual(claves, ["/finanzas/sii", "/finanzas/facturas-historicas", "/inventario", "/flota", "/usuarios", "/aplicaciones"]);
  const externa = { ...app("ext", "ext.pertec.cl"), tipo: "externa" } as Aplicacion;
  assert.equal(claveDeResumen({ tipo: "app", app: externa, nombre: "Ext" }), null);
  assert.equal(claveDeResumen({ tipo: "pronto", nombre: "Pronto", icono: "apps" }), null);
}

// ─── Administración: texto y direcciones ───────────────────────────────────────────────
{
  assert.equal(normalizar("Ñuñoa Álvaro"), "nunoa alvaro");
  assert.equal(iniciales("María Paz Soto", "x@pertec.cl"), "MS");
  assert.equal(iniciales("Ana", "ana@pertec.cl"), "A");
  assert.equal(iniciales(null, "ana.diaz@pertec.cl"), "AD");
  assert.equal(iniciales("  ", "soporte@pertec.cl"), "S");

  assert.equal(hrefConFiltros("/usuarios", {}, {}), "/usuarios");
  assert.equal(hrefConFiltros("/usuarios", { q: "ana" }, { estado: "activos" }), "/usuarios?q=ana&estado=activos");
  assert.equal(hrefConFiltros("/usuarios", { q: "ana", estado: "activos" }, { estado: undefined }), "/usuarios?q=ana");
  assert.equal(hrefConFiltros("/usuarios", { q: "ana" }, { q: "" }), "/usuarios");
}

// ─── Usuarios: filtros ─────────────────────────────────────────────────────────────────
{
  const apps = [app("a", "/a"), app("b", "/b")];
  const ids = new Set(apps.map((a) => a.id));
  const todos = [
    usuario("1", "ana.diaz@pertec.cl", "Ana Díaz", "admin", true, []),
    usuario("2", "beto@pertec.cl", "Beto Núñez", "usuario", true, ["id-a"]),
    usuario("3", "carla@pertec.cl", null, "usuario", true, []),
    usuario("4", "dario@pertec.cl", "Darío", "usuario", false, []),
    usuario("5", "eva@pertec.cl", "Eva", "usuario", true, ["id-borrada"]), // su única app ya no existe en el catálogo
  ];
  const ver = (params: Record<string, string>) => filtrarUsuarios(todos, leerFiltrosDeUsuarios(params), ids).map((u) => u.id);

  assert.deepEqual(ver({}), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ver({ estado: "activos" }), ["1", "2", "3", "5"]);
  assert.deepEqual(ver({ estado: "inactivos" }), ["4"]);
  assert.deepEqual(ver({ rol: "admin" }), ["1"]);
  // «Sin aplicaciones»: activos, no admin, sin ninguna app VIGENTE (el admin ve todas; el inactivo no entra).
  assert.deepEqual(ver({ acceso: "sin-apps" }), ["3", "5"]);
  // La búsqueda ignora tildes y mayúsculas, y mira nombre y correo.
  assert.deepEqual(ver({ q: "NUNEZ" }), ["2"]);
  assert.deepEqual(ver({ q: "dario" }), ["4"]);
  assert.deepEqual(ver({ q: "pertec.cl", rol: "admin" }), ["1"]);
  // Valores raros de la dirección caen al valor por omisión, no rompen nada.
  assert.deepEqual(leerFiltrosDeUsuarios({ estado: "cualquiera", rol: ["admin", "usuario"] }), {
    q: "",
    estado: "todos",
    rol: "admin",
    sinApps: false,
  });
  assert.equal(hayFiltrosDeUsuarios(leerFiltrosDeUsuarios({})), false);
  assert.deepEqual(parametrosDeUsuarios(leerFiltrosDeUsuarios({ q: " ana ", estado: "activos", acceso: "sin-apps" })), {
    q: "ana",
    estado: "activos",
    acceso: "sin-apps",
  });
  assert.equal(appsAsignadasVigentes(todos[4], ids), 0);
  assert.equal(appsAsignadasVigentes(todos[1], ids), 1);
}

// ─── Aplicaciones: filtros y conteo ────────────────────────────────────────────────────
{
  const catalogo = [
    app("finanzas", "/finanzas", "activa", "Herramientas Finanzas"),
    app("tareas", "/tareas", "en_desarrollo", "Tareas"),
    app("flota", "/flota", "mantenimiento", "Flota"),
    app("proyectos", "/proyectos", "activa", "Proyectos"),
  ];
  const ver = (params: Record<string, string>) => filtrarApps(catalogo, leerFiltrosDeApps(params)).map((a) => a.slug);

  assert.deepEqual(ver({}), ["finanzas", "tareas", "flota", "proyectos"]);
  assert.deepEqual(ver({ estado: "activa" }), ["finanzas", "proyectos"]);
  assert.deepEqual(ver({ estado: "mantenimiento" }), ["flota"]);
  // «En pausa» no es un estado de la tabla: sale de lib/apps-pausadas.ts.
  assert.deepEqual(ver({ estado: "en-pausa" }), ["proyectos"]);
  assert.deepEqual(ver({ q: "finanza" }), ["finanzas"]);
  assert.deepEqual(ver({ q: "/tar" }), ["tareas"], "también busca por ruta");
  assert.deepEqual(contarAppsPorEstado(catalogo), { total: 4, activa: 2, en_desarrollo: 1, mantenimiento: 1, "en-pausa": 1 });
  assert.equal(leerFiltrosDeApps({ estado: "inventado" }).estado, "todas");
  assert.equal(hayFiltrosDeApps(leerFiltrosDeApps({})), false);
  assert.deepEqual(parametrosDeApps(leerFiltrosDeApps({ q: "x", estado: "activa" })), { q: "x", estado: "activa" });
}

console.log("Módulos y Administración verificados: cifras, direcciones, filtros de usuarios y de aplicaciones, pausa y agrupación del catálogo.");
