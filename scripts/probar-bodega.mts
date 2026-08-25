/**
 * Las cuentas del módulo Bodega, con lo que de verdad devuelve Odoo.
 *
 * Lo que se prueba acá es lo único de este módulo que decide algo: sumar el mismo
 * producto que está en dos estanterías de la misma bodega, repartir las
 * transferencias por bodega a través de su tipo de operación, contar las atrasadas y
 * valorizar a costo estándar. Leer de Odoo y escribir en Supabase no se puede probar
 * sin credenciales, y por eso esas dos cosas viven en otro archivo.
 *
 * Correr con:  npm run probar-bodega
 */

import assert from "node:assert/strict";
import {
  armarFilasDeBodega,
  pendientesPorBodega,
  type LecturaDeBodega,
  type TipoTransferenciaOdoo,
  type TransferenciaOdoo,
} from "../lib/panel-odoo/bodega-filas";

const MARCA = "2026-08-24T12:00:00.000Z";
const HOY = "2026-08-24";
const nombreDeCompania = (id: number) => (id === 2 ? "Performance Service" : "Performance Technologies");

/** Las dos bodegas reales de una instancia chica: una principal y una de faena. */
const CENTRAL = {
  id: 1,
  name: "Bodega Central Antofagasta",
  code: "BCA" as string | false,
  company_id: [1, "Performance Technologies"] as [number, string],
  view_location_id: [5, "BCA"] as [number, string],
};
const FAENA = {
  id: 2,
  name: "Bodega Faena Angamos",
  code: false as string | false,
  company_id: [2, "Performance Service"] as [number, string],
  view_location_id: [12, "BFA"] as [number, string],
};

const CORREA = [101, "Correa transportadora 1200 mm"] as [number, string];
const PERNOS = [102, "Pernos de empalme"] as [number, string];

const lecturas: LecturaDeBodega[] = [
  {
    bodega: CENTRAL,
    // La correa está en DOS ubicaciones de la misma bodega: es un solo producto con
    // 30 unidades, no dos filas de 10 y 20.
    quants: [
      { product_id: CORREA, location_id: [6, "BCA/Estante A"], quantity: 10, reserved_quantity: 2 },
      { product_id: CORREA, location_id: [7, "BCA/Estante B"], quantity: 20, reserved_quantity: 0 },
      { product_id: PERNOS, location_id: [6, "BCA/Estante A"], quantity: 500, reserved_quantity: 0 },
    ],
    productos: [
      {
        id: 101,
        name: "Correa transportadora 1200 mm",
        default_code: "CT-1200",
        uom_id: [1, "Unidades"],
        categ_id: [3, "Correas"],
        standard_price: 1_500_000,
      },
      // Los pernos no traen ficha a propósito: pasa cuando el producto se archivó en
      // Odoo pero quedó stock. La fila tiene que salir igual, valorizada en 0.
    ],
  },
  {
    bodega: FAENA,
    quants: [{ product_id: PERNOS, location_id: [13, "BFA/Patio"], quantity: 40, reserved_quantity: 40 }],
    productos: [
      {
        id: 102,
        name: "Pernos de empalme",
        default_code: false,
        uom_id: [1, "Unidades"],
        categ_id: [4, "Insumos"],
        standard_price: 2_500,
      },
    ],
  },
];

// Los tipos de operación son los que saben de qué bodega es cada transferencia.
const tipos: TipoTransferenciaOdoo[] = [
  { id: 1, warehouse_id: [1, "Bodega Central Antofagasta"] },
  { id: 2, warehouse_id: [1, "Bodega Central Antofagasta"] },
  { id: 3, warehouse_id: [2, "Bodega Faena Angamos"] },
  // Un tipo sin bodega existe en Odoo y no puede contarse en ninguna.
  { id: 4, warehouse_id: false },
];

const transferencias: TransferenciaOdoo[] = [
  { picking_type_id: [1, "BCA: Recepciones"], scheduled_date: "2026-08-20 13:00:00" }, // atrasada
  { picking_type_id: [2, "BCA: Entregas"], scheduled_date: "2026-08-24 09:00:00" }, // hoy: al día
  { picking_type_id: [2, "BCA: Entregas"], scheduled_date: "2026-08-30 09:00:00" }, // futura
  { picking_type_id: [3, "BFA: Recepciones"], scheduled_date: "2026-08-01 08:00:00" }, // atrasada
  { picking_type_id: [4, "Interno sin bodega"], scheduled_date: "2026-01-01 08:00:00" },
  // Sin fecha programada no está atrasada: no se sabe cuándo tenía que llegar.
  { picking_type_id: [3, "BFA: Recepciones"], scheduled_date: false },
];

// ── Las transferencias se reparten por bodega ────────────────────────────────
const pendientes = pendientesPorBodega(tipos, transferencias, HOY);
assert.deepEqual(pendientes.get(1), { total: 3, atrasadas: 1 }, "las tres de la central, una vencida");
assert.deepEqual(pendientes.get(2), { total: 2, atrasadas: 1 }, "las dos de faena, una vencida");
assert.equal(pendientes.size, 2, "la del tipo sin bodega no se le cuenta a nadie");

// La de HOY no está atrasada: el corte es "antes de hoy", no "hasta hoy". Una
// transferencia programada para hoy es una transferencia al día.
const soloHoy = pendientesPorBodega(
  [{ id: 1, warehouse_id: [1, "Central"] }],
  [{ picking_type_id: [1, "x"], scheduled_date: `${HOY} 23:59:00` }],
  HOY,
);
assert.deepEqual(soloHoy.get(1), { total: 1, atrasadas: 0 });

// ── Las filas de la caché ────────────────────────────────────────────────────
const { filasBodega, filasStock } = armarFilasDeBodega(lecturas, tipos, transferencias, {
  hoy: HOY,
  marca: MARCA,
  nombreDeCompania,
});

assert.equal(filasBodega.length, 2);
const central = filasBodega.find((f) => f.odoo_id === 1)!;
const faena = filasBodega.find((f) => f.odoo_id === 2)!;

assert.equal(central.productos_distintos, 2, "dos productos, aunque uno esté en dos estantes");
assert.equal(central.unidades, 530, "10 + 20 de correa y 500 de pernos");
assert.equal(central.unidades_reservadas, 2);
// 30 correas × 1.500.000. Los pernos no tienen ficha, así que valen 0 y no rompen
// la suma: es lo que hace la diferencia entre un total y un NaN.
assert.equal(central.valor_inventario, 45_000_000, "valorizado a costo estándar");
assert.equal(central.codigo, "BCA");
assert.equal(central.company_nombre, "Performance Technologies");
assert.equal(central.transferencias_pendientes, 3);
assert.equal(central.transferencias_atrasadas, 1);

// Cada bodega con SU compañía: la de faena es de otra, y el panel filtra por eso.
assert.equal(faena.company_id, 2);
assert.equal(faena.company_nombre, "Performance Service");
assert.equal(faena.codigo, null, "un código vacío en Odoo llega como false y se guarda null");
assert.equal(faena.valor_inventario, 100_000, "40 pernos × 2.500");
assert.equal(faena.unidades_reservadas, 40, "todo comprometido");

// ── El detalle ───────────────────────────────────────────────────────────────
assert.equal(filasStock.length, 3, "dos filas de la central y una de faena");
const correa = filasStock.find((f) => f.bodega_odoo_id === 1 && f.producto_odoo_id === 101)!;
assert.equal(correa.cantidad, 30, "sumada, no repetida");
assert.equal(correa.reservada, 2);
assert.equal(correa.valor, 45_000_000);
assert.equal(correa.codigo, "CT-1200");
assert.equal(correa.categoria, "Correas");
assert.equal(correa.unidad, "Unidades");

const pernosCentral = filasStock.find((f) => f.bodega_odoo_id === 1 && f.producto_odoo_id === 102)!;
assert.equal(pernosCentral.cantidad, 500, "el producto sin ficha igual aparece");
assert.equal(pernosCentral.costo_unitario, 0, "sin ficha no se inventa un costo");
assert.equal(pernosCentral.valor, 0);
assert.equal(
  pernosCentral.producto_nombre,
  "Pernos de empalme",
  "el nombre sale de la tupla del quant cuando no hay ficha",
);
assert.equal(pernosCentral.categoria, null, "y lo que solo estaba en la ficha queda vacío");

// El MISMO producto en dos bodegas son dos filas distintas, cada una con lo suyo:
// es lo que hace que "todo por bodega" signifique algo.
const pernosFaena = filasStock.find((f) => f.bodega_odoo_id === 2 && f.producto_odoo_id === 102)!;
assert.equal(pernosFaena.cantidad, 40);
assert.equal(pernosFaena.costo_unitario, 2_500);
assert.notEqual(pernosCentral.company_id, pernosFaena.company_id);

// Todas las filas de una corrida llevan la misma marca: es lo que después borra lo
// anterior sin poder borrar lo que se acaba de escribir.
assert.ok([...filasBodega, ...filasStock].every((f) => f.actualizado_en === MARCA));

// ── Una bodega vacía ────────────────────────────────────────────────────────
const vacia = armarFilasDeBodega([{ bodega: CENTRAL, quants: [], productos: [] }], tipos, transferencias, {
  hoy: HOY,
  marca: MARCA,
  nombreDeCompania,
});
assert.equal(vacia.filasBodega.length, 1, "una bodega sin stock igual existe");
assert.equal(vacia.filasBodega[0].productos_distintos, 0);
assert.equal(vacia.filasBodega[0].valor_inventario, 0);
assert.equal(vacia.filasStock.length, 0);
// Y sigue mostrando sus transferencias pendientes, que es justo lo que hay que
// mirar en una bodega que está esperando mercadería.
assert.equal(vacia.filasBodega[0].transferencias_pendientes, 3);

console.log(`
Bodega: las cuentas del módulo, sobre lo que devuelve Odoo.

Un producto en dos estanterías de la misma bodega es UN producto con la suma de las
dos; el mismo producto en dos bodegas son dos filas distintas. Un producto sin
ficha —archivado en Odoo con stock todavía— aparece con costo 0 en vez de romper la
suma o desaparecer. Un código vacío llega como false y se guarda null.

Las transferencias se reparten por el tipo de operación, que es lo único que sabe de
qué bodega son; una de un tipo sin bodega no se le cuenta a ninguna. Atrasada es
antes de hoy: la programada para hoy está al día, y una sin fecha no está atrasada.

Una bodega sin stock existe igual y sigue mostrando lo que tiene en camino.
`);
console.log("Todas las verificaciones pasaron.");
