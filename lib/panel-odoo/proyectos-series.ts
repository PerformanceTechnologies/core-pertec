import type { FilaProyecto, FilaTarea } from "./datos";
import { abierta, cerrada, esSubtarea, estancada, vencida, diasDesde } from "./proyectos-filtro";

// Las series de los gráficos del detalle de Proyectos. Puras y sin React (ver
// scripts/probar-proyectos.mts), calculadas sobre las tareas YA FILTRADAS, para que la
// tabla y los gráficos contesten siempre la misma pregunta.

export interface Grupo {
  /** Lo que se filtra al hacer clic: el valor crudo, no la etiqueta. */
  clave: string;
  etiqueta: string;
  cantidad: number;
  /** Cerradas del grupo, para dibujar el avance dentro de la misma barra. */
  cerradas: number;
}

const SIN_DATO = "—";

function agrupar(tareas: FilaTarea[], clave: (t: FilaTarea) => string): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const t of tareas) {
    const k = clave(t);
    const g = mapa.get(k) ?? { clave: k === SIN_DATO ? "" : k, etiqueta: k, cantidad: 0, cerradas: 0 };
    g.cantidad += 1;
    if (cerrada(t)) g.cerradas += 1;
    mapa.set(k, g);
  }
  return [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Tareas por etapa del tablero de Odoo, separando hechas de pendientes. */
export function porEtapa(tareas: FilaTarea[]): Grupo[] {
  return agrupar(tareas, (t) => t.etapa ?? SIN_DATO);
}

/**
 * Carga por responsable.
 *
 * Una tarea con varios asignados cuenta para CADA uno: la pregunta que responde el
 * gráfico es "cuánto tiene encima cada persona", no "cómo se reparte el total". Por eso
 * la suma de las barras puede pasar del total de tareas, y está bien.
 */
export function porResponsable(tareas: FilaTarea[]): Grupo[] {
  const expandidas = tareas.flatMap((t) =>
    (t.asignados ?? SIN_DATO)
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n !== "")
      .map((nombre) => ({ ...t, asignados: nombre })),
  );
  return agrupar(expandidas, (t) => t.asignados ?? SIN_DATO);
}

export function porProyecto(tareas: FilaTarea[]): Grupo[] {
  return agrupar(tareas, (t) => t.proyecto_nombre ?? SIN_DATO);
}

export interface PuntoDeHoras {
  clave: string;
  etiqueta: string;
  asignadas: number;
  gastadas: number;
}

/**
 * Horas planificadas contra trabajadas, por proyecto.
 *
 * Es la desviación que el presupuesto en pesos no muestra: un proyecto puede ir bien de
 * plata y llevar el doble de horas de las que se vendieron. Se excluyen las subtareas
 * porque Odoo ya suma sus horas en la tarea madre.
 *
 * Solo aparecen los proyectos donde hay algo que comparar: sin horas cargadas la barra
 * sería un par de ceros y ensuciaría el gráfico de los que sí las tienen.
 */
export function horasPorProyecto(tareas: FilaTarea[]): PuntoDeHoras[] {
  const mapa = new Map<string, PuntoDeHoras>();
  for (const t of tareas) {
    if (esSubtarea(t)) continue;
    const etiqueta = t.proyecto_nombre ?? SIN_DATO;
    const punto = mapa.get(etiqueta) ?? { clave: t.proyecto_nombre ?? "", etiqueta, asignadas: 0, gastadas: 0 };
    punto.asignadas += t.horas_asignadas;
    punto.gastadas += t.horas_gastadas;
    mapa.set(etiqueta, punto);
  }
  return [...mapa.values()]
    .filter((p) => p.asignadas > 0 || p.gastadas > 0)
    .sort((a, b) => b.gastadas - a.gastadas || b.asignadas - a.asignadas);
}

export interface TramoDePlazo {
  clave: string;
  etiqueta: string;
  cantidad: number;
}

/**
 * Las tareas abiertas repartidas por cuán cerca está su plazo.
 *
 * Reemplaza a "cuántas vencidas": un número solo dice que hay un problema, estos tramos
 * dicen además si es de esta semana o de hace tres meses, que se atienden distinto.
 */
export function horizonteDePlazos(tareas: FilaTarea[], hoy: string): TramoDePlazo[] {
  const tramos = [
    { clave: "vencidas", etiqueta: "Vencidas", cantidad: 0 },
    { clave: "por_vencer", etiqueta: "Esta semana", cantidad: 0 },
    { clave: "", etiqueta: "En 30 días", cantidad: 0 },
    { clave: "", etiqueta: "Más adelante", cantidad: 0 },
    { clave: "sin_plazo", etiqueta: "Sin plazo", cantidad: 0 },
  ];
  for (const t of tareas) {
    if (!abierta(t)) continue;
    if (!t.fecha_limite) {
      tramos[4].cantidad += 1;
      continue;
    }
    const faltan = -(diasDesde(t.fecha_limite, hoy) ?? 0);
    if (faltan < 0) tramos[0].cantidad += 1;
    else if (faltan <= 7) tramos[1].cantidad += 1;
    else if (faltan <= 30) tramos[2].cantidad += 1;
    else tramos[3].cantidad += 1;
  }
  return tramos.filter((t) => t.cantidad > 0);
}

export interface PuntoDeAvance {
  clave: string;
  etiqueta: string;
  /** 0-100. */
  avance: number;
  hechos: number;
  total: number;
}

/** El avance de objetivos de cada proyecto, de menor a mayor: primero lo que va atrás. */
export function avancePorProyecto(proyectos: FilaProyecto[]): PuntoDeAvance[] {
  return proyectos
    .filter((p) => p.objetivos_total > 0)
    .map((p) => ({
      clave: p.nombre,
      etiqueta: p.nombre,
      avance: Math.round((p.objetivos_hechos / p.objetivos_total) * 100),
      hechos: p.objetivos_hechos,
      total: p.objetivos_total,
    }))
    .sort((a, b) => a.avance - b.avance);
}

export interface PuntoDePresupuesto {
  clave: string;
  etiqueta: string;
  gastado: number;
  disponible: number;
  presupuesto: number;
  porcentaje: number;
}

/**
 * Gastado contra disponible, proyecto por proyecto.
 *
 * `disponible` se recorta en 0 para dibujar: una barra apilada no puede representar un
 * segmento negativo, y un sobregiro se lee mejor con el porcentaje al costado que con
 * una barra invertida. El monto real sigue en `presupuesto`/`porcentaje`.
 */
export function presupuestoPorProyecto(proyectos: FilaProyecto[]): PuntoDePresupuesto[] {
  return proyectos
    .filter((p) => p.presupuesto > 0 || p.gastado > 0)
    .map((p) => ({
      clave: p.nombre,
      etiqueta: p.nombre,
      gastado: p.gastado,
      disponible: Math.max(0, p.disponible),
      presupuesto: p.presupuesto,
      porcentaje: Math.round(p.porcentaje_gastado),
    }))
    .sort((a, b) => b.gastado - a.gastado);
}

export interface GrupoDeGasto {
  clave: string;
  etiqueta: string;
  monto: number;
  color: string;
  /** En qué proyectos cayó, para el tooltip. */
  detalle: string[];
}

/**
 * El gasto por categoría, sumando todos los proyectos.
 *
 * Las etiquetas y los colores los define el módulo de Odoo (CATEGORY_LABELS y
 * CATEGORY_COLORS en pertec_project_panel), así que la torta de acá sale del mismo
 * color que la de allá y nadie tiene que traducir entre las dos pantallas.
 */
export function gastoPorCategoria(proyectos: FilaProyecto[]): GrupoDeGasto[] {
  const mapa = new Map<string, GrupoDeGasto>();
  for (const p of proyectos) {
    for (const c of p.gastos_por_categoria ?? []) {
      const g = mapa.get(c.key) ?? { clave: c.key, etiqueta: c.label, monto: 0, color: c.color, detalle: [] };
      g.monto += c.amount;
      g.detalle.push(`${p.nombre}: ${Math.round(c.amount).toLocaleString("es-CL")}`);
      mapa.set(c.key, g);
    }
  }
  return [...mapa.values()].sort((a, b) => b.monto - a.monto);
}

export interface PuntoDeSalud {
  clave: string;
  etiqueta: string;
  cantidad: number;
  proyectos: string[];
}

// last_update_status de Odoo. Las claves son las suyas; los textos, los que usa el
// equipo.
const SALUD: Record<string, string> = {
  on_track: "En curso",
  at_risk: "En riesgo",
  off_track: "Fuera de curso",
  on_hold: "En pausa",
  done: "Terminado",
  to_define: "Sin definir",
};

export function etiquetaDeSalud(clave: string | null): string {
  if (!clave) return "Sin estado";
  return SALUD[clave] ?? clave;
}

/**
 * Los proyectos por el semáforo que el jefe de proyecto mantiene en Odoo.
 *
 * Es la única señal de riesgo que no se deduce de las fechas ni de la plata: un proyecto
 * al día en las dos cosas igual puede estar "en riesgo" por algo que solo sabe quien lo
 * lleva. Si nadie lo carga en Odoo, todos caen en "Sin estado" y el gráfico lo dice en
 * vez de fingir que todo va bien.
 */
export function saludDeProyectos(proyectos: FilaProyecto[]): PuntoDeSalud[] {
  const mapa = new Map<string, PuntoDeSalud>();
  for (const p of proyectos) {
    const clave = p.estado_salud ?? "";
    const g = mapa.get(clave) ?? { clave, etiqueta: etiquetaDeSalud(p.estado_salud), cantidad: 0, proyectos: [] };
    g.cantidad += 1;
    g.proyectos.push(p.nombre);
    mapa.set(clave, g);
  }
  const orden = ["off_track", "at_risk", "on_hold", "to_define", "", "on_track", "done"];
  return [...mapa.values()].sort((a, b) => orden.indexOf(a.clave) - orden.indexOf(b.clave));
}

export interface PuntoDeEstancamiento {
  proyecto: string;
  tarea: string;
  dias: number;
}

/** Las tareas más quietas primero: es la lista por la que conviene empezar a preguntar. */
export function masEstancadas(tareas: FilaTarea[], hoy: string, tope = 8): PuntoDeEstancamiento[] {
  return tareas
    .filter((t) => estancada(t, hoy))
    .map((t) => ({
      proyecto: t.proyecto_nombre ?? SIN_DATO,
      tarea: t.nombre,
      dias: diasDesde(t.fecha_ultimo_cambio_etapa, hoy) ?? 0,
    }))
    .sort((a, b) => b.dias - a.dias)
    .slice(0, tope);
}

/** Cuántas tareas hay vencidas por proyecto, para señalar dónde está el atraso. */
export function vencidasPorProyecto(tareas: FilaTarea[], hoy: string): Grupo[] {
  return agrupar(
    tareas.filter((t) => vencida(t, hoy)),
    (t) => t.proyecto_nombre ?? SIN_DATO,
  );
}
