/**
 * El detalle de Proyectos del Panel Odoo: reglas, filtros, orden y series.
 *
 * Correr con:  npm run probar-proyectos
 *
 * Todo lo que decide qué se ve y cómo se cuenta vive en lib/panel-odoo/proyectos-filtro.ts
 * y proyectos-series.ts, puro y sin React, justamente para poder medirlo acá. Lo que se
 * prueba no es que las funciones existan, sino cada regla que se puede romper sin que se
 * note en pantalla:
 *
 *  - que una tarea se cierre por los DOS caminos (el estado nativo de Odoo y el
 *    objetivo_done del panel), que es el error que hacía decir "Completadas 0" con seis
 *    objetivos terminados;
 *  - que "vencida", "estancada" y "pasada de horas" sean tres cosas distintas y ninguna
 *    cuente tareas ya cerradas;
 *  - que las subtareas NO sumen en horas ni en gasto, porque Odoo ya las suma en la madre
 *    y el total salía al doble;
 *  - que buscar funcione sin tildes y sin importar mayúsculas;
 *  - que una tarea sin plazo no se filtre afuera por un rango de fechas: no está fuera del
 *    rango, está sin cargar;
 *  - que ordenar deje los nulos al final en los dos sentidos y NO mute el arreglo que
 *    llega del servidor;
 *  - que una tarea con varios responsables cuente para cada uno en el gráfico de carga.
 *
 * Además se verifica contra el fuente que la sincronización le pida a Odoo los campos del
 * módulo pertec_project_panel: sin ellos la pantalla compila igual y queda con todas las
 * cifras nuevas en cero, y ningún test de UI lo notaría.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FilaProyecto, FilaTarea } from "../lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  DIAS_PARA_ESTANCARSE,
  abierta,
  avisos,
  cancelada,
  cerrada,
  esSubtarea,
  estancada,
  filtrarTareas,
  ordenarTareas,
  pasadaDeHoras,
  porVencer,
  resumirProyectos,
  resumirTareas,
  sinAsignar,
  sinPlazo,
  sobreGastado,
  vencida,
  type Criterios,
} from "../lib/panel-odoo/proyectos-filtro";
import {
  avancePorProyecto,
  etiquetaDeSalud,
  gastoPorCategoria,
  horasPorProyecto,
  horizonteDePlazos,
  masEstancadas,
  porEtapa,
  porResponsable,
  presupuestoPorProyecto,
  saludDeProyectos,
} from "../lib/panel-odoo/proyectos-series";

const HOY = "2026-09-16";

/** Una fecha a N días ANTES de HOY. */
function haceDias(dias: number): string {
  return new Date(Date.parse(`${HOY}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
}
/** Una fecha a N días DESPUÉS de HOY. */
function enDias(dias: number): string {
  return haceDias(-dias);
}

function tarea(parcial: Partial<FilaTarea> & { odoo_id: number }): FilaTarea {
  return {
    proyecto_odoo_id: 1,
    proyecto_nombre: "Plan Harris",
    nombre: `Tarea ${parcial.odoo_id}`,
    etapa: "En curso",
    estado: "01_in_progress",
    fecha_inicio: null,
    fecha_limite: null,
    asignados: "Ana Pérez",
    completado: false,
    color_hex: null,
    gastos_total: 0,
    gastos_cantidad: 0,
    prioridad: null,
    fecha_ultimo_cambio_etapa: null,
    fecha_asignacion: null,
    horas_asignadas: 0,
    horas_gastadas: 0,
    avance: 0,
    padre_odoo_id: null,
    subtareas: 0,
    etiquetas: null,
    cliente: null,
    ...parcial,
  };
}

function proyecto(parcial: Partial<FilaProyecto> & { odoo_id: number }): FilaProyecto {
  return {
    nombre: `Proyecto ${parcial.odoo_id}`,
    partner_nombre: null,
    responsable: null,
    fecha_inicio: null,
    fecha_vencimiento: null,
    etapa: null,
    estado_salud: null,
    fecha_estado_salud: null,
    presupuesto: 0,
    gastado: 0,
    disponible: 0,
    porcentaje_gastado: 0,
    objetivos_total: 0,
    objetivos_hechos: 0,
    gastos_cantidad: 0,
    gastos_por_categoria: [],
    color_hex: null,
    supabase_id: null,
    ...parcial,
  };
}

function criterios(parcial: Partial<Criterios> = {}): Criterios {
  return { ...CRITERIOS_INICIALES, ...parcial };
}

// ── Cierre: los dos caminos ──────────────────────────────────────────────────

assert.equal(cerrada(tarea({ odoo_id: 1 })), false, "una tarea en progreso está abierta");
assert.equal(
  cerrada(tarea({ odoo_id: 2, completado: true })),
  true,
  "un objetivo cumplido está cerrado aunque su estado nativo siga en 01_in_progress",
);
assert.equal(cerrada(tarea({ odoo_id: 3, estado: "1_done" })), true, "el estado nativo también cierra");
assert.equal(cerrada(tarea({ odoo_id: 4, estado: "1_canceled" })), true, "una cancelada está cerrada");
assert.equal(abierta(tarea({ odoo_id: 5 })), true, "abierta es lo contrario de cerrada");
assert.equal(
  cancelada(tarea({ odoo_id: 6, estado: "1_canceled" })),
  true,
  "una cancelada se distingue de una hecha: está cerrada, pero no completada",
);
assert.equal(
  cancelada(tarea({ odoo_id: 7, estado: "1_done" })),
  false,
  "una hecha no es una cancelada",
);

// ── Vencida, estancada y pasada de horas son tres cosas distintas ────────────

assert.equal(vencida(tarea({ odoo_id: 10, fecha_limite: haceDias(1) }), HOY), true, "plazo pasado y abierta");
assert.equal(
  vencida(tarea({ odoo_id: 11, fecha_limite: haceDias(1), completado: true }), HOY),
  false,
  "una cumplida fuera de plazo NO es una pendiente: si contara, el aviso nunca bajaría",
);
assert.equal(vencida(tarea({ odoo_id: 12, fecha_limite: enDias(1) }), HOY), false, "todavía no vence");
assert.equal(vencida(tarea({ odoo_id: 13 }), HOY), false, "sin plazo no puede estar vencida");

assert.equal(porVencer(tarea({ odoo_id: 14, fecha_limite: enDias(3) }), HOY), true, "vence esta semana");
assert.equal(porVencer(tarea({ odoo_id: 15, fecha_limite: enDias(20) }), HOY), false, "todavía falta");
assert.equal(
  porVencer(tarea({ odoo_id: 16, fecha_limite: haceDias(1) }), HOY),
  false,
  "una vencida no está 'por vencer': ya es otro problema",
);

assert.equal(
  estancada(tarea({ odoo_id: 20, fecha_ultimo_cambio_etapa: haceDias(DIAS_PARA_ESTANCARSE + 1) }), HOY),
  true,
  "abierta y sin moverse hace más del umbral",
);
assert.equal(
  estancada(tarea({ odoo_id: 21, fecha_ultimo_cambio_etapa: haceDias(DIAS_PARA_ESTANCARSE) }), HOY),
  false,
  "justo en el umbral todavía no cuenta",
);
assert.equal(
  estancada(tarea({ odoo_id: 22, fecha_ultimo_cambio_etapa: haceDias(90), completado: true }), HOY),
  false,
  "una tarea cerrada no está estancada, está lista",
);
assert.equal(
  estancada(tarea({ odoo_id: 23 }), HOY),
  false,
  "sin el dato de Odoo no se inventa un estancamiento",
);

assert.equal(
  pasadaDeHoras(tarea({ odoo_id: 30, horas_asignadas: 10, horas_gastadas: 12 })),
  true,
  "se pasó de lo planificado",
);
assert.equal(
  pasadaDeHoras(tarea({ odoo_id: 31, horas_asignadas: 0, horas_gastadas: 12 })),
  false,
  "sin plan cualquier hora daría 'excedida' y el aviso no querría decir nada",
);

assert.equal(sinAsignar(tarea({ odoo_id: 40, asignados: null })), true, "sin nadie a cargo");
assert.equal(sinAsignar(tarea({ odoo_id: 41, asignados: "   " })), true, "un espacio en blanco no es un responsable");
assert.equal(
  sinAsignar(tarea({ odoo_id: 42, asignados: null, completado: true })),
  false,
  "una cerrada sin responsable ya no es un pendiente",
);
assert.equal(sinPlazo(tarea({ odoo_id: 43 })), true, "abierta y sin fecha límite");

// ── Subtareas: no se cuentan dos veces ───────────────────────────────────────

assert.equal(esSubtarea(tarea({ odoo_id: 50, padre_odoo_id: 49 })), true, "cuelga de otra tarea");
assert.equal(esSubtarea(tarea({ odoo_id: 51 })), false, "una tarea suelta no es subtarea");

const conSubtarea = [
  tarea({ odoo_id: 60, horas_asignadas: 10, horas_gastadas: 8, gastos_total: 100_000 }),
  tarea({ odoo_id: 61, padre_odoo_id: 60, horas_asignadas: 4, horas_gastadas: 3, gastos_total: 40_000 }),
];
const resumenConSubtarea = resumirTareas(conSubtarea, HOY);
assert.equal(
  resumenConSubtarea.horasGastadas,
  8,
  "las horas de una subtarea ya están sumadas en la madre: contarlas de nuevo duplica el total",
);
assert.equal(resumenConSubtarea.gasto, 100_000, "lo mismo con el gasto");
assert.equal(resumenConSubtarea.cantidad, 2, "pero las dos siguen siendo tareas y se listan");

// ── Filtros ──────────────────────────────────────────────────────────────────

const universo = [
  tarea({ odoo_id: 100, nombre: "Revisión de válvulas", asignados: "Ana Pérez", etapa: "En curso" }),
  tarea({ odoo_id: 101, nombre: "Informe final", asignados: "Beto Muñoz", etapa: "Por hacer", completado: true }),
  tarea({ odoo_id: 102, nombre: "Traslado a faena", asignados: "Ana Pérez, Beto Muñoz", proyecto_nombre: "Plan B" }),
  tarea({ odoo_id: 103, nombre: "Sin dueño", asignados: null, fecha_limite: haceDias(5) }),
];

assert.deepEqual(
  filtrarTareas(universo, criterios({ texto: "valvulas" }), HOY).map((t) => t.odoo_id),
  [100],
  "buscar sin tildes tiene que encontrar 'Revisión de válvulas'",
);
assert.deepEqual(
  filtrarTareas(universo, criterios({ texto: "INFORME" }), HOY).map((t) => t.odoo_id),
  [101],
  "buscar no distingue mayúsculas",
);
assert.deepEqual(
  filtrarTareas(universo, criterios({ responsable: "Beto Muñoz" }), HOY).map((t) => t.odoo_id),
  [101, 102],
  "el responsable se compara por contención: una tarea con dos asignados tiene que aparecer para los dos",
);
assert.deepEqual(
  filtrarTareas(universo, criterios({ proyecto: "Plan B" }), HOY).map((t) => t.odoo_id),
  [102],
  "filtrar por proyecto",
);
assert.deepEqual(
  filtrarTareas(universo, criterios({ estado: "sin_asignar" }), HOY).map((t) => t.odoo_id),
  [103],
  "el filtro de estado usa las mismas reglas que los avisos",
);
assert.deepEqual(
  filtrarTareas(universo, criterios({ estado: "vencidas" }), HOY).map((t) => t.odoo_id),
  [103],
  "vencidas",
);

// Una tarea SIN plazo no se filtra afuera por un rango de fechas.
const conYSinPlazo = [
  tarea({ odoo_id: 110, fecha_limite: "2026-09-10" }),
  tarea({ odoo_id: 111, fecha_limite: "2026-12-01" }),
  tarea({ odoo_id: 112 }),
];
assert.deepEqual(
  filtrarTareas(conYSinPlazo, criterios({ desde: "2026-09-01", hasta: "2026-09-30" }), HOY).map((t) => t.odoo_id),
  [110, 112],
  "sin plazo no está fuera del rango, está sin cargar: para eso existe el filtro 'Sin fecha límite'",
);

// ── Orden ────────────────────────────────────────────────────────────────────

const desordenadas = [
  tarea({ odoo_id: 120, fecha_limite: "2026-10-01" }),
  tarea({ odoo_id: 121 }),
  tarea({ odoo_id: 122, fecha_limite: "2026-09-01" }),
];
const copia = [...desordenadas];
assert.deepEqual(
  ordenarTareas(desordenadas, "fecha_limite", "asc").map((t) => t.odoo_id),
  [122, 120, 121],
  "ascendente: la más próxima primero y el nulo al final",
);
assert.deepEqual(
  ordenarTareas(desordenadas, "fecha_limite", "desc").map((t) => t.odoo_id),
  [120, 122, 121],
  "descendente: el nulo SIGUE al final, no se da vuelta con el resto",
);
assert.deepEqual(desordenadas, copia, "ordenar no muta el arreglo que llega del servidor");

// ── Series ───────────────────────────────────────────────────────────────────

const deDosPersonas = [
  tarea({ odoo_id: 130, asignados: "Ana Pérez, Beto Muñoz" }),
  tarea({ odoo_id: 131, asignados: "Ana Pérez" }),
];
const carga = porResponsable(deDosPersonas);
assert.deepEqual(
  carga.map((g) => [g.etiqueta, g.cantidad]),
  [
    ["Ana Pérez", 2],
    ["Beto Muñoz", 1],
  ],
  "una tarea con dos asignados cuenta para cada uno: la pregunta es cuánto tiene encima cada persona",
);

const mixtas = [
  tarea({ odoo_id: 140, etapa: "En curso" }),
  tarea({ odoo_id: 141, etapa: "En curso", completado: true }),
  tarea({ odoo_id: 142, etapa: "Por hacer" }),
];
const etapas = porEtapa(mixtas);
assert.deepEqual(
  etapas.map((g) => [g.etiqueta, g.cantidad, g.cerradas]),
  [
    ["En curso", 2, 1],
    ["Por hacer", 1, 0],
  ],
  "cada grupo trae su total y cuántas están cerradas, para dibujar el avance dentro de la barra",
);

const horizonte = horizonteDePlazos(
  [
    tarea({ odoo_id: 150, fecha_limite: haceDias(2) }),
    tarea({ odoo_id: 151, fecha_limite: enDias(3) }),
    tarea({ odoo_id: 152, fecha_limite: enDias(20) }),
    tarea({ odoo_id: 153, fecha_limite: enDias(90) }),
    tarea({ odoo_id: 154 }),
    tarea({ odoo_id: 155, fecha_limite: haceDias(2), completado: true }),
  ],
  HOY,
);
assert.deepEqual(
  horizonte.map((t) => [t.etiqueta, t.cantidad]),
  [
    ["Vencidas", 1],
    ["Esta semana", 1],
    ["En 30 días", 1],
    ["Más adelante", 1],
    ["Sin plazo", 1],
  ],
  "los tramos reparten SOLO las abiertas, y la cerrada de hace dos días no aparece",
);

const horas = horasPorProyecto([
  tarea({ odoo_id: 160, proyecto_nombre: "Plan Harris", horas_asignadas: 10, horas_gastadas: 12 }),
  tarea({ odoo_id: 161, proyecto_nombre: "Plan Harris", padre_odoo_id: 160, horas_asignadas: 5, horas_gastadas: 5 }),
  tarea({ odoo_id: 162, proyecto_nombre: "Sin horas" }),
]);
assert.deepEqual(
  horas.map((p) => [p.etiqueta, p.asignadas, p.gastadas]),
  [["Plan Harris", 10, 12]],
  "las horas excluyen subtareas, y un proyecto sin horas cargadas no ensucia el gráfico",
);

const conEstados = [
  proyecto({ odoo_id: 200, nombre: "Va bien", estado_salud: "on_track" }),
  proyecto({ odoo_id: 201, nombre: "Ojo", estado_salud: "at_risk" }),
  proyecto({ odoo_id: 202, nombre: "Sin cargar" }),
];
assert.deepEqual(
  saludDeProyectos(conEstados).map((p) => p.etiqueta),
  ["En riesgo", "Sin estado", "En curso"],
  "lo que necesita atención va primero, y lo que nadie cargó en Odoo se dice en vez de fingir que va bien",
);
assert.equal(etiquetaDeSalud(null), "Sin estado", "sin dato no es un estado válido de Odoo");
assert.equal(etiquetaDeSalud("off_track"), "Fuera de curso", "las claves de Odoo se traducen");

assert.equal(
  sobreGastado(proyecto({ odoo_id: 210, presupuesto: 100, gastado: 120, disponible: -20 })),
  true,
  "se pasó del presupuesto",
);
assert.equal(
  sobreGastado(proyecto({ odoo_id: 211, presupuesto: 0, gastado: 120, disponible: -120 })),
  false,
  "sin presupuesto cargado no se puede decir que se pasó: no hay de qué",
);

const avance = avancePorProyecto([
  proyecto({ odoo_id: 220, nombre: "Casi listo", objetivos_total: 4, objetivos_hechos: 3 }),
  proyecto({ odoo_id: 221, nombre: "Recién parte", objetivos_total: 4, objetivos_hechos: 1 }),
  proyecto({ odoo_id: 222, nombre: "Sin objetivos" }),
]);
assert.deepEqual(
  avance.map((p) => [p.etiqueta, p.avance]),
  [
    ["Recién parte", 25],
    ["Casi listo", 75],
  ],
  "de menor a mayor: arriba queda lo que va más atrás, que es por donde se empieza a mirar",
);

const presupuestos = presupuestoPorProyecto([
  proyecto({ odoo_id: 230, nombre: "Sobregirado", presupuesto: 100, gastado: 130, disponible: -30, porcentaje_gastado: 130 }),
]);
assert.equal(
  presupuestos[0].disponible,
  0,
  "un sobregiro se dibuja con disponible en 0: una barra apilada no puede tener un segmento negativo",
);
assert.equal(presupuestos[0].porcentaje, 130, "pero el porcentaje real se conserva para el tooltip");

const categorias = gastoPorCategoria([
  proyecto({
    odoo_id: 240,
    nombre: "A",
    gastos_por_categoria: [{ key: "traslados", label: "Traslados", amount: 100, percent: 50, color: "#00A080" }],
  }),
  proyecto({
    odoo_id: 241,
    nombre: "B",
    gastos_por_categoria: [{ key: "traslados", label: "Traslados", amount: 50, percent: 50, color: "#00A080" }],
  }),
]);
assert.deepEqual(
  categorias.map((c) => [c.etiqueta, c.monto, c.detalle.length]),
  [["Traslados", 150, 2]],
  "la misma categoría se suma entre proyectos y el detalle dice en cuáles cayó",
);

const quietas = masEstancadas(
  [
    tarea({ odoo_id: 250, nombre: "Vieja", fecha_ultimo_cambio_etapa: haceDias(120) }),
    tarea({ odoo_id: 251, nombre: "Menos vieja", fecha_ultimo_cambio_etapa: haceDias(45) }),
    tarea({ odoo_id: 252, nombre: "Fresca", fecha_ultimo_cambio_etapa: haceDias(2) }),
  ],
  HOY,
);
assert.deepEqual(
  quietas.map((q) => q.tarea),
  ["Vieja", "Menos vieja"],
  "las más quietas primero, y lo que se movió hace poco no aparece",
);

// ── Avisos y resúmenes ───────────────────────────────────────────────────────

const paraAvisos = [
  tarea({ odoo_id: 300, fecha_limite: haceDias(2) }),
  tarea({ odoo_id: 301, asignados: null }),
  tarea({ odoo_id: 302, completado: true }),
];
const lista = avisos(paraAvisos, HOY);
assert.ok(
  lista.every((a) => a.cantidad > 0),
  "un aviso en cero no se muestra: sería ruido",
);
assert.deepEqual(
  lista.map((a) => a.filtro).sort(),
  ["sin_asignar", "sin_plazo", "vencidas"],
  "cada aviso trae el filtro que aplica su clic",
);

const resumenProyectos = resumirProyectos([
  proyecto({ odoo_id: 400, presupuesto: 100, gastado: 40, disponible: 60, objetivos_total: 2, objetivos_hechos: 1 }),
  proyecto({ odoo_id: 401, presupuesto: 50, gastado: 70, disponible: -20, objetivos_total: 2, objetivos_hechos: 2, estado_salud: "at_risk" }),
]);
assert.equal(resumenProyectos.presupuesto, 150, "el presupuesto suma");
assert.equal(resumenProyectos.disponible, 40, "y el disponible también, sobregiro incluido");
assert.equal(resumenProyectos.enRiesgo, 1, "los marcados en riesgo en Odoo se cuentan");
assert.equal(resumenProyectos.sobreGastados, 1, "y los que se pasaron, aparte");
assert.equal(resumenProyectos.objetivosHechos, 3, "los objetivos cumplidos suman entre proyectos");

// ── Que la sincronización pida lo que la pantalla dibuja ─────────────────────
//
// Sin estos campos todo compila igual y la tarjeta queda con las cifras nuevas en cero.

const sync = readFileSync(new URL("../lib/panel-odoo/sincronizar-proyectos.ts", import.meta.url), "utf8");
for (const campo of [
  "presupuesto_inicial",
  "panel_amount_spent",
  "panel_amount_available",
  "panel_percent_spent",
  "panel_obj_total",
  "panel_obj_done",
  "panel_budget_data",
  "objetivo_date_start",
  "objetivo_color",
  "expense_total",
  "expense_count",
  "last_update_status",
  "date_last_stage_update",
  "effective_hours",
  "allocated_hours",
  "parent_id",
  "tag_ids",
]) {
  assert.ok(
    sync.includes(`"${campo}"`),
    `sincronizar-proyectos.ts tiene que nombrar ${campo}: sin eso la columna queda en su default`,
  );
}

const datos = readFileSync(new URL("../lib/panel-odoo/datos.ts", import.meta.url), "utf8");
for (const columna of [
  "presupuesto",
  "gastado",
  "disponible",
  "porcentaje_gastado",
  "objetivos_total",
  "objetivos_hechos",
  "gastos_por_categoria",
  "estado_salud",
  "fecha_ultimo_cambio_etapa",
  "horas_asignadas",
  "horas_gastadas",
  "padre_odoo_id",
  "etiquetas",
]) {
  assert.ok(sync.includes(`${columna}:`), `el upsert tiene que escribir ${columna}`);
  assert.ok(datos.includes(columna), `datos.ts tiene que leer ${columna} de la cache`);
}

// Los campos que pueden no existir en este Odoo tienen que ir por camposPresentes y NO
// sueltos en el search_read: uno inexistente no devuelve vacío, hace fallar la consulta
// entera y deja la tarjeta sin proyectos ni tareas.
assert.ok(
  sync.includes("camposPresentes(\"project.task\", OPCIONALES_TAREA)"),
  "los campos opcionales de la tarea tienen que preguntarse antes de pedirse",
);
assert.ok(
  sync.includes("camposPresentes(\"project.project\", OPCIONALES_PROYECTO)"),
  "lo mismo para los del proyecto",
);

console.log(
  "Detalle de Proyectos: cierre por los dos caminos, vencidas/estancadas/horas, subtareas sin duplicar, filtros, orden y series, todo verificado.",
);
