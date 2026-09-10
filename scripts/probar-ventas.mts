/**
 * El detalle de Ventas y Arriendo del Panel Odoo.
 *
 * Correr con:  npm run probar-ventas
 *
 * Lo que decide qué se ve vive en lib/panel-odoo/ventas-filtro.ts y ventas-series.ts,
 * puros y sin React. Lo que se prueba es cada regla que se puede romper sin que se note:
 *
 *  - la distinción entre COTIZACIÓN y venta confirmada. En el Odoo real 47 de 65 órdenes
 *    son cotizaciones abiertas por $573 millones, y la tarjeta mostraba "Ventas (mes) $0"
 *    porque solo contaba lo confirmado del mes;
 *  - "por facturar", que es el número más fuerte de la pantalla: hoy TODAS las órdenes
 *    confirmadas están en "to invoice";
 *  - qué es un arriendo EN CURSO. En este Odoo el campo de estado de arriendo viene en
 *    "draft" también para las ventas normales, así que contar por ese campo sin mirar
 *    `es_arriendo` mete ventas en los gráficos de arriendo;
 *  - "pasado de fecha", que es un equipo que no volvió;
 *  - y que los avisos cuenten lo mismo que muestra su filtro.
 *
 * Además se verifica contra el fuente que la sincronización pida los campos por
 * fields_get: la mitad de lo que se lee son campos custom de este Odoo.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FilaVenta } from "../lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  DIAS_DE_AVISO_DE_ARRIENDO,
  DIAS_PARA_DORMIRSE,
  ESTADO_FILTROS,
  arriendoActivo,
  arriendoAtrasado,
  arriendoPorVencer,
  cotizacionDormida,
  cotizacionVencida,
  diasDesde,
  esConfirmada,
  esCotizacion,
  filtrarVentas,
  hoyEnChileIso,
  ordenarVentas,
  porFacturar,
  resumirVentas,
  type Criterios,
} from "../lib/panel-odoo/ventas-filtro";
import {
  TRAMOS_DE_VENCIMIENTO,
  arriendosPorEstado,
  avisos,
  dondeEstaLaPlata,
  mesesEntre,
  porVendedor,
  rangoDelMes,
  tendenciaMensual,
  vencimientosDeArriendo,
} from "../lib/panel-odoo/ventas-series";
import { resolverCamposVenta, camposAPedirDeVenta } from "../lib/panel-odoo/sincronizar-ventas";

const HOY = "2026-09-10";

function orden(parcial: Partial<FilaVenta> & { odoo_id: number }): FilaVenta {
  return {
    numero: `S0${parcial.odoo_id}`,
    partner_nombre: "Minera Uno",
    fecha_orden: "2026-09-01 10:00:00+00",
    monto_total: 1000000,
    monto_neto: 840336,
    monto_impuesto: 159664,
    monto_facturado: 0,
    monto_por_facturar: 0,
    facturas: 0,
    estado: "sent",
    estado_facturacion: "no",
    vendedor: "Harris Gallardo",
    equipo: "Ventas",
    referencia_cliente: null,
    origen: null,
    oportunidad: null,
    condicion_pago: "30 Days",
    validez_hasta: null,
    fecha_compromiso: null,
    margen: 200000,
    margen_porcentaje: 20,
    margen_bajo: false,
    margen_aprobado: false,
    estado_entrega: null,
    etiquetas: null,
    es_arriendo: false,
    estado_arriendo: "draft",
    fecha_inicio_arriendo: null,
    fecha_fin_arriendo: null,
    fecha_devolucion: null,
    dias_arriendo: null,
    dias_atraso: null,
    tiene_danos: false,
    costo_danos: 0,
    total_liquidacion: 0,
    producto_devuelto: false,
    garantia_estado: null,
    garantia_documento: null,
    ...parcial,
  };
}

const con = (parcial: Partial<Criterios>): Criterios => ({ ...CRITERIOS_INICIALES, ...parcial });
const ids = (vs: FilaVenta[]) => vs.map((v) => v.odoo_id);

// ── Cotización, confirmada y por facturar ────────────────────────────────
assert.equal(esCotizacion(orden({ odoo_id: 1, estado: "draft" })), true);
assert.equal(esCotizacion(orden({ odoo_id: 1, estado: "sent" })), true, "enviada sigue siendo cotización");
assert.equal(esCotizacion(orden({ odoo_id: 1, estado: "sale" })), false);
assert.equal(esConfirmada(orden({ odoo_id: 1, estado: "sale" })), true);
assert.equal(
  porFacturar(orden({ odoo_id: 1, estado: "sale", monto_por_facturar: 500000 })),
  true,
);
assert.equal(
  porFacturar(orden({ odoo_id: 1, estado: "sent", monto_por_facturar: 500000 })),
  false,
  "una cotización no está 'por facturar': todavía no se vendió",
);
assert.equal(porFacturar(orden({ odoo_id: 1, estado: "sale", monto_por_facturar: 0 })), false);

// ── Qué es un arriendo en curso ──────────────────────────────────────────
const enCurso = orden({ odoo_id: 2, es_arriendo: true, estado: "sale", estado_arriendo: "confirmed" });
assert.equal(arriendoActivo(enCurso), true);
assert.equal(
  arriendoActivo(orden({ odoo_id: 3, es_arriendo: false, estado_arriendo: "confirmed" })),
  false,
  "en este Odoo el estado de arriendo viene lleno también en ventas normales: sin mirar es_arriendo, una venta se cuenta como arriendo",
);
assert.equal(
  arriendoActivo(orden({ odoo_id: 4, es_arriendo: true, estado_arriendo: "draft" })),
  false,
  "una cotización de arriendo todavía no empezó",
);
assert.equal(
  arriendoActivo(orden({ odoo_id: 5, es_arriendo: true, estado_arriendo: "returned" })),
  false,
  "uno devuelto ya no está en curso",
);
assert.equal(
  arriendoActivo(orden({ odoo_id: 6, es_arriendo: true, estado_arriendo: "delivered", producto_devuelto: true })),
  false,
  "y el campo de devuelto manda por encima del estado",
);

// ── Atrasos y vencimientos ───────────────────────────────────────────────
const atrasado = orden({
  odoo_id: 7,
  es_arriendo: true,
  estado: "sale",
  estado_arriendo: "delivered",
  fecha_fin_arriendo: "2026-08-20 10:00:00+00",
});
assert.equal(arriendoAtrasado(atrasado, HOY), true);
assert.equal(arriendoPorVencer(atrasado, HOY), false, "uno ya pasado de fecha no está 'por vencer'");
assert.equal(
  arriendoAtrasado(orden({ odoo_id: 8, es_arriendo: true, estado_arriendo: "delivered", dias_atraso: 3 }), HOY),
  true,
  "el campo de días de atraso de Odoo también cuenta, aunque no haya fecha de fin",
);
assert.equal(
  arriendoAtrasado({ ...atrasado, producto_devuelto: true }, HOY),
  false,
  "uno devuelto no puede estar atrasado",
);
const porVencer = orden({
  odoo_id: 9,
  es_arriendo: true,
  estado: "sale",
  estado_arriendo: "confirmed",
  fecha_fin_arriendo: "2026-09-20 10:00:00+00",
});
assert.equal(arriendoPorVencer(porVencer, HOY), true, `vence en 10 días, dentro de los ${DIAS_DE_AVISO_DE_ARRIENDO}`);
assert.equal(
  arriendoPorVencer({ ...porVencer, fecha_fin_arriendo: "2026-11-01 10:00:00+00" }, HOY),
  false,
  "uno que vence en dos meses no es un aviso",
);

// ── Cotizaciones vencidas y dormidas ─────────────────────────────────────
assert.equal(
  cotizacionVencida(orden({ odoo_id: 10, validez_hasta: "2026-08-01" }), HOY),
  true,
);
assert.equal(
  cotizacionVencida(orden({ odoo_id: 11, estado: "sale", validez_hasta: "2020-01-01" }), HOY),
  false,
  "una confirmada no puede tener la validez vencida: ya se cerró",
);
assert.equal(
  cotizacionDormida(orden({ odoo_id: 12, fecha_orden: "2026-06-01 10:00:00+00" }), HOY),
  true,
);
assert.equal(
  cotizacionDormida(orden({ odoo_id: 13, fecha_orden: "2026-09-05 10:00:00+00" }), HOY),
  false,
  `5 días todavía no son ${DIAS_PARA_DORMIRSE}`,
);
assert.equal(diasDesde("2026-09-01 23:00:00+00", HOY), 9, "los días se cuentan por fecha, sin la hora");

// ── El universo de prueba ────────────────────────────────────────────────
const ventas: FilaVenta[] = [
  orden({ odoo_id: 21, estado: "draft", monto_total: 5000000 }),
  orden({ odoo_id: 22, estado: "sent", monto_total: 3000000, validez_hasta: "2026-08-01" }),
  orden({ odoo_id: 23, estado: "sent", monto_total: 2000000, fecha_orden: "2026-06-01 10:00:00+00" }),
  orden({
    odoo_id: 24,
    estado: "sale",
    estado_facturacion: "to invoice",
    monto_total: 8000000,
    monto_por_facturar: 8000000,
    fecha_orden: "2026-08-05 10:00:00+00",
  }),
  orden({
    odoo_id: 25,
    estado: "sale",
    estado_facturacion: "invoiced",
    monto_total: 4000000,
    monto_facturado: 4000000,
    vendedor: "Alfonso Hachim",
    fecha_orden: "2026-08-10 10:00:00+00",
  }),
  orden({
    odoo_id: 26,
    es_arriendo: true,
    estado: "sale",
    estado_arriendo: "delivered",
    monto_total: 12000000,
    fecha_inicio_arriendo: "2026-07-01 10:00:00+00",
    fecha_fin_arriendo: "2026-08-20 10:00:00+00",
    fecha_orden: "2026-07-01 10:00:00+00",
  }),
  orden({
    odoo_id: 27,
    es_arriendo: true,
    estado: "sale",
    estado_arriendo: "confirmed",
    monto_total: 6000000,
    fecha_fin_arriendo: "2026-09-20 10:00:00+00",
    fecha_orden: "2026-09-02 10:00:00+00",
  }),
  orden({
    odoo_id: 28,
    es_arriendo: true,
    estado: "sale",
    estado_arriendo: "returned",
    producto_devuelto: true,
    tiene_danos: true,
    costo_danos: 350000,
    monto_total: 2000000,
    fecha_orden: "2026-07-15 10:00:00+00",
    // Con fecha de fin en el pasado A PROPÓSITO: es el caso que distingue "en curso" de
    // "ya devuelto". Sin fecha, un cálculo que ignore la devolución pasaría igual.
    fecha_inicio_arriendo: "2026-07-15 10:00:00+00",
    fecha_fin_arriendo: "2026-08-15 10:00:00+00",
  }),
  orden({ odoo_id: 29, estado: "sent", margen_bajo: true, margen_porcentaje: 4, monto_total: 1000000 }),
];

// ── Filtros ──────────────────────────────────────────────────────────────
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "cotizaciones" }), HOY)), [21, 22, 23, 29]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "confirmadas" }), HOY)), [24, 25, 26, 27, 28]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "por_facturar" }), HOY)), [24]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "facturadas" }), HOY)), [25]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "arriendos" }), HOY)), [26, 27, 28]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "arriendos_activos" }), HOY)), [26, 27]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "arriendos_atrasados" }), HOY)), [26]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "arriendos_por_vencer" }), HOY)), [27]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "arriendos_devueltos" }), HOY)), [28]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "con_danos" }), HOY)), [28]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "cotizaciones_vencidas" }), HOY)), [22]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "cotizaciones_dormidas" }), HOY)), [23]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "margen_bajo" }), HOY)), [29]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ estado: "ventas" }), HOY)), [21, 22, 23, 24, 25, 29]);
assert.deepEqual(ids(filtrarVentas(ventas, con({ vendedor: "Alfonso Hachim" }), HOY)), [25]);
assert.deepEqual(
  ids(filtrarVentas(ventas, con(rangoDelMes("2026-08")), HOY)),
  [24, 25],
  "el rango es por fecha de la orden",
);
assert.equal(filtrarVentas(ventas, CRITERIOS_INICIALES, HOY).length, ventas.length);
assert.deepEqual(
  ids(filtrarVentas(ventas, con({ texto: "minera uno" }), HOY)).length,
  ventas.length,
  "el cliente es buscable, sin importar mayúsculas",
);
for (const filtro of ESTADO_FILTROS) {
  assert.ok(filtro.etiqueta.length > 0 && filtro.valor.length > 0, "todo filtro tiene etiqueta visible");
}

// ── Orden ────────────────────────────────────────────────────────────────
const antes = ids(ventas);
assert.equal(ordenarVentas(ventas, "monto_total", "desc")[0].odoo_id, 26);
assert.deepEqual(ids(ventas), antes, "ordenar NO puede mutar el arreglo del servidor");
for (const sentido of ["asc", "desc"] as const) {
  const lista = ordenarVentas(ventas, "fecha_fin_arriendo", sentido);
  assert.equal(lista[lista.length - 1].fecha_fin_arriendo, null, `los nulos al final también en ${sentido}`);
}

// ── Resumen ──────────────────────────────────────────────────────────────
const resumen = resumirVentas(ventas, HOY);
assert.equal(resumen.cotizaciones, 4);
assert.equal(resumen.montoCotizado, 11000000);
assert.equal(resumen.confirmadas, 5);
assert.equal(resumen.montoPorFacturar, 8000000);
assert.equal(resumen.montoFacturado, 4000000);
assert.equal(resumen.arriendosActivos, 2);
assert.equal(resumen.montoArriendosActivos, 18000000);
assert.equal(resumen.arriendosAtrasados, 1);
assert.equal(resumen.arriendosPorVencer, 1);
assert.equal(resumen.cotizacionesVencidas, 1);
assert.equal(resumen.conDanos, 1);
assert.equal(resumen.costoDeDanos, 350000);
assert.equal(resumen.tasaDeCierre, 5 / 9, "la tasa de cierre es confirmadas sobre confirmadas + cotizaciones");
assert.equal(
  resumirVentas(ventas.filter(esCotizacion), HOY).tasaDeCierre,
  0,
  "sin ninguna confirmada la tasa es 0",
);
assert.equal(resumirVentas([], HOY).tasaDeCierre, null, "sin órdenes no se sabe: null, no 0");

// ── La tendencia ─────────────────────────────────────────────────────────
const tendencia = tendenciaMensual(ventas);
assert.deepEqual(
  tendencia.map((p) => p.mes),
  ["2026-06", "2026-07", "2026-08", "2026-09"],
  "los meses sin nada aparecen igual",
);
assert.equal(tendencia[0].cotizado, 2000000, "junio: la cotización dormida");
assert.equal(tendencia[1].arrendado, 14000000, "julio: los dos arriendos que se crearon ahí");
assert.equal(tendencia[2].confirmado, 12000000, "agosto: las dos confirmadas");
assert.equal(tendencia[2].cotizado, 0);
assert.deepEqual(tendenciaMensual([]), []);
assert.deepEqual(mesesEntre("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
assert.deepEqual(rangoDelMes("2024-02"), { desde: "2024-02-01", hasta: "2024-02-29" }, "febrero bisiesto");

// ── Dónde está la plata ──────────────────────────────────────────────────
const plata = dondeEstaLaPlata(ventas);
assert.deepEqual(
  plata.map((p) => [p.etiqueta, p.monto]),
  [
    ["Cotizado", 11000000],
    ["Confirmado sin facturar", 8000000],
    ["Ya facturado", 4000000],
  ],
);
for (const porcion of plata) {
  assert.ok(
    ESTADO_FILTROS.some((e) => e.valor === porcion.filtro),
    `la porción "${porcion.etiqueta}" apunta a un filtro que no existe: ${porcion.filtro}`,
  );
}
assert.deepEqual(dondeEstaLaPlata([]), [], "sin plata no se dibuja la dona");

// ── Arriendos por estado ─────────────────────────────────────────────────
const estados = arriendosPorEstado(ventas);
assert.deepEqual(
  estados.map((e) => e.estado).sort(),
  ["confirmed", "delivered", "returned"],
  "solo los que SON arriendo: las seis ventas con estado_arriendo 'draft' no entran",
);
assert.equal(
  estados.reduce((a, e) => a + e.cantidad, 0),
  3,
);

// ── Vendedores ───────────────────────────────────────────────────────────
const vendedores = porVendedor(ventas);
assert.equal(vendedores[0].nombre, "Harris Gallardo", "se ordena por lo confirmado");
assert.equal(vendedores[0].cotizaciones, 4);
assert.equal(vendedores[1].nombre, "Alfonso Hachim");
assert.equal(vendedores[1].montoConfirmado, 4000000);
assert.equal(porVendedor(ventas, 1).length, 1, "el tope se respeta");

// ── Vencimientos ─────────────────────────────────────────────────────────
const tramos = vencimientosDeArriendo(ventas, HOY);
assert.equal(tramos.length, TRAMOS_DE_VENCIMIENTO.length, "los cinco tramos se dibujan siempre");
assert.equal(tramos[0].etiqueta, "Pasado de fecha");
assert.equal(tramos[0].cantidad, 1, "el arriendo que terminó en agosto");
assert.equal(
  tramos.reduce((a, t) => a + t.cantidad, 0),
  2,
  "solo los arriendos EN CURSO tienen vencimiento: el devuelto no",
);
assert.equal(tramos[2].cantidad, 1, "el que vence en 10 días cae en el tramo de 8 a 15");

// ── Los avisos ───────────────────────────────────────────────────────────
const lista = avisos(ventas, HOY);
const porFiltro = new Map(lista.map((a) => [a.filtro, a]));
assert.equal(porFiltro.get("arriendos_atrasados")?.cantidad, 1);
assert.equal(porFiltro.get("por_facturar")?.monto, 8000000, "el aviso de facturar muestra el SALDO, no el total");
assert.equal(porFiltro.get("cotizaciones_vencidas")?.cantidad, 1);
assert.equal(porFiltro.get("cotizaciones_dormidas")?.cantidad, 1);
assert.equal(porFiltro.get("con_danos")?.monto, 350000, "y el de daños, el costo de los daños");
assert.equal(porFiltro.get("margen_bajo")?.cantidad, 1);
for (const aviso of lista) {
  const filtro = ESTADO_FILTROS.find((e) => e.valor === aviso.filtro);
  assert.ok(filtro, `el aviso "${aviso.texto}" apunta a un filtro que no existe`);
  assert.equal(
    filtrarVentas(ventas, con({ estado: aviso.filtro }), HOY).length,
    aviso.cantidad,
    `el aviso "${aviso.texto}" dice ${aviso.cantidad} y su filtro muestra otra cantidad`,
  );
}
assert.deepEqual(avisos([orden({ odoo_id: 40 })], HOY), [], "sin nada que avisar no se dibuja el bloque");

// ── Los campos se piden por lo que Odoo tiene ────────────────────────────
const comoFieldsGet = (...nombres: string[]) => Object.fromEntries(nombres.map((n) => [n, { type: "char" }]));
const conCustom = resolverCamposVenta(
  comoFieldsGet("name", "amount_total", "x_has_rental_lines", "x_rental_state", "x_late_days", "state"),
);
assert.equal(conCustom.esArriendo, "x_has_rental_lines", "el campo custom de este Odoo va primero");
assert.equal(conCustom.diasAtraso, "x_late_days");
const soloEstandar = resolverCamposVenta(
  comoFieldsGet("name", "amount_total", "is_rental_order", "rental_status", "rental_return_date", "state"),
);
assert.equal(
  soloEstandar.esArriendo,
  "is_rental_order",
  "sin los custom, se cae a los del módulo Rental estándar en vez de quedarse sin nada",
);
assert.equal(soloEstandar.diasAtraso, null, "y lo que no existe queda nulo, sin pedírselo a Odoo");
assert.ok(!camposAPedirDeVenta(soloEstandar).includes("x_late_days"));
assert.throws(
  () => resolverCamposVenta(comoFieldsGet("state", "partner_id")),
  /sale\.order ya no tiene ninguno de los campos de (numero|montoTotal)/,
  "sin número ni monto no hay nada que listar, y el error tiene que decirlo",
);

const sync = readFileSync(new URL("../lib/panel-odoo/sincronizar-ventas.ts", import.meta.url), "utf8");
assert.ok(sync.includes("odooCampos"), "la sincronización tiene que preguntarle a Odoo qué campos tiene");
assert.ok(sync.includes('"crm.tag"'), "y resolver las etiquetas a nombre, no dejarlas como ids");

assert.match(hoyEnChileIso(), /^\d{4}-\d{2}-\d{2}$/);

console.log(
  "Ventas y Arriendo: cotización vs confirmada, por facturar, arriendos en curso / atrasados / por vencer, " +
    "cotizaciones vencidas y dormidas, tendencia, dónde está la plata, vendedores, vencimientos y avisos.",
);
