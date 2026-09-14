/**
 * El detalle de Gastos del Panel Odoo.
 *
 * Correr con:  npm run probar-gastos
 *
 * Lo que decide qué se ve vive en lib/panel-odoo/gastos-filtro.ts y gastos-series.ts,
 * puros y sin React. Lo que se prueba es cada regla que se puede romper sin que se note:
 *
 *  - "sin rendir", que es lo que sigue en borrador. En el Odoo real 25 de 41 gastos están
 *    ahí, por $685.896, y la tarjeta solo mostraba "Gastado (mes)": esa plata no aparecía
 *    en ninguna parte;
 *  - "por reembolsar", que es plata que la empresa le debe a una persona, y que NO es lo
 *    mismo que el monto pendiente: un gasto pagado por la empresa también tiene pendiente;
 *  - "sin respaldo", que se lee del contador de adjuntos: los 25 borradores traen 0 y los
 *    16 rendidos traen 1, así que el campo distingue de verdad;
 *  - "sin categoría", que no puede desaparecer del desglose: hoy es la mayoría;
 *  - la antigüedad de los borradores, que solo mira los borradores (hay uno de julio de
 *    2025) y no lo ya tramitado;
 *  - y que los avisos cuenten lo mismo que muestra su filtro.
 *
 * Además se verifica contra el fuente que la sincronización pida los campos por
 * fields_get: casi todo lo que se lee acá son campos custom de este Odoo (pertec_*).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FilaFondo, FilaGasto } from "../lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  DIAS_PARA_OLVIDARSE,
  ESTADO_FILTROS,
  conFondo,
  diasDesde,
  esperandoAprobacion,
  filtrarGastos,
  hoyEnChileIso,
  marcadoDuplicado,
  olvidado,
  ordenarGastos,
  porReembolsar,
  resumirGastos,
  sinCategoria,
  sinRendir,
  sinRespaldo,
  type Criterios,
} from "../lib/panel-odoo/gastos-filtro";
import {
  TRAMOS_SIN_RENDIR,
  antiguedadSinRendir,
  avisos,
  mesesEntre,
  porCategoria,
  porEmpleado,
  porProveedor,
  porTipoDeDocumento,
  rangoDelMes,
  resumirFondos,
  tendenciaMensual,
} from "../lib/panel-odoo/gastos-series";
import { resolverCamposGasto, camposAPedirDeGasto } from "../lib/panel-odoo/sincronizar-gastos";

const HOY = "2026-09-10";

function gasto(parcial: Partial<FilaGasto> & { odoo_id: number }): FilaGasto {
  return {
    descripcion: `Gasto ${parcial.odoo_id}`,
    empleado: "Alexa Vasquez",
    departamento: "Administración",
    aprobador: null,
    monto_total: 10000,
    monto_neto: 8403,
    monto_impuesto: 1597,
    monto_pendiente: 0,
    estado: "in_report",
    estado_aprobacion: null,
    fecha_aprobacion: null,
    forma_pago: "company_account",
    fecha: "2026-09-01",
    categoria: "traslados",
    categoria_odoo: "Gastos varios",
    tipo_documento: "boleta_electronica",
    concepto: null,
    proveedor: "Copec",
    respaldos: 1,
    fondo: null,
    fondo_odoo_id: null,
    atribuido_a: null,
    atribuido_tipo: null,
    contraparte: null,
    proyecto: null,
    tarea: null,
    asiento: null,
    duplicados: 0,
    ...parcial,
  };
}

function fondo(parcial: Partial<FilaFondo> & { odoo_id: number }): FilaFondo {
  return {
    referencia: `FR/2026/000${parcial.odoo_id}`,
    empleado: "Alexa Vasquez",
    descripcion: null,
    motivo: null,
    fecha: "2026-08-01",
    monto_entregado: 100000,
    monto_rendido: 100000,
    saldo: 0,
    estado: "closed",
    ...parcial,
  };
}

const con = (parcial: Partial<Criterios>): Criterios => ({ ...CRITERIOS_INICIALES, ...parcial });

// ── Borrador vs rendido ──────────────────────────────────────────────────
const borrador = gasto({ odoo_id: 1, estado: "draft", categoria: null, respaldos: 0, monto_total: 25000 });
const rendido = gasto({ odoo_id: 2 });
assert.ok(sinRendir(borrador), "un gasto en borrador no salió de la persona que lo cargó");
assert.ok(!sinRendir(rendido), "uno en rendición ya se tramitó");
assert.ok(esperandoAprobacion(gasto({ odoo_id: 3, estado: "submitted" })));

// ── Por reembolsar: NO es lo mismo que tener monto pendiente ─────────────
const dePropioBolsillo = gasto({ odoo_id: 4, forma_pago: "own_account", monto_pendiente: 7000 });
const deLaEmpresa = gasto({ odoo_id: 5, forma_pago: "company_account", monto_pendiente: 7000 });
assert.ok(porReembolsar(dePropioBolsillo), "lo puso la persona y todavía se le debe");
assert.ok(
  !porReembolsar(deLaEmpresa),
  "un gasto de la tarjeta de la empresa con saldo pendiente no es plata que se le deba a nadie",
);
assert.ok(!porReembolsar(gasto({ odoo_id: 6, forma_pago: "own_account", monto_pendiente: 0 })), "ya se le devolvió");

// ── Los avisos de higiene ────────────────────────────────────────────────
assert.ok(sinRespaldo(borrador) && !sinRespaldo(rendido), "el contador de adjuntos distingue de verdad");
assert.ok(!sinRespaldo(gasto({ odoo_id: 7, respaldos: null })), "sin dato no se acusa a nadie de no tener respaldo");
assert.ok(sinCategoria(borrador) && !sinCategoria(rendido));
assert.ok(marcadoDuplicado(gasto({ odoo_id: 8, duplicados: 2 })));
assert.ok(!marcadoDuplicado(gasto({ odoo_id: 9, duplicados: null })));
assert.ok(conFondo(gasto({ odoo_id: 10, fondo: "FR/2026/00014" })));

// ── Olvidado: solo borradores, y solo pasados los 30 días ────────────────
const viejoPeroRendido = gasto({ odoo_id: 11, fecha: "2025-07-27" });
const borradorViejo = gasto({ odoo_id: 12, estado: "draft", fecha: "2025-07-27" });
const borradorDeAyer = gasto({ odoo_id: 13, estado: "draft", fecha: "2026-09-09" });
assert.ok(olvidado(borradorViejo, HOY), "un borrador de hace más de un año está olvidado");
assert.ok(!olvidado(viejoPeroRendido, HOY), "uno viejo pero ya tramitado no espera nada");
assert.ok(!olvidado(borradorDeAyer, HOY), "el de ayer todavía no");
assert.equal(diasDesde("2026-08-11", HOY), 30);
assert.ok(
  olvidado(gasto({ odoo_id: 14, estado: "draft", fecha: "2026-08-11" }), HOY),
  `el borde de los ${DIAS_PARA_OLVIDARSE} días cuenta como olvidado`,
);

// ── Filtros ──────────────────────────────────────────────────────────────
const todos = [borrador, rendido, dePropioBolsillo, borradorViejo, gasto({ odoo_id: 15, proveedor: "Shell", tipo_documento: "factura_electronica", categoria: "alimentacion", empleado: "Otra Persona" })];

assert.equal(filtrarGastos(todos, con({ texto: "shell" }), HOY).length, 1, "el buscador mira el proveedor");
assert.equal(filtrarGastos(todos, con({ texto: "ALEXA" }), HOY).length, 4, "y no distingue mayúsculas");
assert.equal(
  filtrarGastos([gasto({ odoo_id: 16, categoria_odoo: "Alimentación" })], con({ texto: "alimentacion" }), HOY).length,
  1,
  "ni tildes",
);
assert.equal(filtrarGastos(todos, con({ estado: "draft" }), HOY).length, 2);
assert.equal(filtrarGastos(todos, con({ estado: "por_reembolsar" }), HOY).length, 1);
assert.equal(filtrarGastos(todos, con({ estado: "sin_respaldo" }), HOY).length, 1);
assert.equal(filtrarGastos(todos, con({ categoria: "alimentacion" }), HOY).length, 1);
assert.equal(filtrarGastos(todos, con({ tipoDocumento: "factura_electronica" }), HOY).length, 1);
assert.equal(filtrarGastos(todos, con({ proveedor: "Copec" }), HOY).length, 4);
assert.equal(filtrarGastos(todos, con({ empleado: "Otra Persona" }), HOY).length, 1);
assert.equal(
  filtrarGastos(todos, con({ desde: "2026-09-01", hasta: "2026-09-30" }), HOY).length,
  4,
  "el rango de fechas deja afuera el de 2025",
);
assert.equal(
  filtrarGastos(todos, con({ estado: "draft", categoria: "traslados" }), HOY).length,
  1,
  "los filtros se acumulan, no se pisan",
);
for (const filtro of ESTADO_FILTROS) {
  assert.doesNotThrow(() => filtrarGastos(todos, con({ estado: filtro.valor }), HOY), `el filtro ${filtro.valor} revienta`);
}

// ── Orden ────────────────────────────────────────────────────────────────
const porMonto = ordenarGastos(todos, "monto_total", "desc");
assert.equal(porMonto[0].monto_total, 25000);
assert.deepEqual(
  todos.map((g) => g.odoo_id),
  [1, 2, 4, 12, 15],
  "ordenar no puede reordenar el arreglo que llegó del servidor",
);
const conNulo = ordenarGastos([gasto({ odoo_id: 17, proveedor: null }), gasto({ odoo_id: 18, proveedor: "Aa" })], "proveedor", "asc");
assert.equal(conNulo[1].odoo_id, 17, "los nulos van al final aunque el orden sea ascendente");
assert.equal(
  ordenarGastos([gasto({ odoo_id: 19, proveedor: null }), gasto({ odoo_id: 20, proveedor: "Aa" })], "proveedor", "desc")[1].odoo_id,
  19,
  "y también descendente",
);

// ── Resumen ──────────────────────────────────────────────────────────────
const resumen = resumirGastos(todos, HOY);
assert.equal(resumen.cantidad, 5);
assert.equal(resumen.sinRendir, 2);
assert.equal(resumen.montoSinRendir, 35000, "borrador de 25.000 + borrador viejo de 10.000");
assert.equal(resumen.montoPorReembolsar, 7000, "solo lo que se le debe a una persona");
assert.equal(resumen.sinRespaldo, 1);
assert.equal(resumen.sinCategoria, 1);
assert.equal(resumen.olvidados, 1);
assert.equal(resumen.monto, todos.reduce((a, g) => a + g.monto_total, 0));

// ── Tendencia mensual ────────────────────────────────────────────────────
const tendencia = tendenciaMensual([
  gasto({ odoo_id: 21, fecha: "2026-07-05", monto_total: 100 }),
  gasto({ odoo_id: 22, fecha: "2026-09-05", monto_total: 300, estado: "draft" }),
]);
assert.deepEqual(
  tendencia.map((p) => p.mes),
  ["2026-07", "2026-08", "2026-09"],
  "los meses sin gasto igual se dibujan: si no, el eje miente sobre el ritmo",
);
assert.equal(tendencia[0].rendido, 100);
assert.equal(tendencia[0].sinRendir, 0);
assert.equal(tendencia[2].sinRendir, 300, "el borrador no se suma a lo rendido");
assert.equal(tendencia[2].rendido, 0);
assert.deepEqual(tendenciaMensual([]), []);
assert.deepEqual(mesesEntre("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
assert.deepEqual(rangoDelMes("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
assert.deepEqual(rangoDelMes("2028-02"), { desde: "2028-02-01", hasta: "2028-02-29" }, "febrero bisiesto");
assert.deepEqual(rangoDelMes("2026-09"), { desde: "2026-09-01", hasta: "2026-09-30" });

// ── Agrupaciones ─────────────────────────────────────────────────────────
const categorias = porCategoria(todos);
const sinCat = categorias.find((c) => c.clave === "");
assert.ok(sinCat, "los gastos sin categoría se agrupan, no desaparecen del desglose");
assert.equal(sinCat.etiqueta, "Sin categoría");
assert.equal(
  categorias.reduce((a, c) => a + c.monto, 0),
  resumen.monto,
  "la dona tiene que sumar el total de lo filtrado",
);
assert.ok(categorias[0].monto >= categorias[categorias.length - 1].monto, "van de mayor a menor");
assert.equal(porEmpleado(todos).length, 2);
assert.equal(porProveedor(todos).find((p) => p.clave === "Copec")?.cantidad, 4);
assert.equal(porTipoDeDocumento(todos).find((d) => d.clave === "factura_electronica")?.cantidad, 1);
assert.equal(porEmpleado(todos, 1).length, 1, "el tope corta la lista");

// ── Antigüedad de los borradores ─────────────────────────────────────────
const tramos = antiguedadSinRendir(todos, HOY);
assert.equal(tramos.length, TRAMOS_SIN_RENDIR.length);
assert.equal(
  tramos.reduce((a, t) => a + t.cantidad, 0),
  resumen.sinRendir,
  "los tramos tienen que contar exactamente los borradores, ni uno más",
);
assert.equal(tramos[tramos.length - 1].cantidad, 1, "el de 2025 cae en 'más de un año'");
assert.equal(
  antiguedadSinRendir([viejoPeroRendido], HOY).reduce((a, t) => a + t.cantidad, 0),
  0,
  "un gasto viejo pero ya tramitado no ocupa ningún tramo",
);

// ── Fondos por rendir ────────────────────────────────────────────────────
const fondos = [
  fondo({ odoo_id: 13 }),
  fondo({ odoo_id: 14, estado: "delivered", monto_rendido: 40000, saldo: 60000 }),
];
const plata = resumirFondos(fondos);
assert.equal(plata.entregado, 200000);
assert.equal(plata.rendido, 140000);
assert.equal(plata.abiertos, 1, "solo los entregados y sin cerrar");
assert.equal(plata.saldo, 60000, "el saldo de un fondo ya cerrado no es plata que esté afuera");

// ── Los avisos cuentan lo mismo que muestra su filtro ────────────────────
for (const aviso of avisos(todos, HOY)) {
  const filtro = ESTADO_FILTROS.find((e) => e.valor === aviso.filtro);
  assert.ok(filtro, `el aviso "${aviso.texto}" apunta a un filtro que no existe`);
  assert.equal(
    filtrarGastos(todos, con({ estado: aviso.filtro }), HOY).length,
    aviso.cantidad,
    `el aviso "${aviso.texto}" dice ${aviso.cantidad} y su filtro muestra otra cantidad`,
  );
}
assert.equal(
  avisos(todos, HOY).find((a) => a.filtro === "por_reembolsar")?.monto,
  7000,
  "el aviso de reembolso muestra lo que se debe, no el total del gasto",
);
assert.deepEqual(avisos([rendido], HOY), [], "sin nada que avisar no se dibuja el bloque");

// ── Los campos se piden por lo que Odoo tiene ────────────────────────────
const comoFieldsGet = (...nombres: string[]) => Object.fromEntries(nombres.map((n) => [n, { type: "char" }]));
const conCustom = resolverCamposGasto(
  comoFieldsGet("name", "total_amount", "pertec_proveedor_id", "vendor_id", "nb_attachment", "pertec_categoria"),
);
assert.equal(conCustom.proveedor, "pertec_proveedor_id", "el campo custom de este Odoo va primero");
const soloEstandar = resolverCamposGasto(comoFieldsGet("name", "total_amount", "vendor_id"));
assert.equal(soloEstandar.proveedor, "vendor_id", "sin el custom se cae al estándar en vez de quedarse sin proveedor");
assert.equal(soloEstandar.respaldos, null, "y lo que no existe queda nulo, sin pedírselo a Odoo");
assert.ok(!camposAPedirDeGasto(soloEstandar).includes("nb_attachment"));
assert.throws(
  () => resolverCamposGasto(comoFieldsGet("state", "employee_id")),
  /hr\.expense ya no tiene ninguno de los campos de (descripcion|montoTotal)/,
  "sin descripción ni monto no hay nada que listar, y el error tiene que decirlo",
);

const sync = readFileSync(new URL("../lib/panel-odoo/sincronizar-gastos.ts", import.meta.url), "utf8");
assert.ok(sync.includes("odooCampos"), "la sincronización tiene que preguntarle a Odoo qué campos tiene");
assert.ok(sync.includes('"hr.expense.advance"'), "y traer los fondos por rendir, que son plata de la empresa afuera");

assert.match(hoyEnChileIso(), /^\d{4}-\d{2}-\d{2}$/);

console.log(
  "Gastos: borrador vs rendido, por reembolsar, sin respaldo, sin categoría, repetidos, olvidados, " +
    "filtros y orden, tendencia, categorías, empleados, proveedores, documentos, antigüedad, fondos y avisos.",
);
