import type { FilaProyecto, FilaTarea } from "./datos";

// Filtrado, orden, reglas y totales del detalle de Proyectos. Todo puro y sin React
// (ver scripts/probar-proyectos.mts): el componente solo dibuja lo que estas funciones
// devuelven.
//
// Mismo patrón que ./gastos-filtro.ts, ./crm-filtro.ts y ./ventas-filtro.ts. Lo propio de
// acá es que una tarea se puede cerrar por DOS caminos —el estado nativo de Odoo y el
// objetivo_done del panel— y que "atrasada" tiene tres formas distintas que no se pueden
// mezclar: vencida por fecha, estancada sin moverse, y pasada de horas.

export type CampoOrden = "fecha_limite" | "nombre" | "proyecto" | "etapa" | "asignados" | "gastos_total" | "horas";
export type Sentido = "asc" | "desc";

export interface Criterios {
  texto: string;
  /** Un filtro de la lista de abajo, o "" para no filtrar por estado. */
  estado: string;
  proyecto: string;
  responsable: string;
  etapa: string;
  etiqueta: string;
  desde: string;
  hasta: string;
  orden: CampoOrden;
  sentido: Sentido;
}

export const CRITERIOS_INICIALES: Criterios = {
  texto: "",
  estado: "",
  proyecto: "",
  responsable: "",
  etapa: "",
  etiqueta: "",
  desde: "",
  hasta: "",
  orden: "fecha_limite",
  sentido: "asc",
};

/**
 * Días sin cambiar de etapa a partir de los cuales una tarea abierta se considera
 * estancada.
 *
 * Treinta, igual que el umbral de "olvidado" de Gastos: es el número que el equipo ya
 * tiene internalizado en este panel, y dos umbrales distintos para la misma idea de
 * "esto lleva demasiado quieto" se prestan a confusión.
 */
export const DIAS_PARA_ESTANCARSE = 30;

const DIA = 24 * 60 * 60 * 1000;

const ESTADOS_TAREA_CERRADA = ["1_done", "1_canceled"];

/** Hoy en Chile, en ISO. Las fechas de Odoo son fechas, no instantes. */
export function hoyEnChileIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

/** Días entre una fecha de Odoo (que puede traer hora) y hoy. */
export function diasDesde(fecha: string | null, hoy: string): number | null {
  if (!fecha) return null;
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`)) / DIA);
}

/**
 * Una tarea está terminada si Odoo la cerró por su estado nativo O si está marcada como
 * objetivo cumplido.
 *
 * Las tareas que el panel de proyectos de Odoo usa como OBJETIVOS nunca cambian de
 * `state`: quedan todas en 01_in_progress y se marcan con objetivo_done (ver
 * pertec_project_panel/models/project_task.py). Mirando solo el estado, el panel decía
 * "Completadas 0" con seis objetivos ya terminados y además los listaba como abiertas.
 */
export function cerrada(t: FilaTarea): boolean {
  return t.completado || ESTADOS_TAREA_CERRADA.includes(t.estado);
}

export function abierta(t: FilaTarea): boolean {
  return !cerrada(t);
}

/** Cancelada: cerrada, pero no hecha. No cuenta como trabajo completado. */
export function cancelada(t: FilaTarea): boolean {
  return t.estado === "1_canceled" && !t.completado;
}

/** Vencida: con el plazo cumplido y todavía sin cerrar. */
export function vencida(t: FilaTarea, hoy: string): boolean {
  return abierta(t) && Boolean(t.fecha_limite) && t.fecha_limite!.slice(0, 10) < hoy;
}

/** Vence dentro de los próximos `dias` días, sin haber vencido todavía. */
export function porVencer(t: FilaTarea, hoy: string, dias = 7): boolean {
  if (!abierta(t) || !t.fecha_limite) return false;
  const faltan = -(diasDesde(t.fecha_limite, hoy) ?? 0);
  return faltan >= 0 && faltan <= dias;
}

/**
 * Abierta y sin moverse de etapa hace más de un mes.
 *
 * Es la única señal que distingue una tarea que avanza despacio de una abandonada: una
 * tarea sin fecha límite podía estar parada meses sin que nada en el panel lo dijera,
 * porque no vencía nunca.
 */
export function estancada(t: FilaTarea, hoy: string): boolean {
  if (!abierta(t)) return false;
  const dias = diasDesde(t.fecha_ultimo_cambio_etapa, hoy);
  return dias !== null && dias > DIAS_PARA_ESTANCARSE;
}

/** Abierta y sin nadie a cargo: no la va a mover nadie. */
export function sinAsignar(t: FilaTarea): boolean {
  return abierta(t) && (t.asignados === null || t.asignados.trim() === "");
}

/** Abierta y sin plazo: no va a aparecer en ninguna lista de vencimientos. */
export function sinPlazo(t: FilaTarea): boolean {
  return abierta(t) && !t.fecha_limite;
}

/**
 * Se pasó de las horas que tenía asignadas.
 *
 * Solo cuenta si había horas planificadas: sin plan, cualquier hora trabajada daría
 * "excedida" y el aviso no querría decir nada.
 */
export function pasadaDeHoras(t: FilaTarea): boolean {
  return t.horas_asignadas > 0 && t.horas_gastadas > t.horas_asignadas;
}

/**
 * Las subtareas NO cuentan para los totales.
 *
 * Una subtarea es parte del trabajo de su madre, y en Odoo sus horas ya están sumadas
 * ahí: contando las dos, el total de horas de un proyecto sale al doble.
 */
export function esSubtarea(t: FilaTarea): boolean {
  return t.padre_odoo_id !== null;
}

/** El proyecto se pasó del presupuesto que tenía cargado. */
export function sobreGastado(p: FilaProyecto): boolean {
  return p.presupuesto > 0 && p.disponible < 0;
}

/** El jefe de proyecto lo marcó en riesgo o fuera de curso en Odoo. */
export function enRiesgo(p: FilaProyecto): boolean {
  return p.estado_salud === "at_risk" || p.estado_salud === "off_track";
}

// ── Filtros de estado ────────────────────────────────────────────────────────
//
// El valor es lo que viaja en los criterios; la etiqueta, lo que se lee. Van agrupados
// porque son tres preguntas distintas: en qué anda, qué está atrasado, y qué está mal
// cargado en Odoo.

export const GRUPOS_DE_ESTADO = ["Avance", "Requiere atención", "Datos incompletos"] as const;

export const ESTADO_FILTROS: { valor: string; etiqueta: string; grupo: (typeof GRUPOS_DE_ESTADO)[number] }[] = [
  { valor: "abiertas", etiqueta: "Abiertas", grupo: "Avance" },
  { valor: "completadas", etiqueta: "Completadas", grupo: "Avance" },
  { valor: "canceladas", etiqueta: "Canceladas", grupo: "Avance" },
  { valor: "vencidas", etiqueta: "Vencidas", grupo: "Requiere atención" },
  { valor: "por_vencer", etiqueta: "Vencen esta semana", grupo: "Requiere atención" },
  { valor: "estancadas", etiqueta: `Estancadas (+${DIAS_PARA_ESTANCARSE} días)`, grupo: "Requiere atención" },
  { valor: "pasadas_de_horas", etiqueta: "Pasadas de horas", grupo: "Requiere atención" },
  { valor: "sin_asignar", etiqueta: "Sin responsable", grupo: "Datos incompletos" },
  { valor: "sin_plazo", etiqueta: "Sin fecha límite", grupo: "Datos incompletos" },
];

function cumpleEstado(t: FilaTarea, estado: string, hoy: string): boolean {
  switch (estado) {
    case "abiertas":
      return abierta(t);
    case "completadas":
      return t.completado || t.estado === "1_done";
    case "canceladas":
      return cancelada(t);
    case "vencidas":
      return vencida(t, hoy);
    case "por_vencer":
      return porVencer(t, hoy);
    case "estancadas":
      return estancada(t, hoy);
    case "pasadas_de_horas":
      return pasadaDeHoras(t);
    case "sin_asignar":
      return sinAsignar(t);
    case "sin_plazo":
      return sinPlazo(t);
    default:
      return true;
  }
}

/** Sin tildes y en minúsculas: un responsable con tilde es lo normal, no la excepción. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function filtrarTareas(tareas: FilaTarea[], c: Criterios, hoy: string): FilaTarea[] {
  const texto = normalizar(c.texto.trim());
  return tareas.filter((t) => {
    if (c.estado && !cumpleEstado(t, c.estado, hoy)) return false;
    if (c.proyecto && (t.proyecto_nombre ?? "") !== c.proyecto) return false;
    if (c.etapa && (t.etapa ?? "") !== c.etapa) return false;
    // El responsable se compara por contención: una tarea con dos asignados tiene
    // "Ana, Beto" en el campo, y filtrar por Ana tiene que encontrarla.
    if (c.responsable && !normalizar(t.asignados ?? "").includes(normalizar(c.responsable))) return false;
    if (c.etiqueta && !normalizar(t.etiquetas ?? "").includes(normalizar(c.etiqueta))) return false;
    // El rango se aplica sobre el plazo. Una tarea SIN plazo no se filtra afuera por
    // fecha: no está fuera del rango, está sin cargar, y para eso está "Sin fecha límite".
    if (c.desde && t.fecha_limite && t.fecha_limite.slice(0, 10) < c.desde) return false;
    if (c.hasta && t.fecha_limite && t.fecha_limite.slice(0, 10) > c.hasta) return false;
    if (
      texto &&
      !normalizar(
        `${t.nombre} ${t.proyecto_nombre ?? ""} ${t.asignados ?? ""} ${t.etapa ?? ""} ${t.etiquetas ?? ""} ${t.cliente ?? ""}`,
      ).includes(texto)
    ) {
      return false;
    }
    return true;
  });
}

function valorDeOrden(t: FilaTarea, campo: CampoOrden): string | number | null {
  switch (campo) {
    case "fecha_limite":
      return t.fecha_limite?.slice(0, 10) ?? null;
    case "nombre":
      return normalizar(t.nombre);
    case "proyecto":
      return t.proyecto_nombre ? normalizar(t.proyecto_nombre) : null;
    case "etapa":
      return t.etapa ? normalizar(t.etapa) : null;
    case "asignados":
      return t.asignados ? normalizar(t.asignados) : null;
    case "gastos_total":
      return t.gastos_total;
    case "horas":
      return t.horas_gastadas;
  }
}

/**
 * Ordena SIN mutar el arreglo que llega del servidor, y deja los nulos al final en los
 * dos sentidos: una tarea sin plazo no es "la más próxima" ni "la más lejana", es una
 * que no tiene el dato.
 */
export function ordenarTareas(tareas: FilaTarea[], campo: CampoOrden, sentido: Sentido): FilaTarea[] {
  const signo = sentido === "asc" ? 1 : -1;
  return [...tareas].sort((a, b) => {
    const va = valorDeOrden(a, campo);
    const vb = valorDeOrden(b, campo);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va === vb) return a.odoo_id - b.odoo_id;
    return (va < vb ? -1 : 1) * signo;
  });
}

export interface ResumenTareas {
  cantidad: number;
  abiertas: number;
  completadas: number;
  vencidas: number;
  estancadas: number;
  sinAsignar: number;
  horasAsignadas: number;
  horasGastadas: number;
  gasto: number;
}

/**
 * Los totales de lo que quedó a la vista.
 *
 * Las horas y el gasto excluyen subtareas: en Odoo el trabajo de una subtarea ya está
 * sumado en su madre, y contando las dos el total sale al doble.
 */
export function resumirTareas(tareas: FilaTarea[], hoy: string): ResumenTareas {
  const propias = tareas.filter((t) => !esSubtarea(t));
  return {
    cantidad: tareas.length,
    abiertas: tareas.filter(abierta).length,
    completadas: tareas.filter((t) => t.completado || t.estado === "1_done").length,
    vencidas: tareas.filter((t) => vencida(t, hoy)).length,
    estancadas: tareas.filter((t) => estancada(t, hoy)).length,
    sinAsignar: tareas.filter(sinAsignar).length,
    horasAsignadas: propias.reduce((a, t) => a + t.horas_asignadas, 0),
    horasGastadas: propias.reduce((a, t) => a + t.horas_gastadas, 0),
    gasto: propias.reduce((a, t) => a + t.gastos_total, 0),
  };
}

export interface ResumenProyectos {
  activos: number;
  enRiesgo: number;
  sobreGastados: number;
  objetivosTotal: number;
  objetivosHechos: number;
  presupuesto: number;
  gastado: number;
  disponible: number;
}

export function resumirProyectos(proyectos: FilaProyecto[]): ResumenProyectos {
  return {
    activos: proyectos.length,
    enRiesgo: proyectos.filter(enRiesgo).length,
    sobreGastados: proyectos.filter(sobreGastado).length,
    objetivosTotal: proyectos.reduce((a, p) => a + p.objetivos_total, 0),
    objetivosHechos: proyectos.reduce((a, p) => a + p.objetivos_hechos, 0),
    presupuesto: proyectos.reduce((a, p) => a + p.presupuesto, 0),
    gastado: proyectos.reduce((a, p) => a + p.gastado, 0),
    disponible: proyectos.reduce((a, p) => a + p.disponible, 0),
  };
}

export interface Aviso {
  /** El filtro de estado que aplica el clic. */
  filtro: string;
  cantidad: number;
  texto: string;
}

/**
 * Lo que pide una acción hoy, contado y clickeable.
 *
 * Va sobre TODAS las tareas y no sobre las filtradas: son la tarea pendiente completa, y
 * esconderlas al filtrar las volvería inútiles. Mismo criterio que los avisos de Gastos.
 */
export function avisos(tareas: FilaTarea[], hoy: string): Aviso[] {
  const candidatos: Aviso[] = [
    { filtro: "vencidas", cantidad: tareas.filter((t) => vencida(t, hoy)).length, texto: "vencidas" },
    { filtro: "por_vencer", cantidad: tareas.filter((t) => porVencer(t, hoy)).length, texto: "vencen esta semana" },
    {
      filtro: "estancadas",
      cantidad: tareas.filter((t) => estancada(t, hoy)).length,
      texto: `sin moverse hace más de ${DIAS_PARA_ESTANCARSE} días`,
    },
    {
      filtro: "pasadas_de_horas",
      cantidad: tareas.filter(pasadaDeHoras).length,
      texto: "pasadas de las horas asignadas",
    },
    { filtro: "sin_asignar", cantidad: tareas.filter(sinAsignar).length, texto: "sin responsable" },
    { filtro: "sin_plazo", cantidad: tareas.filter(sinPlazo).length, texto: "sin fecha límite" },
  ];
  return candidatos.filter((a) => a.cantidad > 0);
}
