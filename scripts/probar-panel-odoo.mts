/**
 * El detalle de facturas del Panel Odoo: filtros, orden y totales.
 *
 * Correr con:  npm run probar-panel-odoo
 *
 * Todo lo que decide qué facturas se ven vive en lib/panel-odoo/facturas-filtro.ts, puro
 * y sin React, justamente para poder medirlo acá. Lo que se prueba no es que las
 * funciones existan, sino cada regla que se puede romper sin que se note en pantalla:
 *
 *  - buscar sin tildes y sin importar mayúsculas (un cliente con Ñ o tilde es lo normal);
 *  - que el filtro de cedidas encuentre las cedidas de TODO el histórico y no confunda
 *    "yielded" (cedida) con "to_yield" (por ceder), que es el error fácil;
 *  - que "vencidas" no cuente una factura ya pagada;
 *  - que ordenar deje los nulos al final en los dos sentidos y NO mute el arreglo que
 *    llega del servidor;
 *  - que los totales se calculen sobre lo filtrado, que es lo que el resumen dice.
 *
 * Además se verifica contra el fuente que la sincronización pida a Odoo los campos de la
 * cesión: sin l10n_cl_aec_yielded en el searchRead, toda la pantalla queda vacía y ningún
 * test de UI lo notaría.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FilaFactura } from "../lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  ESTADO_FILTROS,
  diasDeAtraso,
  estaVencida,
  filtrarFacturas,
  hoyEnChileIso,
  ordenarFacturas,
  resumirFacturas,
  type Criterios,
} from "../lib/panel-odoo/facturas-filtro";

const HOY = "2026-09-07";

function factura(parcial: Partial<FilaFactura> & { odoo_id: number }): FilaFactura {
  return {
    move_type: "out_invoice",
    state: "posted",
    payment_state: "not_paid",
    numero: `FAC ${parcial.odoo_id}`,
    partner_nombre: "Cliente",
    fecha_factura: "2026-08-01",
    fecha_vencimiento: "2026-09-30",
    monto_total: 1000,
    monto_pendiente: 1000,
    diario: "Ventas",
    cedida: null,
    cedida_a_odoo_id: null,
    dte_estado: "accepted",
    dte_aceptacion: null,
    reclamo: null,
    tipo_documento: "(33) Electronic Invoice",
    monto_neto: 840,
    monto_impuesto: 160,
    vendedor: "Mauricio Hernandez",
    condicion_pago: "30 Days",
    referencia: null,
    origen: null,
    rut_contraparte: "76929210-1",
    moneda: "CLP",
    edp_nombre: null,
    edp_estado: null,
    ...parcial,
  };
}

const con = (parcial: Partial<Criterios>): Criterios => ({ ...CRITERIOS_INICIALES, ...parcial });

// ── El universo de prueba ────────────────────────────────────────────────
const facturas: FilaFactura[] = [
  factura({ odoo_id: 1, partner_nombre: "Minera Peñalolén", cedida: "yielded", monto_total: 5000, monto_pendiente: 5000 }),
  factura({ odoo_id: 2, partner_nombre: "Constructora Sur", cedida: "to_yield" }),
  factura({ odoo_id: 3, partner_nombre: "Cliente Pagado", payment_state: "paid", monto_pendiente: 0, fecha_vencimiento: "2026-01-01" }),
  factura({ odoo_id: 4, partner_nombre: "Atrasado SpA", fecha_vencimiento: "2026-08-01", monto_pendiente: 2000, monto_total: 2000 }),
  factura({ odoo_id: 5, partner_nombre: "Proveedor X", move_type: "in_invoice", fecha_factura: "2026-07-15", dte_estado: null }),
  factura({ odoo_id: 6, partner_nombre: "Reclamador Ltda", dte_aceptacion: "claimed", dte_estado: "objected" }),
  factura({ odoo_id: 7, partner_nombre: null, fecha_factura: null, fecha_vencimiento: null, state: "draft" }),
];
const ids = (fs: FilaFactura[]) => fs.map((f) => f.odoo_id);

// ── Buscar ───────────────────────────────────────────────────────────────
assert.deepEqual(
  ids(filtrarFacturas(facturas, con({ texto: "penalolen" }), HOY)),
  [1],
  "buscar sin tildes tiene que encontrar 'Minera Peñalolén'",
);
assert.deepEqual(
  ids(filtrarFacturas(facturas, con({ texto: "76929210" }), HOY)).length,
  7,
  "el RUT es buscable (todas las de la muestra lo comparten)",
);
assert.deepEqual(ids(filtrarFacturas(facturas, con({ texto: "no existe nadie asi" }), HOY)), []);

// ── Estados ──────────────────────────────────────────────────────────────
assert.deepEqual(
  ids(filtrarFacturas(facturas, con({ estado: "cedidas" }), HOY)),
  [1],
  "'cedidas' es solo yielded: to_yield todavía no se cedió",
);
assert.deepEqual(ids(filtrarFacturas(facturas, con({ estado: "por_ceder" }), HOY)), [2]);
assert.deepEqual(
  ids(filtrarFacturas(facturas, con({ estado: "vencidas" }), HOY)),
  [4],
  "la #3 venció en enero pero está pagada: no es una vencida",
);
assert.deepEqual(ids(filtrarFacturas(facturas, con({ estado: "reclamadas" }), HOY)), [6]);
assert.deepEqual(ids(filtrarFacturas(facturas, con({ estado: "dte_con_problema" }), HOY)), [6]);
assert.deepEqual(ids(filtrarFacturas(facturas, con({ estado: "pagadas" }), HOY)), [3]);
assert.deepEqual(ids(filtrarFacturas(facturas, con({ estado: "draft" }), HOY)), [7]);
assert.ok(
  ESTADO_FILTROS.every((e) => e.etiqueta.length > 0 && e.valor.length > 0),
  "todo filtro de estado tiene etiqueta visible",
);

// ── Tipo y fechas ────────────────────────────────────────────────────────
assert.deepEqual(ids(filtrarFacturas(facturas, con({ tipo: "in_invoice" }), HOY)), [5]);
assert.deepEqual(
  ids(filtrarFacturas(facturas, con({ desde: "2026-08-01" }), HOY)),
  [1, 2, 3, 4, 6],
  "un rango con tope saca la de julio y también la que no tiene fecha",
);
assert.deepEqual(ids(filtrarFacturas(facturas, con({ hasta: "2026-07-31" }), HOY)), [5]);
assert.deepEqual(
  ids(filtrarFacturas(facturas, con({ desde: "2026-08-01", hasta: "2026-08-31" }), HOY)),
  [1, 2, 3, 4, 6],
);
assert.deepEqual(
  ids(filtrarFacturas(facturas, CRITERIOS_INICIALES, HOY)).length,
  facturas.length,
  "sin criterios no se filtra nada",
);

// ── Orden ────────────────────────────────────────────────────────────────
const antes = ids(facturas);
const porMonto = ordenarFacturas(facturas, "monto_total", "desc");
assert.equal(porMonto[0].odoo_id, 1, "la de $5.000 va primera al ordenar por monto desc");
assert.equal(ordenarFacturas(facturas, "monto_total", "asc")[0].monto_total, 1000);
assert.deepEqual(ids(facturas), antes, "ordenar NO puede mutar el arreglo que llega del servidor");

for (const sentido of ["asc", "desc"] as const) {
  const orden = ordenarFacturas(facturas, "fecha_factura", sentido);
  assert.equal(
    orden[orden.length - 1].odoo_id,
    7,
    `la factura sin fecha va al final también en ${sentido}`,
  );
}
assert.equal(
  ordenarFacturas(facturas, "partner_nombre", "asc")[0].partner_nombre,
  "Atrasado SpA",
  "el orden por texto es alfabético en español",
);

// ── Totales del resumen ──────────────────────────────────────────────────
const soloCedidas = filtrarFacturas(facturas, con({ estado: "cedidas" }), HOY);
const resumen = resumirFacturas(soloCedidas, HOY);
assert.equal(resumen.cantidad, 1);
assert.equal(resumen.total, 5000);
assert.equal(resumen.cedidas, 1);
assert.equal(resumen.montoCedido, 5000);

const todo = resumirFacturas(facturas, HOY);
assert.equal(todo.cantidad, 7);
assert.equal(todo.vencidas, 1, "solo la #4 está vencida sin pagar");
assert.equal(todo.montoVencido, 2000, "el monto vencido es el PENDIENTE, no el total");
assert.equal(
  todo.total,
  facturas.reduce((a, f) => a + f.monto_total, 0),
);

// ── Vencimiento y atraso ─────────────────────────────────────────────────
assert.equal(estaVencida(factura({ odoo_id: 9, payment_state: "paid", fecha_vencimiento: "2020-01-01" }), HOY), false);
assert.equal(estaVencida(factura({ odoo_id: 9, fecha_vencimiento: null }), HOY), false, "sin vencimiento no vence");
assert.equal(diasDeAtraso(factura({ odoo_id: 9, fecha_vencimiento: "2026-09-01" }), HOY), 6);
assert.equal(diasDeAtraso(factura({ odoo_id: 9, fecha_vencimiento: "2026-09-10" }), HOY), -3);
assert.equal(diasDeAtraso(factura({ odoo_id: 9, fecha_vencimiento: null }), HOY), null);
assert.match(hoyEnChileIso(), /^\d{4}-\d{2}-\d{2}$/, "hoyEnChileIso devuelve una fecha comparable con las de Odoo");

// ── Que el sync realmente pida los campos ────────────────────────────────
const sync = readFileSync(new URL("../lib/panel-odoo/sincronizar-facturas.ts", import.meta.url), "utf8");
for (const campo of [
  "l10n_cl_aec_yielded",
  "l10n_cl_yielded_invoice_id",
  "l10n_cl_dte_status",
  "l10n_cl_dte_acceptation_status",
  "l10n_cl_claim",
  "l10n_latam_document_type_id",
  "amount_untaxed",
  "amount_tax",
  "partner_id_vat",
]) {
  assert.ok(
    sync.includes(`"${campo}"`),
    `sincronizar-facturas.ts tiene que pedirle ${campo} a Odoo: sin eso la columna queda siempre nula`,
  );
}

// Y que las columnas nuevas se guarden Y se lean: el select del listado tiene que traer
// lo mismo que FilaFactura declara, o la pantalla muestra undefined.
const datos = readFileSync(new URL("../lib/panel-odoo/datos.ts", import.meta.url), "utf8");
const select = datos.slice(datos.indexOf("listarFacturasParaDetalle"));
for (const columna of ["cedida", "dte_estado", "dte_aceptacion", "reclamo", "tipo_documento", "monto_neto", "rut_contraparte"]) {
  assert.ok(sync.includes(`${columna}:`), `el upsert tiene que escribir ${columna}`);
  assert.ok(select.includes(columna), `el select de listarFacturasParaDetalle tiene que traer ${columna}`);
}

console.log("Detalle de facturas del Panel Odoo: filtros, orden, totales y campos de cesión, todo verificado.");
