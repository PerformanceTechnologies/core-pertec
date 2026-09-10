/**
 * El detalle de CRM del Panel Odoo: estado, filtros, embudo y series.
 *
 * Correr con:  npm run probar-crm
 *
 * Lo que decide qué se ve vive en lib/panel-odoo/crm-filtro.ts y crm-series.ts, puros y
 * sin React. Lo que se prueba no es que las funciones existan, sino cada regla que se
 * puede romper sin que se note en pantalla:
 *
 *  - de dónde sale "ganada / perdida / abierta": Odoo lo dice de tres formas distintas
 *    según la versión, y la que importa es la fea — una oportunidad PERDIDA está
 *    ARCHIVADA (active = false), y por eso el panel no podía mostrar ninguna conversión:
 *    la sincronización pedía solo las activas;
 *  - que el embudo respete el orden real de las etapas de Odoo y no el monto ni el
 *    alfabético, que dan un gráfico que se ve igual y no significa nada;
 *  - que las creadas se cuenten por su fecha de creación y las cerradas por su fecha de
 *    CIERRE, o un buen mes de cierres se le atribuye al mes en que entraron los leads;
 *  - "estancada", que es la única pregunta de un pipeline sobre la que hay que hacer algo;
 *  - y que los avisos de datos faltantes cuenten de verdad, porque en este CRM la mayoría
 *    de las oportunidades no tiene monto y sin decirlo los gráficos parecen roto el panel.
 *
 * Además se verifica contra el fuente que la sincronización pida las archivadas.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FilaLead } from "../lib/panel-odoo/datos";
import {
  DIAS_PARA_ESTANCARSE,
  CRITERIOS_INICIALES,
  ESTADO_FILTROS,
  diasDesde,
  estaAtrasada,
  estaEstancada,
  filtrarLeads,
  conEstadoPorOmision,
  hoyEnChileIso,
  ordenarLeads,
  resumirLeads,
  sinActividad,
  sinMonto,
  type Criterios,
} from "../lib/panel-odoo/crm-filtro";
import {
  TRAMOS_DE_ANTIGUEDAD,
  antiguedadDelPipeline,
  avisosDeCalidad,
  embudo,
  mesesEntre,
  motivosDePerdida,
  porEstado,
  porVendedor,
  rangoDelMes,
  tendenciaMensual,
} from "../lib/panel-odoo/crm-series";
import { estadoDelLead, resolverCamposLead, camposAPedirDeLead } from "../lib/panel-odoo/sincronizar-crm";

const HOY = "2026-09-10";

function lead(parcial: Partial<FilaLead> & { odoo_id: number }): FilaLead {
  return {
    tipo: "opportunity",
    nombre: `Oportunidad ${parcial.odoo_id}`,
    partner_nombre: "Minera Uno",
    contacto: null,
    etapa: "New",
    etapa_secuencia: 1,
    estado: "abierta",
    activa: true,
    motivo_perdida: null,
    monto_esperado: 1000000,
    monto_ponderado: 500000,
    probabilidad: 50,
    vendedor: "Harris Gallardo",
    equipo: "Ventas",
    prioridad: null,
    origen: null,
    medio: null,
    campana: null,
    etiquetas: null,
    correo: null,
    telefono: null,
    ciudad: null,
    fecha_creacion: "2026-09-01 10:00:00+00",
    fecha_cierre_estimada: null,
    fecha_cierre_real: null,
    fecha_ultimo_movimiento: "2026-09-05 10:00:00+00",
    dias_para_cerrar: null,
    actividad_proxima: "2026-09-15",
    actividad_resumen: null,
    actividad_tipo: null,
    ...parcial,
  };
}

const con = (parcial: Partial<Criterios>): Criterios => ({ ...CRITERIOS_INICIALES, ...parcial });
const ids = (ls: FilaLead[]) => ls.map((l) => l.odoo_id);

// ── De dónde sale el estado ──────────────────────────────────────────────
const etapas = new Map([
  ["New", { secuencia: 1, esGanada: false }],
  ["Proposition", { secuencia: 2, esGanada: false }],
  ["Won", { secuencia: 3, esGanada: true }],
]);

assert.equal(
  estadoDelLead({ estadoGanada: "won", activa: true, etapa: "New", probabilidad: 10 }, etapas),
  "ganada",
  "won_status manda por encima de todo lo demás",
);
assert.equal(
  estadoDelLead({ estadoGanada: "lost", activa: true, etapa: "New", probabilidad: 100 }, etapas),
  "perdida",
);
assert.equal(
  estadoDelLead({ estadoGanada: null, activa: true, etapa: "Won", probabilidad: 100 }, etapas),
  "ganada",
  "sin won_status, la etapa marcada como ganadora en crm.stage",
);
assert.equal(
  estadoDelLead({ estadoGanada: null, activa: false, etapa: "Proposition", probabilidad: 0 }, etapas),
  "perdida",
  "archivada = perdida: es como Odoo guarda una oportunidad perdida",
);
assert.equal(
  estadoDelLead({ estadoGanada: null, activa: true, etapa: "Proposition", probabilidad: 64 }, etapas),
  "abierta",
);
assert.equal(
  estadoDelLead({ estadoGanada: null, activa: false, etapa: "Won", probabilidad: 100 }, etapas),
  "ganada",
  "una ganada archivada sigue siendo ganada, no perdida",
);

// ── Los campos se piden por lo que Odoo tiene ────────────────────────────
const comoFieldsGet = (...nombres: string[]) => Object.fromEntries(nombres.map((n) => [n, { type: "char" }]));
const camposViejos = resolverCamposLead(
  comoFieldsGet("name", "stage_id", "active", "lost_reason", "expected_revenue", "probability", "user_id"),
);
assert.equal(camposViejos.motivoPerdida, "lost_reason", "en las versiones viejas el motivo es lost_reason");
assert.equal(camposViejos.estadoGanada, null, "y no hay won_status: el estado se deriva de la etapa y de active");
const camposNuevos = resolverCamposLead(
  comoFieldsGet("name", "stage_id", "active", "lost_reason_id", "won_status", "prorated_revenue", "expected_revenue"),
);
assert.equal(camposNuevos.motivoPerdida, "lost_reason_id");
assert.equal(camposNuevos.estadoGanada, "won_status");
assert.ok(!camposAPedirDeLead(camposNuevos).includes("lost_reason"), "no se le pide a Odoo un campo que no existe");
assert.throws(
  () => resolverCamposLead(comoFieldsGet("stage_id", "active")),
  /crm\.lead ya no tiene el campo del nombre/,
  "sin el nombre no hay nada que listar, y el error tiene que decirlo",
);

// ── El universo de prueba ────────────────────────────────────────────────
const leads: FilaLead[] = [
  lead({ odoo_id: 1, etapa: "New", etapa_secuencia: 1 }),
  lead({ odoo_id: 2, etapa: "Proposition", etapa_secuencia: 2, monto_esperado: 4000000, monto_ponderado: 2000000 }),
  // Estancada: último movimiento hace más de un mes.
  lead({ odoo_id: 3, etapa: "Proposition", etapa_secuencia: 2, fecha_ultimo_movimiento: "2026-06-01 10:00:00+00" }),
  // Sin monto y sin actividad.
  lead({ odoo_id: 4, monto_esperado: 0, monto_ponderado: 0, actividad_proxima: null }),
  // Con el cierre estimado vencido.
  lead({ odoo_id: 5, fecha_cierre_estimada: "2026-08-01" }),
  // Ganada y perdida, con fecha de cierre en otro mes que el de creación.
  lead({
    odoo_id: 6,
    estado: "ganada",
    etapa: "Won",
    etapa_secuencia: 3,
    fecha_creacion: "2026-07-02 10:00:00+00",
    fecha_cierre_real: "2026-08-20 10:00:00+00",
    monto_esperado: 9000000,
  }),
  lead({
    odoo_id: 7,
    estado: "perdida",
    activa: false,
    motivo_perdida: "Precio",
    fecha_creacion: "2026-07-05 10:00:00+00",
    fecha_cierre_real: "2026-08-25 10:00:00+00",
  }),
  lead({ odoo_id: 8, estado: "perdida", activa: false, motivo_perdida: null, fecha_creacion: "2026-08-01 10:00:00+00", fecha_cierre_real: "2026-08-28 10:00:00+00" }),
  lead({ odoo_id: 9, vendedor: "Alfonso Hachim", partner_nombre: "Constructora Peñalolén" }),
  lead({ odoo_id: 10, vendedor: null, partner_nombre: null, tipo: "lead" }),
];

// ── Buscar y filtrar ─────────────────────────────────────────────────────
assert.deepEqual(
  ids(filtrarLeads(leads, con({ texto: "penalolen" }), HOY)),
  [9],
  "buscar sin tildes tiene que encontrar 'Peñalolén'",
);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "ganada" }), HOY)), [6]);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "perdida" }), HOY)), [7, 8]);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "cerradas" }), HOY)), [6, 7, 8]);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "estancadas" }), HOY)), [3]);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "atrasadas" }), HOY)), [5]);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "sin_actividad" }), HOY)), [4]);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "sin_monto" }), HOY)), [4]);
assert.deepEqual(ids(filtrarLeads(leads, con({ estado: "lead" }), HOY)), [10]);
assert.deepEqual(ids(filtrarLeads(leads, con({ etapa: "Proposition" }), HOY)), [2, 3]);
assert.deepEqual(ids(filtrarLeads(leads, con({ vendedor: "Alfonso Hachim" }), HOY)), [9]);
assert.deepEqual(
  ids(filtrarLeads(leads, con({ vendedor: "Sin asignar" }), HOY)),
  [10],
  "el vendedor vacío se filtra como 'Sin asignar', que es lo que muestra el desplegable",
);
assert.deepEqual(
  ids(filtrarLeads(leads, con(rangoDelMes("2026-07")), HOY)),
  [6, 7],
  "el rango es por fecha de CREACIÓN: la ganada de julio entra aunque haya cerrado en agosto",
);
assert.equal(filtrarLeads(leads, CRITERIOS_INICIALES, HOY).length, leads.length, "sin criterios no se filtra nada");
for (const filtro of ESTADO_FILTROS) {
  assert.ok(filtro.etiqueta.length > 0 && filtro.valor.length > 0, "todo filtro tiene etiqueta visible");
}

// ── Estancada, atrasada y lo que falta ───────────────────────────────────
assert.equal(estaEstancada(leads[2], HOY), true);
assert.equal(
  estaEstancada(lead({ odoo_id: 20, estado: "ganada", fecha_ultimo_movimiento: "2026-01-01 10:00:00+00" }), HOY),
  false,
  "una ganada vieja no está estancada, está cerrada",
);
assert.equal(
  estaEstancada(lead({ odoo_id: 21, fecha_ultimo_movimiento: null, fecha_creacion: "2026-01-01 10:00:00+00" }), HOY),
  true,
  "sin último movimiento se mide desde la creación",
);
assert.equal(
  estaEstancada(
    lead({ odoo_id: 22, fecha_ultimo_movimiento: `${HOY.slice(0, 8)}01 10:00:00+00` }),
    HOY,
  ),
  false,
  `${DIAS_PARA_ESTANCARSE - 1} días todavía no es estancada`,
);
assert.equal(estaAtrasada(leads[4], HOY), true);
assert.equal(
  estaAtrasada(lead({ odoo_id: 23, estado: "ganada", fecha_cierre_estimada: "2020-01-01" }), HOY),
  false,
  "una cerrada no puede estar atrasada",
);
assert.equal(sinActividad(leads[3]), true);
assert.equal(sinMonto(leads[3]), true);
assert.equal(sinMonto(lead({ odoo_id: 24, estado: "perdida", monto_esperado: 0 })), false, "solo cuentan las abiertas");
assert.equal(diasDesde("2026-09-01 23:00:00+00", HOY), 9, "los días se cuentan por fecha, sin la hora");
assert.equal(diasDesde(null, HOY), null);

// ── Orden ────────────────────────────────────────────────────────────────
const antes = ids(leads);
assert.equal(ordenarLeads(leads, "monto_esperado", "desc")[0].odoo_id, 6);
assert.deepEqual(ids(leads), antes, "ordenar NO puede mutar el arreglo del servidor");
assert.equal(
  ordenarLeads(leads, "etapa_secuencia", "asc")[0].etapa_secuencia,
  1,
  "por etapa se ordena por la secuencia de Odoo, no por el nombre",
);
for (const sentido of ["asc", "desc"] as const) {
  const orden = ordenarLeads(leads, "fecha_cierre_estimada", sentido);
  assert.equal(
    orden[orden.length - 1].fecha_cierre_estimada,
    null,
    `los nulos van al final también en ${sentido}`,
  );
}

// ── Resumen y conversión ─────────────────────────────────────────────────
const resumen = resumirLeads(leads, HOY);
assert.equal(resumen.abiertas, 7);
assert.equal(resumen.ganadas, 1);
assert.equal(resumen.perdidas, 2);
assert.equal(resumen.tasaDeConversion, 1 / 3, "la conversión es ganadas sobre CERRADAS, no sobre el total");
assert.equal(resumen.montoGanado, 9000000);
assert.equal(
  resumen.montoAbierto,
  leads.filter((l) => l.estado === "abierta").reduce((a, l) => a + l.monto_esperado, 0),
);
assert.equal(resumen.estancadas, 1);
assert.equal(resumen.atrasadas, 1);
assert.equal(
  resumirLeads(leads.filter((l) => l.estado === "abierta"), HOY).tasaDeConversion,
  null,
  "sin ninguna cerrada la conversión es null, no 0: 0% dice algo distinto a 'todavía no se sabe'",
);

// ── El embudo ────────────────────────────────────────────────────────────
const escalones = embudo(leads);
assert.deepEqual(
  escalones.map((e) => e.etapa),
  ["New", "Proposition"],
  "el embudo es solo de ABIERTAS: la etapa Won no aparece porque esa oportunidad ya cerró",
);
assert.deepEqual(
  escalones.map((e) => e.cantidad),
  [5, 2],
);
// Y el orden es el de Odoo, no el del monto: Proposition tiene más monto y va SEGUNDA.
const porMonto = [...escalones].sort((a, b) => b.monto - a.monto);
assert.notDeepEqual(
  escalones.map((e) => e.etapa),
  porMonto.map((e) => e.etapa),
  "si el embudo quedara ordenado por monto, esta prueba no distinguiría nada",
);
assert.equal(escalones[1].monto, 5000000);
assert.equal(escalones[1].montoPonderado, 2500000);
// Una etapa sin secuencia (recién creada en Odoo y todavía no sincronizada) va al final.
const conEtapaNueva = embudo([...leads, lead({ odoo_id: 30, etapa: "Zzz nueva", etapa_secuencia: null })]);
assert.equal(conEtapaNueva[conEtapaNueva.length - 1].etapa, "Zzz nueva");

// ── La tendencia ─────────────────────────────────────────────────────────
const tendencia = tendenciaMensual(leads);
assert.deepEqual(
  tendencia.map((p) => p.mes),
  ["2026-07", "2026-08", "2026-09"],
  "los meses sin nada aparecen igual: si no, la línea une julio con septiembre",
);
const julio = tendencia[0];
const agosto = tendencia[1];
assert.equal(julio.creadas, 2, "la ganada y una perdida se CREARON en julio");
assert.equal(julio.ganadas, 0, "pero no cerraron en julio");
assert.equal(agosto.ganadas, 1, "cerraron en agosto, y ahí se cuentan");
assert.equal(agosto.perdidas, 2);
assert.equal(agosto.montoGanado, 9000000);
assert.equal(agosto.creadas, 1);
assert.deepEqual(tendenciaMensual([]), [], "sin leads no hay serie");
assert.deepEqual(mesesEntre("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
assert.deepEqual(rangoDelMes("2024-02"), { desde: "2024-02-01", hasta: "2024-02-29" }, "febrero bisiesto");
// Una cerrada sin fecha de cierre cae en su mes de creación antes que desaparecer.
const sinFechaDeCierre = tendenciaMensual([
  lead({ odoo_id: 31, estado: "ganada", fecha_creacion: "2026-05-10 10:00:00+00", fecha_cierre_real: null }),
]);
assert.equal(sinFechaDeCierre[0].ganadas, 1);

// ── Reparto, motivos y vendedores ────────────────────────────────────────
const estados = porEstado(leads);
assert.deepEqual(
  estados.map((p) => [p.etiqueta, p.cantidad]),
  [
    ["Ganadas", 1],
    ["Perdidas", 2],
    ["Abiertas", 7],
  ],
);
assert.equal(
  estados.reduce((a, p) => a + p.cantidad, 0),
  leads.length,
  "el reparto no puede perder oportunidades",
);
for (const porcion of estados) {
  assert.ok(
    ESTADO_FILTROS.some((e) => e.valor === porcion.filtro),
    `la porción "${porcion.etiqueta}" apunta a un filtro que no existe: ${porcion.filtro}`,
  );
}

const motivos = motivosDePerdida(leads);
assert.deepEqual(
  motivos.map((m) => [m.etiqueta, m.cantidad]),
  [
    ["Precio", 1],
    ["Sin motivo anotado", 1],
  ],
  "una perdida sin motivo se cuenta como 'sin motivo anotado': eso también es un dato",
);

const vendedores = porVendedor(leads);
assert.equal(vendedores[0].nombre, "Harris Gallardo");
assert.equal(vendedores[0].abiertas, 5);
assert.equal(vendedores[0].ganadas, 1);
assert.equal(vendedores[0].perdidas, 2);
assert.ok(
  vendedores.some((v) => v.nombre === "Sin asignar"),
  "las que no tienen vendedor no se pierden del ranking",
);
assert.equal(porVendedor(leads, 1).length, 1, "el tope se respeta");

// ── Antigüedad ───────────────────────────────────────────────────────────
const tramos = antiguedadDelPipeline(leads, HOY);
assert.equal(tramos.length, TRAMOS_DE_ANTIGUEDAD.length, "los cinco tramos se dibujan siempre");
assert.equal(
  tramos.reduce((a, t) => a + t.cantidad, 0),
  7,
  "solo las abiertas entran en la antigüedad del pipeline",
);
assert.equal(tramos[3].cantidad + tramos[4].cantidad, 1, "la estancada de junio cae en un tramo viejo");

// ── Los avisos de datos que faltan ───────────────────────────────────────
const avisos = avisosDeCalidad(leads, HOY);
const porFiltro = new Map(avisos.map((a) => [a.filtro, a.cantidad]));
assert.equal(porFiltro.get("sin_monto"), 1);
assert.equal(porFiltro.get("sin_actividad"), 1);
assert.equal(porFiltro.get("estancadas"), 1);
assert.equal(porFiltro.get("atrasadas"), 1);
for (const aviso of avisos) {
  // Cada aviso tiene que ser clickeable de verdad: su filtro tiene que existir y mostrar
  // exactamente lo que el aviso dice.
  const filtro = ESTADO_FILTROS.find((e) => e.valor === aviso.filtro);
  assert.ok(filtro, `el aviso "${aviso.texto}" apunta a un filtro que no existe`);
  assert.equal(
    filtrarLeads(leads, con({ estado: aviso.filtro }), HOY).length,
    aviso.cantidad,
    `el aviso "${aviso.texto}" dice ${aviso.cantidad} y su filtro muestra otra cantidad`,
  );
}
assert.deepEqual(
  avisosDeCalidad([lead({ odoo_id: 40 })], HOY),
  [],
  "sin nada que avisar no se dibuja el bloque",
);

// ── Las filas viejas de la cache, sin estado ────────────────────────────
//
// Entre desplegar esto y la primera corrida del cron, la cache tiene filas con estado en
// null. Sin relleno la pantalla se ve rota: todo en "—", embudo vacío y conversión sin
// calcular.
const viejas = conEstadoPorOmision([
  { ...lead({ odoo_id: 50 }), estado: null },
  { ...lead({ odoo_id: 51 }), estado: null, activa: false },
  { ...lead({ odoo_id: 52 }), estado: "ganada" },
]);
assert.deepEqual(
  viejas.map((l) => l.estado),
  ["abierta", "perdida", "ganada"],
  "la sincronización vieja solo traía activas, así que una fila sin estado es una abierta",
);
assert.equal(embudo(viejas).length, 1, "y con eso el embudo se dibuja igual antes del primer sync");

assert.match(hoyEnChileIso(), /^\d{4}-\d{2}-\d{2}$/);

// ── Que la sincronización pida las archivadas ───────────────────────────
//
// Es la línea de la que depende todo lo de arriba: sin las archivadas no hay perdidas, y
// sin perdidas no hay conversión ni motivos. Se comprueba en el fuente porque no se puede
// probar contra Odoo desde acá.
const sync = readFileSync(new URL("../lib/panel-odoo/sincronizar-crm.ts", import.meta.url), "utf8");
assert.ok(
  /"in",\s*\[true,\s*false\]/.test(sync),
  'la sincronización tiene que pedir active in [true, false]: las oportunidades PERDIDAS están archivadas',
);
assert.ok(sync.includes('"crm.stage"'), "y leer crm.stage, de donde sale el orden del embudo");
assert.ok(sync.includes('"crm.tag"'), "y crm.tag, para que las etiquetas no queden como ids");

console.log(
  "CRM: estado (ganada/perdida/abierta), campos según la versión de Odoo, filtros, orden, " +
    "embudo en el orden real, tendencia por fecha de cierre, motivos, vendedores, antigüedad y avisos.",
);
