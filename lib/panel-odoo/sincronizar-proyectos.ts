import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooSearchRead, odooCampos } from "./odoo-cliente";
import { eliminarNoVigentes } from "./limpieza";

type TuplaOdoo = [number, string] | false;
function nombreDeTupla(t: TuplaOdoo): string | null {
  return Array.isArray(t) ? t[1] : null;
}
function idDeTupla(t: TuplaOdoo): number | null {
  return Array.isArray(t) ? t[0] : null;
}

interface ProyectoOdoo {
  id: number;
  name: string;
  partner_id: TuplaOdoo;
  user_id: TuplaOdoo;
  task_count: number;
  date: string | false;
  active: boolean;
  // Presupuesto y avance, calculados en Odoo por pertec_project_panel
  // (models/project_project.py). Se leen ya resueltos y no se recalculan aca:
  // el mismo numero que alguien ve en Odoo es el que ve en el panel, y la
  // regla de que gasto cuenta -- solo hr.expense en estado valido, mas los
  // panel.gasto -- vive en un solo lado.
  presupuesto_inicial: number;
  panel_amount_spent: number;
  panel_amount_available: number;
  panel_percent_spent: number;
  panel_obj_total: number;
  panel_obj_done: number;
  panel_color_hex: string | false;
  // El id del proyecto en el core, que Odoo guarda al sincronizar (modulo
  // pertec_project_panel, models/sync_mixin.py). Es la llave para cruzar los dos
  // lados; por nombre no sirve, ya hubo dos "Plan Harris" a la vez.
  supabase_id: string | false;
  // Los opcionales (ver camposPresentes) llegan por indice: pueden no venir.
  [campo: string]: unknown;
}

interface TareaOdoo {
  id: number;
  name: string;
  project_id: TuplaOdoo;
  stage_id: TuplaOdoo;
  state: string;
  date_deadline: string | false;
  user_ids: number[];
  // Campos del modulo pertec_project_panel (ver pertec-odoo/pertec_project_panel/
  // models/project_task.py). Las tareas que ese panel usa como OBJETIVOS no se
  // cierran con el `state` nativo —todas quedan en 01_in_progress— sino con
  // objetivo_done, y su plazo y sus responsables viven en sus propios campos.
  objetivo_done: boolean;
  objetivo_date_start: string | false;
  objetivo_date_end: string | false;
  objetivo_responsables: string | false;
  objetivo_color: string | false;
  // Gastos ligados al objetivo, ya sumados por Odoo (_compute_expense_stats).
  expense_total: number;
  expense_count: number;
  priority: string | false;
  [campo: string]: unknown;
}

/** El desglose de gasto que arma pertec_project_panel en panel_budget_data. */
interface DatosPresupuestoOdoo {
  currency_code?: string;
  categories?: { key: string; label: string; amount: number; percent: number; color: string }[];
  n_items?: number;
}

interface UsuarioOdoo {
  id: number;
  name: string;
}

// project.project/project.task no usan multi-empresa en este Odoo
// (company_id llega vacio en ambos) -- por eso no se filtra ni se guarda
// company_id aca, a diferencia de los demas modulos.
// Topes de las consultas a Odoo. Si alguna los alcanza, la limpieza de ESA tabla
// se salta (ver eliminarNoVigentes).
/**
 * De una lista de candidatos, los que ESTE Odoo realmente tiene.
 *
 * Los campos nativos de project.project/project.task cambian de nombre entre
 * versiones —las horas planificadas son `allocated_hours` desde la 17 y
 * `planned_hours` antes— y algunos vienen de modulos que pueden no estar
 * instalados (`last_update_status` es de project, `progress` depende de
 * hr_timesheet). Un search_read con UN campo inexistente no devuelve ese campo
 * vacio: falla entero, con lo cual una suposicion mia dejaria la tarjeta sin
 * proyectos ni tareas.
 *
 * Asi que se pregunta primero (fields_get, que es lectura de metadatos) y se
 * pide solo lo que existe. Es el mismo criterio que lib/rendidor/fondos.ts usa
 * para hr.expense.advance. Si la consulta de metadatos falla, se sigue con los
 * campos base: se pierde el detalle nuevo, no la sincronizacion.
 */
async function camposPresentes(modelo: string, candidatos: string[]): Promise<Set<string>> {
  try {
    const definidos = await odooCampos(modelo);
    const presentes = candidatos.filter((c) => c in definidos);
    const faltantes = candidatos.filter((c) => !(c in definidos));
    if (faltantes.length > 0) {
      console.warn(`[panel-odoo] ${modelo} no tiene ${faltantes.join(", ")}: esas columnas quedan en su default.`);
    }
    return new Set(presentes);
  } catch (e) {
    console.error(`[panel-odoo] No se pudieron leer los campos de ${modelo}:`, e);
    return new Set();
  }
}

/** Un campo que puede no haber venido, como numero. */
function numero(fila: Record<string, unknown>, campo: string): number {
  const v = fila[campo];
  return typeof v === "number" ? v : 0;
}

/** El primero de varios alias que este Odoo tenga, como numero. */
function numeroDeAlguno(fila: Record<string, unknown>, campos: string[]): number {
  for (const campo of campos) {
    const v = fila[campo];
    if (typeof v === "number") return v;
  }
  return 0;
}

/** Un campo de fecha que puede no haber venido. */
function fechaOpcional(fila: Record<string, unknown>, campo: string): string | null {
  const v = fila[campo];
  return typeof v === "string" && v !== "" ? v : null;
}

/** Un campo de texto/selection que puede no haber venido. */
function textoOpcional(fila: Record<string, unknown>, campo: string): string | null {
  const v = fila[campo];
  return typeof v === "string" && v !== "" ? v : null;
}

/** Un many2one que puede no haber venido. */
function tuplaOpcional(fila: Record<string, unknown>, campo: string): TuplaOdoo {
  const v = fila[campo];
  return Array.isArray(v) && typeof v[0] === "number" ? ([v[0], String(v[1])] as [number, string]) : false;
}

/** Cuantos ids trae un one2many que puede no haber venido. */
function cuantos(fila: Record<string, unknown>, campo: string): number {
  const v = fila[campo];
  return Array.isArray(v) ? v.length : 0;
}

// Horas planificadas: el nombre cambio en Odoo 17. Se prueban los dos.
const CAMPOS_HORAS_PLAN = ["allocated_hours", "planned_hours"];

const OPCIONALES_PROYECTO = ["last_update_status", "last_update_date", "date_start", "stage_id"];
const OPCIONALES_TAREA = [
  "date_last_stage_update",
  "date_assign",
  "effective_hours",
  "progress",
  "parent_id",
  "child_ids",
  "tag_ids",
  "partner_id",
  ...CAMPOS_HORAS_PLAN,
];

/** El avance de Odoo, siempre como 0-100. */
function normalizarAvance(bruto: number): number {
  if (bruto <= 0) return 0;
  const pct = bruto <= 1 ? bruto * 100 : bruto;
  return Math.round(Math.min(999, pct));
}

/**
 * El nombre de cada etiqueta usada por las tareas.
 *
 * Mismo camino que los responsables: tag_ids llega como lista de ids y sin esto
 * la columna quedaria con numeros. Si el modelo no existe en este Odoo (o la
 * consulta falla), las tareas se guardan sin etiquetas en vez de romperse.
 */
async function leerEtiquetas(tareas: TareaOdoo[]): Promise<Map<number, string>> {
  const ids = Array.from(new Set(tareas.flatMap((t) => (Array.isArray(t.tag_ids) ? (t.tag_ids as number[]) : []))));
  if (ids.length === 0) return new Map();
  try {
    const filas = await odooSearchRead<{ id: number; name: string }>(
      "project.tags",
      [["id", "in", ids]],
      ["name"],
      { limit: ids.length },
    );
    return new Map(filas.map((f) => [f.id, f.name]));
  } catch (e) {
    console.error("[panel-odoo] No se pudieron leer las etiquetas de las tareas:", e);
    return new Map();
  }
}

// Los mismos hex que OBJ_COLORS en pertec_project_panel/models/project_project.py.
// Se repiten aca —en vez de leerlos de Odoo— porque objetivo_color viaja como
// clave ("cobre", "teal") y el hex solo esta expuesto en el proyecto, no en la
// tarea.
const COLOR_OBJETIVO: Record<string, string> = {
  cobre: "#C85217",
  teal: "#00A080",
  acero: "#4A6FA5",
  amarillo: "#D4A017",
  violeta: "#7A5BAD",
};

/**
 * El desglose del gasto por categoria de cada proyecto, o nada.
 *
 * Va en su PROPIA consulta y no junto al resto de los campos, a proposito.
 * `panel_budget_data` es un campo Json calculado y NO almacenado: Odoo lo
 * recorre entero en cada lectura (todos los panel.gasto y todos los hr.expense
 * del proyecto) y su compute —a diferencia de los demas del mismo modelo— no
 * esta envuelto en try/except (ver pertec_project_panel/models/project_project.py).
 * Pidiendolo en el mismo search_read, una excepcion en UN proyecto se lleva
 * puesta la respuesta completa, y con ella la sincronizacion de los otros dos
 * mas la de todas las tareas: se perderia lo que hoy ya funciona a cambio de un
 * desglose.
 *
 * Aparte, si falla se pierde solo el desglose: el resto de las cifras —que son
 * campos almacenados y baratos— entran igual, y la tarjeta muestra el
 * presupuesto sin la torta de categorias.
 */
async function leerDesglosePorProyecto(
  ids: number[],
): Promise<Map<number, DatosPresupuestoOdoo>> {
  if (ids.length === 0) return new Map();
  try {
    const filas = await odooSearchRead<{ id: number; panel_budget_data: DatosPresupuestoOdoo | false }>(
      "project.project",
      [["id", "in", ids]],
      ["panel_budget_data"],
      { limit: ids.length },
    );
    return new Map(
      filas.map((f) => [f.id, f.panel_budget_data && typeof f.panel_budget_data === "object" ? f.panel_budget_data : {}]),
    );
  } catch (e) {
    console.error("[panel-odoo] No se pudo leer el desglose de gasto por categoria:", e);
    return new Map();
  }
}

const TOPE_PROYECTOS = 500;
const TOPE_TAREAS = 2000;

export async function sincronizarProyectos(): Promise<number> {
  const [opcionalesProyecto, opcionalesTarea] = await Promise.all([
    camposPresentes("project.project", OPCIONALES_PROYECTO),
    camposPresentes("project.task", OPCIONALES_TAREA),
  ]);

  const [proyectos, tareas] = await Promise.all([
    odooSearchRead<ProyectoOdoo>(
      "project.project",
      [],
      [
        ...opcionalesProyecto,
        "name",
        "partner_id",
        "user_id",
        "task_count",
        "date",
        "active",
        "supabase_id",
        "presupuesto_inicial",
        "panel_amount_spent",
        "panel_amount_available",
        "panel_percent_spent",
        "panel_obj_total",
        "panel_obj_done",
        "panel_color_hex",
      ],
      { limit: TOPE_PROYECTOS },
    ),
    odooSearchRead<TareaOdoo>(
      "project.task",
      [],
      [
        ...opcionalesTarea,
        "name",
        "project_id",
        "stage_id",
        "state",
        "date_deadline",
        "user_ids",
        "objetivo_done",
        "objetivo_date_start",
        "objetivo_date_end",
        "objetivo_responsables",
        "objetivo_color",
        "expense_total",
        "expense_count",
        "priority",
      ],
      { limit: TOPE_TAREAS },
    ),
  ]);

  const desglosePorProyecto = await leerDesglosePorProyecto(proyectos.map((p) => p.id));
  const nombrePorEtiquetaId = await leerEtiquetas(tareas);

  const idsAsignados = Array.from(new Set(tareas.flatMap((t) => t.user_ids ?? [])));
  const usuarios =
    idsAsignados.length > 0
      ? await odooSearchRead<UsuarioOdoo>("res.users", [["id", "in", idsAsignados]], ["name"], {
          limit: idsAsignados.length,
        })
      : [];
  const nombrePorUsuarioId = new Map(usuarios.map((u) => [u.id, u.name]));

  const filasProyectos = proyectos.map((p) => ({
    odoo_id: p.id,
    nombre: p.name,
    partner_nombre: nombreDeTupla(p.partner_id),
    responsable: nombreDeTupla(p.user_id),
    cantidad_tareas: p.task_count,
    fecha_vencimiento: p.date || null,
    activo: p.active,
    supabase_id: p.supabase_id || null,
    presupuesto: p.presupuesto_inicial ?? 0,
    gastado: p.panel_amount_spent ?? 0,
    disponible: p.panel_amount_available ?? 0,
    // Se guarda el porcentaje que calculo Odoo y no gastado/presupuesto: con
    // presupuesto 0 esa division es infinito, y Odoo ya devuelve 0 en ese caso.
    porcentaje_gastado: p.panel_percent_spent ?? 0,
    objetivos_total: p.panel_obj_total ?? 0,
    objetivos_hechos: p.panel_obj_done ?? 0,
    gastos_cantidad: desglosePorProyecto.get(p.id)?.n_items ?? 0,
    gastos_por_categoria: desglosePorProyecto.get(p.id)?.categories ?? [],
    moneda: desglosePorProyecto.get(p.id)?.currency_code ?? null,
    color_hex: p.panel_color_hex || null,
    // El semaforo que el jefe de proyecto mantiene a mano en Odoo. Es la unica
    // señal de riesgo que no se puede deducir de las fechas ni de la plata: un
    // proyecto al dia en ambas cosas igual puede estar "en riesgo" por algo que
    // solo sabe quien lo lleva.
    estado_salud: textoOpcional(p, "last_update_status"),
    fecha_estado_salud: fechaOpcional(p, "last_update_date")?.slice(0, 10) ?? null,
    fecha_inicio: fechaOpcional(p, "date_start")?.slice(0, 10) ?? null,
    etapa: nombreDeTupla(tuplaOpcional(p, "stage_id")),
    actualizado_en: new Date().toISOString(),
  }));

  const filasTareas = tareas.map((t) => ({
    odoo_id: t.id,
    proyecto_odoo_id: idDeTupla(t.project_id),
    proyecto_nombre: nombreDeTupla(t.project_id),
    nombre: t.name,
    etapa: nombreDeTupla(t.stage_id),
    estado: t.state,
    // Una tarea puede estar cerrada por el estado nativo de Odoo o marcada como
    // objetivo cumplido en el panel; el core las cuenta igual.
    completado: Boolean(t.objetivo_done),
    // En las tareas creadas desde el panel, date_deadline viene siempre vacio y
    // el plazo real esta en objetivo_date_end: la columna "Fecha limite" salia
    // entera en guiones.
    fecha_limite: t.date_deadline || t.objetivo_date_end || null,
    fecha_inicio: t.objetivo_date_start || null,
    color_hex: COLOR_OBJETIVO[t.objetivo_color || "cobre"] ?? null,
    gastos_total: t.expense_total ?? 0,
    gastos_cantidad: t.expense_count ?? 0,
    // La prioridad nativa es "0"/"1" (normal/urgente). Se guarda cruda y se
    // traduce al mostrarla, como el resto de los codigos de Odoo.
    prioridad: t.priority || null,
    // Desde cuando no se mueve de etapa: es lo unico con que se puede separar
    // una tarea que avanza despacio de una que quedo abandonada. Sin esto, una
    // tarea sin fecha limite podia estar parada meses sin que nada lo dijera.
    fecha_ultimo_cambio_etapa: fechaOpcional(t, "date_last_stage_update"),
    fecha_asignacion: fechaOpcional(t, "date_assign"),
    horas_asignadas: numeroDeAlguno(t, CAMPOS_HORAS_PLAN),
    horas_gastadas: numero(t, "effective_hours"),
    // Odoo devuelve el avance en 0-100 en unas versiones y en 0-1 en otras; se
    // normaliza a porcentaje para que la barra no quede siempre pegada al 1%.
    avance: normalizarAvance(numero(t, "progress")),
    padre_odoo_id: idDeTupla(tuplaOpcional(t, "parent_id")),
    subtareas: cuantos(t, "child_ids"),
    etiquetas:
      (Array.isArray(t.tag_ids) ? (t.tag_ids as number[]) : [])
        .map((id) => nombrePorEtiquetaId.get(id))
        .filter(Boolean)
        .join(", ") || null,
    cliente: nombreDeTupla(tuplaOpcional(t, "partner_id")),
    asignados:
      (t.user_ids ?? [])
        .map((id) => nombrePorUsuarioId.get(id))
        .filter(Boolean)
        .join(", ") ||
      t.objetivo_responsables ||
      null,
    actualizado_en: new Date().toISOString(),
  }));

  if (filasProyectos.length > 0) {
    const { error } = await supabaseAdmin
      .from("panel_odoo_proyectos")
      .upsert(filasProyectos, { onConflict: "odoo_id" });
    if (error) throw new Error(error.message);
  }
  if (filasTareas.length > 0) {
    const { error } = await supabaseAdmin
      .from("panel_odoo_tareas")
      .upsert(filasTareas, { onConflict: "odoo_id" });
    if (error) throw new Error(error.message);
  }

  // Lo que Odoo ya no devuelve sale de la cache, y va DESPUES de los upsert para
  // que un upsert fallido no deje la tabla vaciada.
  //
  // Esto es lo que faltaba cuando el panel mostraba 4 proyectos y 18 tareas
  // teniendo Odoo 3 y 12: un "Plan Harris" que se rehizo en Odoo con otro id
  // quedo en la cache con sus cinco tareas, y las tareas aparecian repetidas en
  // el detalle. El upsert nunca borra, solo escribe encima de lo que coincide.
  if (filasProyectos.length > 0) {
    await eliminarNoVigentes(
      "panel_odoo_proyectos",
      filasProyectos.map((f) => f.odoo_id),
      { topeAlcanzado: proyectos.length >= TOPE_PROYECTOS },
    );
  }
  if (filasTareas.length > 0) {
    await eliminarNoVigentes(
      "panel_odoo_tareas",
      filasTareas.map((f) => f.odoo_id),
      { topeAlcanzado: tareas.length >= TOPE_TAREAS },
    );
  }

  return filasProyectos.length + filasTareas.length;
}
