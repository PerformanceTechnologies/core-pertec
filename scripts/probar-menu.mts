// Prueba el agrupado del menú de la izquierda (lib/menu-modelo.ts).
import assert from "node:assert/strict";
import { armarMenu } from "../lib/menu-modelo";
import type { Aplicacion } from "../lib/tipos";

const app = (url: string, nombre: string, tipo: "interna" | "externa" = "interna"): Aplicacion =>
  ({ id: url, nombre, slug: url.slice(1), url, tipo, icono: "apps", color: "naranjo", descripcion: null, estado: "activa", orden: 0 }) as Aplicacion;

const todas = [
  app("/finanzas", "Herramientas Finanzas"), app("/rendir-gastos", "Rendir Gastos"),
  app("/cotizador", "Cotizador"), app("/ofertas", "Ofertas"), app("/contratos", "Contratos"),
  app("/reclutamiento", "Panel de postulación"), app("/inventario", "Inventario"),
  app("/proyectos", "Proyectos"), app("/panel-odoo", "Panel Odoo"), app("/mi-dia", "Mi Día"),
];
const nombres = (g: ReturnType<typeof armarMenu>[number]) => g.items.map((i) => i.nombre);

// El admin: todo, en el orden pedido.
{
  const g = armarMenu(todas, ["sii", "facturas-historicas", "facturas-ih"]);
  assert.deepEqual(g.map((x) => x.titulo), ["Finanzas", "CRM", null, "Página web", null]);
  assert.deepEqual(nombres(g[0]), ["Facturas compra y venta", "Rendir Gastos", "Históricos facturas"]);
  assert.deepEqual(nombres(g[1]), ["Cotizador", "Ofertas técnicas"]);
  assert.deepEqual(nombres(g[2]), ["Contratos"]);
  assert.deepEqual(nombres(g[3]), ["Configuración", "Postulaciones", "Cotizador web"]);
  assert.deepEqual(g[3].items.map((i) => i.tipo), ["pronto", "app", "pronto"]);
  assert.deepEqual(nombres(g[4]), ["Inventario"]);
  // Ocultos: Proyectos, Panel Odoo, Mi Día (va arriba a la derecha) y Facturas IH.
  const todo = g.flatMap(nombres).join("|");
  assert.ok(!/Proyectos|Panel Odoo|Mi Día|IH/.test(todo));
  // Una app que no calza en ningún grupo cae en «Otras», no desaparece.
  assert.deepEqual(armarMenu([app("/nueva", "Nueva")], []).map(nombres), [["Nueva"]]);
}

// Sin permiso no aparece; un grupo sin nada real desaparece entero.
{
  const g = armarMenu([app("/finanzas", "F"), app("/inventario", "Inventario")], ["facturas-historicas"]);
  assert.deepEqual(g.map((x) => x.titulo), ["Finanzas", null]);
  assert.deepEqual(nombres(g[0]), ["Históricos facturas"]);
}
// Subpanel concedido pero sin la app Finanzas: no se muestra.
assert.deepEqual(armarMenu([app("/rendir-gastos", "Rendir Gastos")], ["sii"]).flatMap(nombres), ["Rendir Gastos"]);
// Sin Postulaciones, «Página web» no queda flotando con solo los «Pronto».
assert.ok(!armarMenu([app("/cotizador", "Cotizador")], []).some((g) => g.titulo === "Página web"));
assert.deepEqual(armarMenu([], []), []);

console.log("Menú verificado: Finanzas, CRM, Contratos, Página web e Inventario en orden; Proyectos y Facturas IH ocultos; nada sin permiso.");
