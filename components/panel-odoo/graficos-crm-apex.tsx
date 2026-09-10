"use client";

import { useSyncExternalStore } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { money } from "@/lib/cotizador/formato";
import { suscribirseAlTema, temaActual } from "@/lib/tema";
import { grosorDeBarra } from "@/lib/panel-odoo/grosor-barra";
import type {
  EscalonDelEmbudo,
  Porcion,
  PuntoMensual,
  TramoDeAntiguedad,
  Vendedor,
} from "@/lib/panel-odoo/crm-series";

// Los gráficos de CRM, con ApexCharts. No se importa directo: entra por
// ./graficos-crm.tsx con dynamic({ ssr: false }), porque Apex mide el DOM para dibujar.
//
// Cada punto es CLICKEABLE y filtra la tabla de abajo, igual que en Facturas: una etapa
// del embudo, una porción del reparto, un motivo de pérdida, un vendedor, un mes.

const NARANJO = "#c85217";
const NARANJO_SUAVE = "#e07a3d";
const TEAL = "#00a080";
const TEAL_SUAVE = "#35b89b";
const GRIS = "#8c8578";
const ROJO = "#dc2626";

/** Grosor máximo de una barra horizontal, en px. Ver lib/panel-odoo/grosor-barra.ts. */
const GROSOR_DE_BARRA = 22;

function useTema() {
  // Apex escribe los colores COMO ATRIBUTOS del SVG: un var() de CSS no lo sigue, así que
  // el tema llega como valor y el gráfico se redibuja al cambiarlo.
  return useSyncExternalStore(suscribirseAlTema, temaActual, () => "light" as const);
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
    tooltip: { theme: tema, style: { fontSize: "11px" } },
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
    yaxis: {
      labels: { style: { fontSize: "10px", colors: tinta } },
      tickAmount: 4,
      forceNiceScale: true,
    },
    states: { hover: { filter: { type: "lighten" } }, active: { filter: { type: "none" } } },
    noData: { text: "Sin datos para estos filtros", style: { fontSize: "12px", color: GRIS } },
  };
}

/**
 * Un eje que cuenta cosas: siempre enteros.
 *
 * Sin esto Apex reparte el eje en pasos de 0,5 y el gráfico muestra "1,5 oportunidades",
 * que no existe. Se limita la cantidad de marcas al máximo real para que caigan en
 * enteros, y se apagan los decimales.
 */
function ejeDeConteo(maximo: number) {
  return {
    min: 0,
    max: Math.max(1, maximo),
    tickAmount: Math.min(5, Math.max(1, maximo)),
    decimalsInFloat: 0,
    // El formatter además de decimalsInFloat: en las barras HORIZONTALES el eje de los
    // números es el x, y ahí Apex ignora decimalsInFloat y rotula "0.0 1.0 2.0".
    labels: { formatter: (v: string | number) => String(Math.round(Number(v))) },
  };
}

function rotuloDeMes(mes: string): string {
  const [anio, m] = mes.split("-");
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m) - 1] ?? m} ${anio.slice(2)}`;
}

/**
 * El embudo, en barras horizontales por CANTIDAD.
 *
 * Por cantidad y no por monto, a propósito: en este CRM la mayoría de las oportunidades
 * abiertas tiene monto 0, así que un embudo por monto se ve vacío y parece roto. El monto
 * de cada etapa va en el tooltip, donde no miente sobre el largo de la barra.
 */
export function GraficoEmbudo({
  escalones,
  onElegirEtapa,
  etapaElegida,
}: {
  escalones: EscalonDelEmbudo[];
  onElegirEtapa: (etapa: string) => void;
  etapaElegida: string;
}) {
  const tema = useTema();
  const base = baseDe(tema, 260);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      events: {
        dataPointSelection: (_e, _c, config) => {
          const escalon = escalones[config?.dataPointIndex ?? -1];
          if (escalon) onElegirEtapa(escalon.filtro);
        },
      },
    },
    colors: [TEAL],
    plotOptions: {
      bar: {
        horizontal: true,
        // Tope en píxeles y no un porcentaje: con tres etapas, un 65% del espacio de cada
        // fila son barras de 56 px que se ven como lingotes. Ver grosorDeBarra.
        barHeight: grosorDeBarra(260, escalones.length, GROSOR_DE_BARRA),
        borderRadius: 3,
        distributed: false,
      },
    },
    // La etapa filtrada se ve; el resto baja de opacidad. Sin esto, el clic filtra la
    // tabla y el gráfico no dice sobre qué.
    fill: { opacity: etapaElegida ? escalones.map((e) => (e.etapa === etapaElegida ? 1 : 0.35)) : 1 },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => (v > 0 ? String(v) : ""),
      style: { fontSize: "10px", colors: ["#ffffff"] },
    },
    xaxis: (() => {
      const eje = ejeDeConteo(Math.max(0, ...escalones.map((e) => e.cantidad)));
      return {
        ...base.xaxis,
        categories: escalones.map((e) => e.etapa),
        ...eje,
        labels: { ...base.xaxis?.labels, ...eje.labels },
      };
    })(),
    yaxis: { labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 150 } },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opts) => {
          const e = escalones[opts?.dataPointIndex ?? -1];
          return `${v} oportunidad(es) · ${money(e?.monto ?? 0)} esperado · ${money(e?.montoPonderado ?? 0)} ponderado`;
        },
        title: { formatter: () => "" },
      },
    },
  };

  return (
    <ReactApexChart
      type="bar"
      height={260}
      options={opciones}
      series={[{ name: "Abiertas", data: escalones.map((e) => e.cantidad) }]}
    />
  );
}

/** Creadas, ganadas y perdidas por mes. El clic en un mes filtra ese mes. */
export function GraficoTendenciaCrm({
  datos,
  onElegirMes,
  mesElegido,
}: {
  datos: PuntoMensual[];
  onElegirMes: (mes: string) => void;
  mesElegido: string | null;
}) {
  const tema = useTema();
  const base = baseDe(tema, 240);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      stacked: false,
      zoom: { enabled: true, type: "x", autoScaleYaxis: true },
      toolbar: {
        show: true,
        tools: { download: false, pan: false, reset: true, zoom: true, zoomin: true, zoomout: true, selection: false },
      },
      events: {
        dataPointSelection: (_e, _c, config) => {
          const punto = datos[config?.dataPointIndex ?? -1];
          if (punto) onElegirMes(punto.mes);
        },
      },
    },
    colors: [GRIS, TEAL, ROJO],
    plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
    stroke: { width: 0 },
    fill: { opacity: mesElegido ? datos.map((p) => (p.mes === mesElegido ? 1 : 0.35)) : 1 },
    xaxis: { ...base.xaxis, categories: datos.map((p) => rotuloDeMes(p.mes)) },
    yaxis: (() => {
      const eje = ejeDeConteo(Math.max(0, ...datos.map((p) => Math.max(p.creadas, p.ganadas, p.perdidas))));
      return {
        ...eje,
        labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, ...eje.labels },
      };
    })(),
    tooltip: { ...base.tooltip, shared: true, intersect: false },
  };

  return (
    <ReactApexChart
      type="bar"
      height={240}
      options={opciones}
      series={[
        { name: "Creadas", data: datos.map((p) => p.creadas) },
        { name: "Ganadas", data: datos.map((p) => p.ganadas) },
        { name: "Perdidas", data: datos.map((p) => p.perdidas) },
      ]}
    />
  );
}

/** Una dona: reparto por estado o motivos de pérdida. El clic filtra. */
export function GraficoTortaCrm({
  porciones,
  onElegir,
  titulo,
  paleta = "estado",
  porCantidad = false,
}: {
  porciones: Porcion[];
  onElegir: (filtro: string) => void;
  titulo: string;
  paleta?: "estado" | "motivos";
  porCantidad?: boolean;
}) {
  const tema = useTema();
  const base = baseDe(tema, 220);
  const colores =
    paleta === "estado" ? [TEAL, ROJO, NARANJO_SUAVE, GRIS] : [ROJO, NARANJO, NARANJO_SUAVE, TEAL_SUAVE, GRIS];
  const valores = porciones.map((p) => (porCantidad ? p.cantidad : Math.round(p.monto)));
  const total = valores.reduce((a, v) => a + v, 0);

  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "donut",
      events: {
        dataPointSelection: (_e, _c, config) => {
          const porcion = porciones[config?.dataPointIndex ?? -1];
          if (porcion) onElegir(porcion.filtro);
        },
      },
    },
    colors: colores,
    labels: porciones.map((p) => p.etiqueta),
    plotOptions: {
      pie: {
        // Que la porción se separe al apretarla: es la señal de que se puede clickear.
        expandOnClick: true,
        donut: {
          size: "68%",
          labels: {
            show: true,
            name: { fontSize: "11px" },
            value: {
              fontSize: "14px",
              fontWeight: 700,
              formatter: (v: string) => (porCantidad ? String(Number(v)) : money(Number(v))),
            },
            total: {
              show: true,
              label: titulo,
              fontSize: "11px",
              formatter: () => (porCantidad ? String(total) : money(total)),
            },
          },
        },
      },
    },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opts) => {
          const p = porciones[opts?.seriesIndex ?? -1];
          return porCantidad
            ? `${v} oportunidad(es) · ${money(p?.monto ?? 0)}`
            : `${money(v)} · ${p?.cantidad ?? 0} oportunidad(es)`;
        },
      },
    },
    // Una dona no tiene ejes; se apagan en vez de borrar las claves (con `grid:
    // undefined` Apex lanza leyendo grid.padding y no dibuja nada).
    yaxis: { show: false },
    grid: { ...base.grid, show: false },
  };

  return <ReactApexChart type="donut" height={220} options={opciones} series={valores} />;
}

/** Cada vendedor con su pipeline y su resultado. El clic busca ese nombre. */
export function GraficoVendedores({
  vendedores,
  onElegir,
}: {
  vendedores: Vendedor[];
  onElegir: (nombre: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, 260);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      stacked: true,
      events: {
        dataPointSelection: (_e, _c, config) => {
          const v = vendedores[config?.dataPointIndex ?? -1];
          if (v) onElegir(v.nombre);
        },
      },
    },
    colors: [NARANJO, TEAL, ROJO],
    plotOptions: {
      bar: { horizontal: true, barHeight: grosorDeBarra(260, vendedores.length, GROSOR_DE_BARRA), borderRadius: 3 },
    },
    stroke: { width: 0 },
    xaxis: (() => {
      // Apilado: el máximo del eje es la SUMA de las tres series, no la más alta.
      const eje = ejeDeConteo(Math.max(0, ...vendedores.map((v) => v.abiertas + v.ganadas + v.perdidas)));
      return {
        ...base.xaxis,
        categories: vendedores.map((v) => v.nombre),
        ...eje,
        labels: { ...base.xaxis?.labels, ...eje.labels },
      };
    })(),
    yaxis: { labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 150 } },
    tooltip: { ...base.tooltip, shared: true, intersect: false },
  };

  return (
    <ReactApexChart
      type="bar"
      height={260}
      options={opciones}
      series={[
        { name: "Abiertas", data: vendedores.map((v) => v.abiertas) },
        { name: "Ganadas", data: vendedores.map((v) => v.ganadas) },
        { name: "Perdidas", data: vendedores.map((v) => v.perdidas) },
      ]}
    />
  );
}

/** Cuánto llevan sin moverse las abiertas. El clic en los tramos viejos filtra las estancadas. */
export function GraficoAntiguedad({
  tramos,
  onElegirEstancadas,
}: {
  tramos: TramoDeAntiguedad[];
  onElegirEstancadas: () => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, 200);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      events: {
        dataPointSelection: (_e, _c, config) => {
          // Los dos primeros tramos son pipeline sano: filtrarlos como estancadas sería
          // mentir.
          if ((config?.dataPointIndex ?? 0) >= 2) onElegirEstancadas();
        },
      },
    },
    // Del verde al rojo según envejece: el color dice lo mismo que el rótulo.
    colors: [TEAL, TEAL_SUAVE, NARANJO_SUAVE, NARANJO, ROJO],
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
    yaxis: (() => {
      const eje = ejeDeConteo(Math.max(0, ...tramos.map((t) => t.cantidad)));
      return {
        ...eje,
        labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, ...eje.labels },
      };
    })(),
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opts) =>
          `${v} oportunidad(es) · ${money(tramos[opts?.dataPointIndex ?? -1]?.monto ?? 0)}`,
        title: { formatter: () => "Abiertas" },
      },
    },
  };

  return (
    <ReactApexChart
      type="bar"
      height={200}
      options={opciones}
      series={[{ name: "Abiertas", data: tramos.map((t) => t.cantidad) }]}
    />
  );
}
