/**
 * Fabricación: la aritmética del costo y los candados del módulo.
 *
 * Correr con:  npm run probar-fabricacion
 *
 * Un error en esta cuenta no se nota en pantalla: se nota cuando alguien cotiza con un costo que
 * estaba mal. Por eso se prueba cada paso (merma, indirectos, rendimiento, margen sobre el precio)
 * con números que se pueden verificar a mano, y después se comprueba que ninguna Server Action quede
 * sin permiso y que la migración tenga los candados que el código da por hechos.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calcularCosto,
  composicion,
  leerNumero,
  lecturaMargen,
  subtotalItem,
  formatearPct,
  type GrupoCosto,
} from "../lib/fabricacion-modelo";

let n = 0;
const prueba = (nombre: string, f: () => void) => {
  f();
  n++;
  console.log(`  ok  ${nombre}`);
};

// ---- 1. Subtotal ----------------------------------------------------------------
console.log("Subtotal de un ítem");
prueba("cantidad × costo", () => assert.equal(subtotalItem({ cantidad: 4, costoUnitario: 2500, mermaPct: 0 }), 10000));
prueba("la merma encarece: 10 % sobre 10.000 = 11.000", () => assert.ok(Math.abs(subtotalItem({ cantidad: 4, costoUnitario: 2500, mermaPct: 10 }) - 11000) < 1e-9));
prueba("datos raros cuentan como 0, no como NaN", () => {
  assert.equal(subtotalItem({ cantidad: NaN, costoUnitario: 5, mermaPct: 0 }), 0);
  assert.equal(subtotalItem({ cantidad: -3, costoUnitario: 5, mermaPct: 0 }), 0);
  assert.equal(subtotalItem({ cantidad: 3, costoUnitario: Infinity, mermaPct: 0 }), 0);
});
prueba("la merma se topa en 100 %", () => assert.equal(subtotalItem({ cantidad: 1, costoUnitario: 100, mermaPct: 500 }), 200));

// ---- 2. Costo completo ------------------------------------------------------------
console.log("Costo completo");
const items: { grupo: GrupoCosto; cantidad: number; costoUnitario: number; mermaPct: number }[] = [
  { grupo: "material", cantidad: 10, costoUnitario: 1000, mermaPct: 10 }, // 11.000
  { grupo: "material", cantidad: 2, costoUnitario: 5000, mermaPct: 0 }, //  10.000
  { grupo: "mano_obra", cantidad: 5, costoUnitario: 4000, mermaPct: 0 }, // 20.000
  { grupo: "maquinaria", cantidad: 2, costoUnitario: 4500, mermaPct: 0 }, //  9.000
];
// directo = 50.000; indirectos 10 % = 5.000; receta = 55.000; rinde 10 → 5.500 c/u
const r = calcularCosto(items, { rendimiento: 10, indirectosPct: 10, margenPct: 30, precioVenta: 0 });
prueba("suma por grupo", () => {
  assert.ok(Math.abs(r.porGrupo.material - 21000) < 1e-6);
  assert.equal(r.porGrupo.mano_obra, 20000);
  assert.equal(r.porGrupo.maquinaria, 9000);
  assert.equal(r.porGrupo.servicio, 0);
  assert.equal(r.itemsPorGrupo.material, 2);
});
prueba("directo, indirectos y receta", () => {
  assert.ok(Math.abs(r.costoDirecto - 50000) < 1e-6);
  assert.ok(Math.abs(r.indirectos - 5000) < 1e-6);
  assert.ok(Math.abs(r.costoLote - 55000) < 1e-6);
});
prueba("el costo por unidad divide por el rendimiento", () => assert.ok(Math.abs(r.costoUnitario - 5500) < 1e-6));
prueba("margen del 30 % es SOBRE EL PRECIO: 5.500 ÷ 0,70, no 5.500 × 1,30", () => {
  assert.ok(Math.abs(r.precioSugerido! - 5500 / 0.7) < 1e-6);
  assert.notEqual(Math.round(r.precioSugerido!), 7150);
});
prueba("sin precio de venta no hay margen real", () => {
  assert.equal(r.margenReal, null);
  assert.equal(r.utilidadUnitaria, null);
});

const conPrecio = calcularCosto(items, { rendimiento: 10, indirectosPct: 10, margenPct: 30, precioVenta: 7857.14 });
prueba("margen real al precio sugerido ≈ 30 %", () => assert.ok(Math.abs(conPrecio.margenReal! - 30) < 0.01));
prueba("recargo sobre el costo es mayor que el margen sobre el precio", () => assert.ok(conPrecio.recargoReal! > conPrecio.margenReal!));
prueba("vender bajo el costo da utilidad y margen negativos", () => {
  const p = calcularCosto(items, { rendimiento: 10, indirectosPct: 10, margenPct: 30, precioVenta: 5000 });
  assert.ok(p.utilidadUnitaria! < 0 && p.margenReal! < 0);
});

console.log("Bordes");
prueba("receta vacía: todo en 0 y sin dividir por cero", () => {
  const v = calcularCosto([], { rendimiento: 1, indirectosPct: 0, margenPct: 0, precioVenta: 0 });
  assert.equal(v.costoUnitario, 0);
  assert.equal(v.precioSugerido, 0);
});
prueba("rendimiento 0 o negativo se trata como 1", () => {
  assert.equal(calcularCosto(items, { rendimiento: 0, indirectosPct: 0, margenPct: 0, precioVenta: 0 }).costoUnitario, 50000);
  assert.equal(calcularCosto(items, { rendimiento: -4, indirectosPct: 0, margenPct: 0, precioVenta: 0 }).costoUnitario, 50000);
});
prueba("un margen de 100 % o más no tiene precio sugerido", () => {
  assert.equal(calcularCosto(items, { rendimiento: 1, indirectosPct: 0, margenPct: 100, precioVenta: 0 }).precioSugerido, null);
  assert.equal(calcularCosto(items, { rendimiento: 1, indirectosPct: 0, margenPct: 150, precioVenta: 0 }).precioSugerido, null);
});
prueba("rendimiento fraccionario (0,5 → duplica el costo)", () => {
  assert.equal(calcularCosto(items, { rendimiento: 0.5, indirectosPct: 0, margenPct: 0, precioVenta: 0 }).costoUnitario, 100000);
});

// ---- 3. Composición y lectura ---------------------------------------------------------
console.log("Composición y lectura");
prueba("la composición suma 100 y omite los grupos en 0", () => {
  const c = composicion(r.porGrupo);
  assert.equal(c.length, 3);
  assert.ok(Math.abs(c.reduce((t, x) => t + x.pct, 0) - 100) < 1e-9);
});
prueba("sin costos no hay composición", () => assert.deepEqual(composicion({ material: 0, mano_obra: 0, maquinaria: 0, servicio: 0, otro: 0 }), []));
prueba("lectura del margen", () => {
  assert.equal(lecturaMargen(null, 30), "sin_precio");
  assert.equal(lecturaMargen(25, 30), "bajo");
  assert.equal(lecturaMargen(30, 30), "en_meta");
  assert.equal(lecturaMargen(45, 30), "en_meta");
});
prueba("formato de porcentaje a la chilena", () => {
  assert.equal(formatearPct(12), "12 %");
  assert.equal(formatearPct(12.5), "12,5 %");
});

// ---- 4. Lectura de números del formulario ---------------------------------------------------
console.log("Números del formulario");
prueba("punto decimal del input numérico", () => assert.equal(leerNumero("12.5"), 12.5));
prueba("formato chileno: la coma manda y el punto es de miles", () => assert.equal(leerNumero("1.250,5"), 1250.5));
prueba("vacío es 0; basura es NaN", () => {
  assert.equal(leerNumero(""), 0);
  assert.equal(leerNumero(null), 0);
  assert.ok(Number.isNaN(leerNumero("abc")));
});

// ---- 5. Candados del módulo -------------------------------------------------------------
console.log("Candados");
const acciones = readFileSync("app/(protegido)/inventario/fabricacion/acciones.ts", "utf8");
const exportadas = [...acciones.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
prueba("hay Server Actions", () => assert.ok(exportadas.length >= 8));
for (const nombre of exportadas) {
  prueba(`${nombre} comprueba el acceso a la app`, () => {
    const inicio = acciones.indexOf(`export async function ${nombre}(`);
    const resto = acciones.slice(inicio + 1);
    const fin = resto.search(/\nexport async function /);
    const cuerpo = fin === -1 ? resto : resto.slice(0, fin);
    assert.match(cuerpo, /exigirAccesoApp\(SLUG\)/);
  });
}
prueba("archivar y restaurar exigen el permiso de archivar", () => {
  for (const nombre of ["archivarFabricacionAction", "restaurarFabricacionAction"]) {
    const inicio = acciones.indexOf(`export async function ${nombre}(`);
    assert.match(acciones.slice(inicio, inicio + 700), /exigirPermisoDeArchivar\(usuario\)/);
  }
});

const sql = readFileSync("supabase/inventario/0010_fabricacion.sql", "utf8");
prueba("la migración se puede correr dos veces", () => {
  assert.doesNotMatch(sql, /create table (?!if not exists)/i);
  assert.doesNotMatch(sql, /create (unique )?index (?!if not exists)/i);
});
prueba("la migración cuida los valores absurdos", () => {
  assert.match(sql, /rendimiento\s+numeric not null default 1 check \(rendimiento > 0\)/);
  assert.match(sql, /margen_pct\s+numeric not null default 0 check \(margen_pct >= 0 and margen_pct < 100\)/);
  assert.match(sql, /merma_pct\s+numeric not null default 0 check \(merma_pct >= 0 and merma_pct <= 100\)/);
  assert.match(sql, /check \(estado in \('borrador', 'activo', 'archivado'\)\)/);
});
prueba("borrar una ficha borra sus ítems, y el código no se repite", () => {
  assert.match(sql, /fabricacion_id uuid not null references public\.inv_fab_productos \(id\) on delete cascade/);
  assert.match(sql, /unique index if not exists inv_fab_productos_codigo_uidx/);
});
prueba("las dos tablas tienen RLS", () => {
  assert.match(sql, /inv_fab_productos enable row level security/);
  assert.match(sql, /inv_fab_items enable row level security/);
});
prueba("los grupos del modelo y de la base coinciden", () => {
  const modelo = readFileSync("lib/fabricacion-modelo.ts", "utf8");
  const g = modelo.match(/GRUPOS_COSTO = \[(.*?)\]/)![1].match(/"(\w+)"/g)!.map((s) => s.replace(/"/g, ""));
  for (const grupo of g) assert.ok(sql.includes(`'${grupo}'`), `falta ${grupo} en el CHECK`);
});

console.log(`\n${n} comprobaciones correctas.`);
