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
 *  - y el cruce con el registro del SII que lee Panel Finanzas: que el estado salga de
 *    ahí y no del dte_estado de Odoo (que dice "aceptado por el SII" incluso cuando el
 *    cliente reclamó, porque solo habla del envío), que la llave sea tipo + código de
 *    DTE + folio + RUT y no solo el folio, y que un RUT con puntos o con la k minúscula
 *    cruce igual.
 *
 * Además se verifica contra el fuente que la sincronización pida a Odoo los campos de la
 * cesión y el folio: sin l10n_cl_aec_yielded o sin l10n_latam_document_number en el
 * searchRead, toda la pantalla queda vacía y ningún test de UI lo notaría.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FilaFactura } from "../lib/panel-odoo/datos";
import type { FacturaSiiFila } from "../lib/finanzas";
import {
  claveCruce,
  contarDescuadres,
  cruzarConSii,
  faltaEnElSii,
  hayDescuadreDeMonto,
  normalizarRut,
  tipoSiiDe,
  type FacturaCruzada,
} from "../lib/panel-odoo/cruce-sii";
import { ETIQUETAS_ESTADO } from "../lib/finanzas-estados";
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
    edp_periodo: null,
    hes_numero: null,
    folio: parcial.odoo_id,
    codigo_dte: 33,
    dte_track_id: null,
    dte_envio_receptor: "sent",
    reclamo_detalle: null,
    fecha_entrega: null,
    pagos: 0,
    referencia_pago: null,
    ...parcial,
  };
}

// Una fila del registro del SII como la devuelve Panel Finanzas.
function enElSii(parcial: Partial<FacturaSiiFila> & { folio: number }): FacturaSiiFila {
  return {
    id: `sii-${parcial.folio}`,
    tipo_documento: "venta",
    codigo_dte: 33,
    estado: "registro",
    rut_contraparte: "76929210-1",
    razon_social: "Cliente SpA",
    fecha_docto: "2026-08-01",
    fecha_recepcion: "2026-08-02",
    fecha_acuse: null,
    fecha_reclamo: null,
    monto_exento: null,
    monto_neto: 840,
    monto_iva_recuperable: 160,
    monto_iva_no_recuperable: null,
    monto_total: 1000,
    periodo: "2026-08",
    creado_en: "2026-08-02T00:00:00Z",
    actualizado_en: "2026-08-02T00:00:00Z",
    ...parcial,
  } as FacturaSiiFila;
}

// El universo de arriba sin registro del SII: cruzar con [] deja todo sii: null, que es
// lo que ve una empresa sin registro.
const sinRegistro = (fs: FilaFactura[]): FacturaCruzada[] => cruzarConSii(fs, []);
const cruzada = (parcial: Partial<FilaFactura> & { odoo_id: number }): FacturaCruzada => sinRegistro([factura(parcial)])[0];

const con = (parcial: Partial<Criterios>): Criterios => ({ ...CRITERIOS_INICIALES, ...parcial });

// ── El universo de prueba ────────────────────────────────────────────────
const deOdoo: FilaFactura[] = [
  factura({ odoo_id: 1, partner_nombre: "Minera Peñalolén", cedida: "yielded", monto_total: 5000, monto_pendiente: 5000 }),
  factura({ odoo_id: 2, partner_nombre: "Constructora Sur", cedida: "to_yield" }),
  factura({ odoo_id: 3, partner_nombre: "Cliente Pagado", payment_state: "paid", monto_pendiente: 0, fecha_vencimiento: "2026-01-01" }),
  factura({ odoo_id: 4, partner_nombre: "Atrasado SpA", fecha_vencimiento: "2026-08-01", monto_pendiente: 2000, monto_total: 2000 }),
  factura({ odoo_id: 5, partner_nombre: "Proveedor X", move_type: "in_invoice", fecha_factura: "2026-07-15", dte_estado: null }),
  factura({ odoo_id: 6, partner_nombre: "Reclamador Ltda", dte_aceptacion: "claimed", dte_estado: "objected" }),
  factura({ odoo_id: 7, partner_nombre: null, fecha_factura: null, fecha_vencimiento: null, state: "draft" }),
];
const facturas = sinRegistro(deOdoo);
const ids = (fs: FacturaCruzada[]) => fs.map((f) => f.odoo_id);

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
assert.equal(estaVencida(cruzada({ odoo_id: 9, payment_state: "paid", fecha_vencimiento: "2020-01-01" }), HOY), false);
assert.equal(estaVencida(cruzada({ odoo_id: 9, fecha_vencimiento: null }), HOY), false, "sin vencimiento no vence");
assert.equal(diasDeAtraso(cruzada({ odoo_id: 9, fecha_vencimiento: "2026-09-01" }), HOY), 6);
assert.equal(diasDeAtraso(cruzada({ odoo_id: 9, fecha_vencimiento: "2026-09-10" }), HOY), -3);
assert.equal(diasDeAtraso(cruzada({ odoo_id: 9, fecha_vencimiento: null }), HOY), null);
assert.match(hoyEnChileIso(), /^\d{4}-\d{2}-\d{2}$/, "hoyEnChileIso devuelve una fecha comparable con las de Odoo");

// ── El cruce con el registro del SII (Panel Finanzas) ───────────────────
// Odoo dice "aceptado por el SII" incluso cuando el cliente reclamó: eso solo habla del
// envío. El estado que se muestra sale del registro, y este es el caso que lo prueba.
const odooDiceTodoBien = factura({
  odoo_id: 20,
  folio: 198,
  rut_contraparte: "76.929.210-1", // con puntos: el registro lo trae sin ellos
  dte_estado: "accepted",
  monto_total: 42358564,
});
const registro: FacturaSiiFila[] = [
  enElSii({ folio: 198, estado: "reclamado", fecha_reclamo: "2026-08-20", monto_total: 42358564, razon_social: "Mandante SpA" }),
  enElSii({ folio: 196, estado: "aceptado", fecha_acuse: "2026-07-20", monto_total: 38410464, rut_contraparte: "76051610-4" }),
  enElSii({ folio: 99, estado: "pendiente", tipo_documento: "compra", monto_total: 1000 }),
];

const cruzadas = cruzarConSii(
  [
    odooDiceTodoBien,
    factura({ odoo_id: 21, folio: 196, rut_contraparte: "76051610-4", monto_total: 40000000 }), // monto distinto
    factura({ odoo_id: 22, folio: 500, rut_contraparte: "76929210-1" }), // no está en el registro
    factura({ odoo_id: 23, folio: null, rut_contraparte: "76929210-1" }), // sin folio: no se puede cruzar
    factura({ odoo_id: 24, folio: 99, move_type: "in_invoice", rut_contraparte: "76929210-1", monto_total: 1000 }),
  ],
  registro,
);
const porId = (id: number) => cruzadas.find((f) => f.odoo_id === id)!;

assert.equal(porId(20).sii?.estado, "reclamado", "el estado sale del registro, no del dte_estado de Odoo");
assert.equal(porId(20).dte_estado, "accepted", "y el de Odoo sigue ahí, como dato secundario");
assert.equal(porId(20).sii?.fecha_reclamo, "2026-08-20");
assert.equal(porId(20).sii?.razon_social, "Mandante SpA");
assert.equal(porId(20).diferenciaDeMonto, 0, "los montos calzan");
assert.equal(hayDescuadreDeMonto(porId(20)), false);
assert.equal(faltaEnElSii(porId(20)), false);

assert.equal(porId(21).sii?.estado, "aceptado");
assert.equal(porId(21).diferenciaDeMonto, 38410464 - 40000000);
assert.equal(hayDescuadreDeMonto(porId(21)), true, "1.589.536 de diferencia es un descuadre");

assert.equal(porId(22).sii, null);
assert.equal(faltaEnElSii(porId(22)), true, "contabilizada con folio y sin fila en el registro");
assert.equal(porId(22).diferenciaDeMonto, null);

assert.equal(porId(23).sii, null);
assert.equal(faltaEnElSii(porId(23)), false, "sin folio el cruce nunca se intentó: no es un descuadre");

assert.equal(porId(24).sii?.estado, "pendiente", "una compra cruza contra el registro de compras");

// El folio 99 de compra NO puede cruzar con una venta de folio 99: son series distintas.
const cruceCruzado = cruzarConSii([factura({ odoo_id: 25, folio: 99, move_type: "out_invoice" })], registro);
assert.equal(cruceCruzado[0].sii, null, "venta y compra son series de folios distintas");

// Y una nota de crédito de folio 198 tampoco es la factura 198.
const notaDeCredito = cruzarConSii(
  [factura({ odoo_id: 26, folio: 198, codigo_dte: 61, move_type: "out_refund", rut_contraparte: "76929210-1" })],
  registro,
);
assert.equal(notaDeCredito[0].sii, null, "el código de DTE es parte de la llave");

assert.equal(normalizarRut("76.929.210-1"), "76929210-1");
assert.equal(normalizarRut("77590822-k"), "77590822-K", "la K va mayúscula o el RUT no cruza");
assert.equal(normalizarRut(null), "");
assert.equal(tipoSiiDe("out_refund"), "venta");
assert.equal(tipoSiiDe("in_refund"), "compra");
assert.equal(tipoSiiDe("entry"), null);
assert.equal(claveCruce("venta", 33, null, "1-9"), null, "sin folio no hay llave");
assert.equal(claveCruce("venta", null, 1, "1-9"), null, "sin código de DTE tampoco");
assert.equal(claveCruce(null, 33, 1, "1-9"), null);

// Los filtros del SII, que es la razón de todo esto.
assert.deepEqual(ids(filtrarFacturas(cruzadas, con({ estado: "sii_reclamado" }), HOY)), [20]);
assert.deepEqual(ids(filtrarFacturas(cruzadas, con({ estado: "sii_aceptado" }), HOY)), [21]);
assert.deepEqual(ids(filtrarFacturas(cruzadas, con({ estado: "sin_registro" }), HOY)), [22]);
assert.deepEqual(ids(filtrarFacturas(cruzadas, con({ estado: "descuadre" }), HOY)), [21]);
assert.deepEqual(
  ids(filtrarFacturas(cruzadas, con({ texto: "Mandante" }), HOY)),
  [20],
  "la razón social del SII también es buscable",
);
assert.deepEqual(ids(filtrarFacturas(cruzadas, con({ texto: "198" }), HOY)), [20], "el folio es buscable");

const cuenta = contarDescuadres(cruzadas);
assert.equal(cuenta.reclamadas, 1);
assert.equal(cuenta.montoDistinto, 1);
assert.equal(cuenta.sinRegistro, 1);

// Una empresa sin registro del SII: nada cruza, y NINGUNA queda marcada como descuadre
// (mostrar 300 avisos naranjos por no tener registro sería peor que no mostrar nada).
const sinNada = contarDescuadres(sinRegistro([factura({ odoo_id: 30 })]));
assert.equal(sinNada.reclamadas, 0);
assert.equal(sinNada.montoDistinto, 0);

// Y que las etiquetas del estado sean LAS MISMAS que muestra Panel Finanzas.
for (const estado of ["registro", "aceptado", "pendiente", "no_incluir", "reclamado"]) {
  assert.ok(ETIQUETAS_ESTADO[estado], `falta la etiqueta de ${estado} en lib/finanzas-estados.ts`);
}
const detalle = readFileSync(new URL("../components/panel-odoo/DetalleFacturas.tsx", import.meta.url), "utf8");
assert.ok(
  detalle.includes("finanzas-estados"),
  "el detalle tiene que usar las etiquetas de Panel Finanzas, no una copia propia",
);

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

console.log("Detalle de facturas del Panel Odoo: filtros, orden, totales, cesión y el cruce con el registro del SII, todo verificado.");
