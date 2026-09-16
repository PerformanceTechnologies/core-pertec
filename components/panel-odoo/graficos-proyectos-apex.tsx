"use client";

import { useSyncExternalStore } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { money } from "@/lib/cotizador/formato";
import { suscribirseAlTema, temaActual } from "@/lib/tema";
import { grosorDeBarra } from "@/lib/panel-odoo/grosor-barra";
import type {
  Grupo,
  GrupoDeGasto,
  PuntoDeAvance,
  PuntoDeHoras,
  PuntoDePresupuesto,
  PuntoDeSalud,
  TramoDePlazo,
} from "@/lib/panel-odoo/proyectos-series";

// Los gráficos del detalle de Proyectos. No se importa directo: entra por
// ./graficos-proyectos.tsx con dynamic({ ssr: false }), porque Apex mide el DOM para
// dibujar.
//
// Cada punto es CLICKEABLE y filtra la tabla de abajo, igual que en Facturas, CRM,
// Ventas y Gastos.

const NARANJO = "#c85217";
const NARANJO_SUAVE = "#e07a3d";
const TEAL = "#00a080";
const TEAL_SUAVE = "#35b89b";
const GRIS = "#8c8578";
const ROJO = "#dc2626";
const ACERO = "#4a6fa5";

/** Grosor máximo de una barra horizontal, en px. Ver lib/panel-odoo/grosor-barra.ts. */
const GROSOR_DE_BARRA = 44;
/** Alto de los gráficos del detalle. */
const ALTO = 260;

function useTema() {
  // Apex escribe los colores COMO ATRIBUTOS del SVG: una variable CSS no lo sigue, así
  // que el tema llega como valor y el gráfico se redibuja al cambiarlo.
  return useSyncExternalStore(suscribirseAlTema, temaActual, () => "light" as const);
}

function compacto(v: number): string {
  return new Intl.NumberFormat("es-CL", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(v);
}

/** Un eje que cuenta cosas: siempre enteros. Sin esto Apex rotula "1,5 tareas". */
function ejeDeConteo(maximo: number) {
  return {
    min: 0,
    max: Math.max(1, maximo),
    tickAmount: Math.min(5, Math.max(1, maximo)),
    decimalsInFloat: 0,
    labels: { formatter: (v: string | number) => String(Math.round(Number(v))) },
  };
}

/** Horas con una decimal como mucho: "12,5 h" y no "12,4999999 h". */
function horas(v: number): string {
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(v)} h`;
}

function baseDe(tema: "light" | "dark", alto: number): ApexOptions {
  const tinta = tema === "dark" ? "#f2ede4" : "#171411";
  const borde = tema === "dark" ? "#37322b" : "#e7e1d8";
  return {
    chart: {
      height: alto,
      fontFamily: "inherit",
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: true, speed: 300 },
      selection: { enabled: false },
    },
    theme: { mode: tema },
    grid: { borderColor: borde, strokeDashArray: 3, padding: { left: 4, right: 4 } },
    tooltip: {
      theme: tema,
      style: { fontSize: "11px" },
      // Apex rellena el tooltip con el color de la serie en pie/donut (fillSeriesColor va
      // en true por omisión ahí): quedaba un bloque sólido en vez de la placa sobre la
      // superficie del tema, como en todos los demás gráficos del panel.
      fillSeriesColor: false,
    },
    dataLabels: { enabled: false },
    legend: {
      position: "bottom",
      horizontalAlign: "center",
      fontSize: "11px",
      markers: { size: 6 },
      labels: { colors: tinta },
    },
    xaxis: {
      labels: { style: { fontSize: "10px", colors: tinta } },
      axisBorder: { color: borde },
      axisTicks: { color: borde },
    },
    yaxis: { labels: { style: { fontSize: "10px", colors: tinta }, formatter: compacto } },
    states: { hover: { filter: { type: "lighten" } }, active: { filter: { type: "none" } } },
    noData: { text: "Sin datos para estos filtros", style: { fontSize: "12px", color: GRIS } },
  };
}

/**
 * Barras horizontales apiladas: hechas y pendientes de cada grupo.
 *
 * Apiladas y no una sola barra de total porque la pregunta de esta pantalla no es
 * "cuántas tareas tiene Ana", es "cuántas le quedan". Con una barra sola, alguien con
 * veinte tareas todas cerradas se veía igual de cargado que alguien con veinte abiertas.
 */
function BarrasDeAvance({
  grupos,
  color,
  onElegir,
}: {
  grupos: Grupo[];
  color: string;
  onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, ALTO);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      stacked: true,
      events: {
        dataPointSelection: (_e, _c, config) => {
          const grupo = grupos[config?.dataPointIndex ?? -1];
          if (grupo) onElegir(grupo.clave);
        },
      },
    },
    colors: [color, GRIS],
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: grosorDeBarra(ALTO, grupos.length, GROSOR_DE_BARRA),
        borderRadius: 3,
      },
    },
    stroke: { width: 0 },
    xaxis: {
      ...base.xaxis,
      categories: grupos.map((g) => g.etiqueta),
      ...ejeDeConteo(Math.max(1, ...grupos.map((g) => g.cantidad))),
    },
    yaxis: {
      labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 140 },
    },
    tooltip: { ...base.tooltip, y: { formatter: (v: number) => `${Math.round(v)} tarea(s)` } },
  };
  const series = [
    { name: "Abiertas", data: grupos.map((g) => g.cantidad - g.cerradas) },
    { name: "Cerradas", data: grupos.map((g) => g.cerradas) },
  ];
  return <ReactApexChart options={opciones} series={series} type="bar" height={ALTO} />;
}

/** En qué etapa del tablero está el trabajo. El clic filtra esa etapa. */
export function GraficoPorEtapa({ grupos, onElegir }: { grupos: Grupo[]; onElegir: (clave: string) => void }) {
  return <BarrasDeAvance grupos={grupos} color={TEAL} onElegir={onElegir} />;
}

/** Cuánto tiene encima cada persona. El clic filtra ese responsable. */
export function GraficoPorResponsable({ grupos, onElegir }: { grupos: Grupo[]; onElegir: (clave: string) => void }) {
  return <BarrasDeAvance grupos={grupos} color={ACERO} onElegir={onElegir} />;
}

/** Cuánto trabajo tiene cada proyecto. El clic filtra ese proyecto. */
export function GraficoPorProyecto({ grupos, onElegir }: { grupos: Grupo[]; onElegir: (clave: string) => void }) {
  return <BarrasDeAvance grupos={grupos} color={NARANJO} onElegir={onElegir} />;
}

/**
 * Cuán cerca está cada plazo. El clic filtra ese tramo.
 *
 * Del rojo al verde y de izquierda a derecha, en orden de urgencia: lo vencido primero,
 * lo que no tiene plazo al final.
 */
export function GraficoHorizonteDePlazos({
  tramos,
  onElegir,
}: {
  tramos: TramoDePlazo[];
  onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, 200);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      height: 200,
      events: {
        dataPointSelection: (_e, _c, config) => {
          // Los tramos de en medio ("En 30 días", "Más adelante") no tienen un filtro
          // propio: su clave viene vacía y el clic no hace nada, en vez de limpiar el
          // filtro por sorpresa.
          const tramo = tramos[config?.dataPointIndex ?? -1];
          if (tramo?.clave) onElegir(tramo.clave);
        },
      },
    },
    colors: [ROJO, NARANJO, NARANJO_SUAVE, TEAL, GRIS],
    plotOptions: {
      bar: { columnWidth: "55%", borderRadius: 3, distributed: true, dataLabels: { position: "top" } },
    },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => (v > 0 ? String(v) : ""),
      style: { fontSize: "10px", colors: [tema === "dark" ? "#f2ede4" : "#171411"] },
      offsetY: -18,
    },
    xaxis: { ...base.xaxis, categories: tramos.map((t) => t.etiqueta) },
    yaxis: ejeDeConteo(Math.max(1, ...tramos.map((t) => t.cantidad))),
    tooltip: { ...base.tooltip, y: { formatter: (v: number) => `${Math.round(v)} tarea(s) abiertas` } },
  };
  return (
    <ReactApexChart
      options={opciones}
      series={[{ name: "Abiertas", data: tramos.map((t) => t.cantidad) }]}
      type="bar"
      height={200}
    />
  );
}

/**
 * El semáforo que el jefe de proyecto mantiene en Odoo.
 *
 * Los colores siguen el significado, no el orden: fuera de curso en rojo, en riesgo en
 * naranjo, en curso en verde. Sin estado va en gris, que es exactamente lo que es.
 */
export function GraficoSalud({ puntos }: { puntos: PuntoDeSalud[] }) {
  const tema = useTema();
  const base = baseDe(tema, 220);
  const total = puntos.reduce((a, p) => a + p.cantidad, 0);
  const COLOR_POR_ESTADO: Record<string, string> = {
    off_track: ROJO,
    at_risk: NARANJO,
    on_hold: NARANJO_SUAVE,
    to_define: GRIS,
    "": GRIS,
    on_track: TEAL,
    done: TEAL_SUAVE,
  };
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "donut",
      height: 220,
      // Sin animación: un anillo a medio dibujar se lee como un gráfico roto.
      animations: { enabled: false },
    },
    colors: puntos.map((p) => COLOR_POR_ESTADO[p.clave] ?? GRIS),
    labels: puntos.map((p) => p.etiqueta),
    stroke: { width: puntos.length > 1 ? 2 : 0 },
    plotOptions: {
      pie: {
        expandOnClick: false,
        hoverOutline: { show: false },
        donut: {
          size: "68%",
          labels: {
            show: true,
            name: { fontSize: "11px" },
            value: { fontSize: "14px", fontWeight: 700 },
            total: { show: true, label: "Proyectos", fontSize: "11px", formatter: () => String(total) },
          },
        },
      },
    },
    tooltip: {
      ...base.tooltip,
      // Anclado a una esquina por el mismo motivo que las donas de Gastos: para un donut
      // Apex ubica el tooltip con clientX/clientY, que acá llegan en 0.
      fixed: { enabled: true, position: "topRight", offsetX: 0, offsetY: 0 },
      y: {
        formatter: (v: number, opts) => {
          const punto = puntos[opts?.seriesIndex ?? -1];
          const nombres = punto?.proyectos ?? [];
          return `${Math.round(v)}: ${nombres.slice(0, 4).join(", ")}${nombres.length > 4 ? "…" : ""}`;
        },
      },
    },
    yaxis: { show: false },
  };
  return (
    <ReactApexChart options={opciones} series={puntos.map((p) => p.cantidad)} type="donut" height={220} />
  );
}

/** En qué se va la plata de los proyectos. El clic filtra ese proyecto. */
export function GraficoGastoPorCategoria({ grupos }: { grupos: GrupoDeGasto[] }) {
  const tema = useTema();
  const base = baseDe(tema, 220);
  const total = grupos.reduce((a, g) => a + g.monto, 0);
  const opciones: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "donut", height: 220, animations: { enabled: false } },
    // Los colores los define el módulo de Odoo (CATEGORY_COLORS): la torta de acá sale
    // del mismo color que la de allá y nadie traduce entre las dos pantallas.
    colors: grupos.map((g) => g.color),
    labels: grupos.map((g) => g.etiqueta),
    stroke: { width: grupos.length > 1 ? 2 : 0 },
    plotOptions: {
      pie: {
        expandOnClick: false,
        hoverOutline: { show: false },
        donut: {
          size: "68%",
          labels: {
            show: true,
            name: { fontSize: "11px" },
            value: { fontSize: "14px", fontWeight: 700, formatter: (v: string) => money(Number(v)) },
            total: { show: true, label: "Total", fontSize: "11px", formatter: () => money(total) },
          },
        },
      },
    },
    tooltip: {
      ...base.tooltip,
      fixed: { enabled: true, position: "topRight", offsetX: 0, offsetY: 0 },
      y: {
        formatter: (v: number, opts) => {
          const detalle = grupos[opts?.seriesIndex ?? -1]?.detalle ?? [];
          return `${money(v)} · ${detalle.slice(0, 4).join(" · ")}${detalle.length > 4 ? "…" : ""}`;
        },
      },
    },
    yaxis: { show: false },
  };
  return <ReactApexChart options={opciones} series={grupos.map((g) => g.monto)} type="donut" height={220} />;
}

/**
 * Presupuesto contra gasto, proyecto por proyecto. El clic filtra ese proyecto.
 *
 * Apilada: el largo total de la barra es el presupuesto y el relleno naranjo es lo
 * gastado, así que un proyecto que se pasó se ve porque su barra es toda naranja y el
 * tooltip dice el porcentaje.
 */
export function GraficoPresupuesto({
  puntos,
  onElegir,
}: {
  puntos: PuntoDePresupuesto[];
  onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, ALTO);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      stacked: true,
      events: {
        dataPointSelection: (_e, _c, config) => {
          const punto = puntos[config?.dataPointIndex ?? -1];
          if (punto?.clave) onElegir(punto.clave);
        },
      },
    },
    colors: [NARANJO, TEAL_SUAVE],
    plotOptions: {
      bar: { horizontal: true, barHeight: grosorDeBarra(ALTO, puntos.length, GROSOR_DE_BARRA), borderRadius: 3 },
    },
    stroke: { width: 0 },
    xaxis: {
      ...base.xaxis,
      categories: puntos.map((p) => p.etiqueta),
      labels: { ...base.xaxis?.labels, formatter: (v: string | number) => compacto(Number(v)) },
      tickAmount: 4,
    },
    yaxis: {
      labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 140 },
    },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opts) => {
          const punto = puntos[opts?.dataPointIndex ?? -1];
          const pct = punto ? ` · ${punto.porcentaje}% del presupuesto` : "";
          return `${money(v)}${opts?.seriesIndex === 0 ? pct : ""}`;
        },
      },
    },
  };
  const series = [
    { name: "Gastado", data: puntos.map((p) => p.gastado) },
    { name: "Disponible", data: puntos.map((p) => p.disponible) },
  ];
  return <ReactApexChart options={opciones} series={series} type="bar" height={ALTO} />;
}

/**
 * Horas planificadas contra trabajadas. El clic filtra ese proyecto.
 *
 * Dos barras lado a lado y no apiladas: acá lo que importa es comparar dos magnitudes
 * independientes, y apiladas se leerían como si sumaran algo.
 */
export function GraficoHoras({
  puntos,
  onElegir,
}: {
  puntos: PuntoDeHoras[];
  onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, ALTO);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      events: {
        dataPointSelection: (_e, _c, config) => {
          const punto = puntos[config?.dataPointIndex ?? -1];
          if (punto?.clave) onElegir(punto.clave);
        },
      },
    },
    colors: [ACERO, NARANJO],
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: grosorDeBarra(ALTO, puntos.length * 2, GROSOR_DE_BARRA),
        borderRadius: 3,
      },
    },
    stroke: { width: 0 },
    xaxis: {
      ...base.xaxis,
      categories: puntos.map((p) => p.etiqueta),
      labels: { ...base.xaxis?.labels, formatter: (v: string | number) => compacto(Number(v)) },
      tickAmount: 4,
    },
    yaxis: {
      labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 140 },
    },
    tooltip: { ...base.tooltip, y: { formatter: (v: number) => horas(v) } },
  };
  const series = [
    { name: "Planificadas", data: puntos.map((p) => p.asignadas) },
    { name: "Trabajadas", data: puntos.map((p) => p.gastadas) },
  ];
  return <ReactApexChart options={opciones} series={series} type="bar" height={ALTO} />;
}

/**
 * El avance de objetivos de cada proyecto, de menor a mayor. El clic filtra ese proyecto.
 *
 * De menor a mayor a propósito: arriba queda lo que va más atrás, que es por donde se
 * empieza a mirar.
 */
export function GraficoAvance({
  puntos,
  onElegir,
}: {
  puntos: PuntoDeAvance[];
  onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, ALTO);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      events: {
        dataPointSelection: (_e, _c, config) => {
          const punto = puntos[config?.dataPointIndex ?? -1];
          if (punto?.clave) onElegir(punto.clave);
        },
      },
    },
    colors: [TEAL],
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: grosorDeBarra(ALTO, puntos.length, GROSOR_DE_BARRA),
        borderRadius: 3,
        dataLabels: { position: "center" },
      },
    },
    legend: { show: false },
    stroke: { width: 0 },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => `${Math.round(v)}%`,
      style: { fontSize: "10px", colors: ["#fff"] },
    },
    xaxis: {
      ...base.xaxis,
      categories: puntos.map((p) => p.etiqueta),
      min: 0,
      max: 100,
      tickAmount: 4,
      labels: { ...base.xaxis?.labels, formatter: (v: string | number) => `${Math.round(Number(v))}%` },
    },
    yaxis: {
      labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 140 },
    },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opts) => {
          const punto = puntos[opts?.dataPointIndex ?? -1];
          return punto ? `${punto.hechos} de ${punto.total} objetivos (${Math.round(v)}%)` : `${Math.round(v)}%`;
        },
      },
    },
  };
  return (
    <ReactApexChart
      options={opciones}
      series={[{ name: "Avance", data: puntos.map((p) => p.avance) }]}
      type="bar"
      height={ALTO}
    />
  );
}
