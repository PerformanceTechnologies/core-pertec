/**
 * Fabricación: la aritmética del costo, el PDF para proveedores y los candados del módulo.
 *
 * Correr con:  npm run probar-fabricacion
 *
 * Un error en esta cuenta no se nota en pantalla: se nota cuando alguien cotiza con un costo que estaba
 * mal. Y el PDF se manda a proveedores: si el margen o las notas internas se cuelan en él, se filtra lo
 * que cobramos. Por eso se prueba cada paso con números que se verifican a mano, que el HTML del PDF no
 * contenga nada interno aunque la ficha lo tenga, y que ninguna Server Action ni la ruta del PDF queden
 * sin permiso.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calcularCosto,
  composicion,
  leerNumero,
  subtotalItem,
  formatearMontoFino,
  formatearPct,
  type GrupoCosto,
} from "../lib/fabricacion-modelo";
import { MAX_ITEMS_DETALLADOS, htmlDeCosto, nombreArchivoCosto, totalDelDocumento, type DatosCostoPdf } from "../lib/fabricacion-documento";

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

// ---- 2. Costo ---------------------------------------------------------------------
console.log("Costo");
const items: { grupo: GrupoCosto; cantidad: number; costoUnitario: number; mermaPct: number }[] = [
  { grupo: "material", cantidad: 10, costoUnitario: 1000, mermaPct: 10 }, // 11.000
  { grupo: "material", cantidad: 2, costoUnitario: 5000, mermaPct: 0 }, //  10.000
  { grupo: "mano_obra", cantidad: 5, costoUnitario: 4000, mermaPct: 0 }, // 20.000
  { grupo: "maquinaria", cantidad: 2, costoUnitario: 4500, mermaPct: 0 }, //  9.000
];
const r = calcularCosto(items, { margenPct: 30 });
prueba("suma por grupo", () => {
  assert.ok(Math.abs(r.porGrupo.material - 21000) < 1e-6);
  assert.equal(r.porGrupo.mano_obra, 20000);
  assert.equal(r.porGrupo.maquinaria, 9000);
  assert.equal(r.porGrupo.servicio, 0);
  assert.equal(r.itemsPorGrupo.material, 2);
});
prueba("el costo de fabricación es la suma de los ítems", () => assert.ok(Math.abs(r.costo - 50000) < 1e-6));
prueba("margen del 30 % es SOBRE EL PRECIO: 50.000 ÷ 0,70, no 50.000 × 1,30", () => {
  assert.ok(Math.abs(r.precioConMargen! - 50000 / 0.7) < 1e-6);
  assert.notEqual(Math.round(r.precioConMargen!), 65000);
});
prueba("la utilidad es precio − costo", () => assert.ok(Math.abs(r.utilidad! - (50000 / 0.7 - 50000)) < 1e-6));
prueba("con margen 0 el precio es el costo", () => {
  const c = calcularCosto(items, { margenPct: 0 });
  assert.equal(c.precioConMargen, c.costo);
  assert.equal(c.utilidad, 0);
});
prueba("receta vacía: todo en 0 y sin dividir por cero", () => {
  const v = calcularCosto([], { margenPct: 0 });
  assert.equal(v.costo, 0);
  assert.equal(v.precioConMargen, 0);
});
prueba("un margen de 100 % o más no tiene precio", () => {
  assert.equal(calcularCosto(items, { margenPct: 100 }).precioConMargen, null);
  assert.equal(calcularCosto(items, { margenPct: 150 }).precioConMargen, null);
  assert.equal(calcularCosto(items, { margenPct: 100 }).utilidad, null);
});
prueba("un margen negativo o NaN cuenta como 0", () => {
  assert.equal(calcularCosto(items, { margenPct: -10 }).precioConMargen, 50000);
  assert.equal(calcularCosto(items, { margenPct: NaN }).precioConMargen, 50000);
});

// ---- 3. Composición ---------------------------------------------------------------------------
console.log("Composición");
prueba("la composición suma 100 y omite los grupos en 0", () => {
  const c = composicion(r.porGrupo);
  assert.equal(c.length, 3);
  assert.ok(Math.abs(c.reduce((t, x) => t + x.pct, 0) - 100) < 1e-9);
});
prueba("sin costos no hay composición", () => assert.deepEqual(composicion({ material: 0, mano_obra: 0, maquinaria: 0, servicio: 0, otro: 0 }), []));
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

// ---- 6. El PDF: nada interno ---------------------------------------------------------------------
console.log("PDF para proveedores");
const base: DatosCostoPdf = {
  empresa: { slug: "pertec", nombre: "PERTEC SpA", rut: "76.000.000-0", direccion: "Calle 1", giro: "Ingeniería", telefono: null, correo: null, web: null },
  logo: null,
  fecha: "2026-11-16",
  producto: { nombre: "Manguera de presión", codigo: "FAB-001", descripcion: "Manguera hidráulica 1/2\"", unidad: "MT" },
  items: [
    { grupo: "material", descripcion: "Manguera 1/2\" <b>alta</b> presión", cantidad: 1.1, unidad: "mt", costoUnitario: 3500, mermaPct: 10 },
    { grupo: "mano_obra", descripcion: "Armado", cantidad: 0.5, unidad: "hr", costoUnitario: 8000, mermaPct: 0 },
  ],
};
const html = htmlDeCosto(base);
prueba("el HTML trae el producto, los ítems y el costo total", () => {
  assert.match(html, /Costo de fabricación/);
  assert.match(html, /Manguera de presión/);
  assert.match(html, /FAB-001/);
  assert.match(html, /COSTO TOTAL/);
  assert.ok(Math.abs(totalDelDocumento(base.items) - (1.1 * 3500 * 1.1 + 4000)) < 1e-6);
});
prueba("el texto de las personas se escapa", () => {
  assert.doesNotMatch(html, /<b>alta<\/b>/);
  assert.match(html, /&lt;b&gt;alta&lt;\/b&gt;/);
});
prueba("el tipo del PDF no tiene cómo recibir el margen, la utilidad ni las notas", () => {
  const doc = readFileSync("lib/fabricacion-documento.ts", "utf8");
  const tipo = doc.slice(doc.indexOf("export interface DatosCostoPdf"), doc.indexOf("/** Más ítems que esto"));
  for (const palabra of ["margen", "utilidad", "precioConMargen", "notas", "nota:"]) assert.ok(!tipo.includes(palabra), `el tipo menciona «${palabra}»`);
});
prueba("aunque el llamador intente colar datos internos, el HTML no los imprime", () => {
  const colado = { ...base, margenPct: 37, notas: "SECRETO-INTERNO", precioConMargen: 98765, items: base.items.map((i) => ({ ...i, nota: "NOTA-DE-ITEM", productoId: "x" })) } as unknown as DatosCostoPdf;
  const h = htmlDeCosto(colado);
  for (const secreto of ["SECRETO-INTERNO", "NOTA-DE-ITEM", "98.765", "98765", "37 %"]) assert.ok(!h.includes(secreto), `el HTML imprime «${secreto}»`);
  assert.doesNotMatch(h.replace(/<style>[\s\S]*?<\/style>/, ""), /margen|utilidad/i);
});
prueba("la columna de merma solo aparece si algún ítem tiene merma", () => {
  assert.match(html, /Merma/);
  const sin = htmlDeCosto({ ...base, items: base.items.map((i) => ({ ...i, mermaPct: 0 })) });
  assert.doesNotMatch(sin, /Merma/);
});
prueba("con demasiados ítems el PDF resume por tipo de costo (cabe en una hoja)", () => {
  const muchos = { ...base, items: Array.from({ length: MAX_ITEMS_DETALLADOS + 1 }, (_, k) => ({ grupo: (k % 2 ? "material" : "otro") as GrupoCosto, descripcion: `Ítem ${k}`, cantidad: 1, unidad: "un", costoUnitario: 100, mermaPct: 0 })) };
  const h = htmlDeCosto(muchos);
  assert.match(h, /Tipo de costo/);
  assert.doesNotMatch(h, /Ítem 7/);
  assert.ok(h.includes(`COSTO TOTAL</td><td>${formatearMontoFino((MAX_ITEMS_DETALLADOS + 1) * 100)}`));
});
prueba("el nombre del archivo es seguro", () => {
  assert.equal(nombreArchivoCosto({ producto: { ...base.producto, nombre: 'a/b:c*"d' } }), "Costo de fabricación - a b c d.pdf");
});

// ---- 7. La ruta del PDF -------------------------------------------------------------------------------
console.log("Ruta del PDF");
const ruta = readFileSync("app/api/inventario/fabricacion/[id]/pdf/route.ts", "utf8");
prueba("la ruta exige el acceso a Inventario y valida el id", () => {
  assert.match(ruta, /verificarAccesoAppApi\("inventario"\)/);
  assert.match(ruta, /\[0-9a-f-\]\{36\}/);
});
prueba("la ruta no lee el margen ni las notas de la ficha", () => {
  const cuerpo = ruta.slice(ruta.indexOf("const documento"), ruta.indexOf("const pdf"));
  assert.ok(!/margenPct|\.notas|precioConMargen/.test(cuerpo));
});
const config = readFileSync("next.config.ts", "utf8");
prueba("next.config incluye el navegador y los logos para la ruta del PDF (si no, falla recién en Vercel)", () => {
  assert.match(config, /"\/api\/inventario\/fabricacion\/\\\\\[id\\\\\]\/pdf": \[\.\.\.NAVEGADOR, \.\.\.LOGOS_DE_EMPRESAS\]/);
  assert.match(config, /"\/api\/inventario\/fabricacion\/\\\\\[id\\\\\]\/pdf": SIN_VISOR_DE_TRACES/);
});

const sql = readFileSync("supabase/inventario/0010_fabricacion.sql", "utf8");
prueba("la migración se puede correr dos veces", () => {
  assert.doesNotMatch(sql, /create table (?!if not exists)/i);
  assert.doesNotMatch(sql, /create (unique )?index (?!if not exists)/i);
});
prueba("la migración cuida los valores absurdos", () => {
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
