"use client";

import { useSyncExternalStore } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { money } from "@/lib/cotizador/formato";
import { suscribirseAlTema, temaActual } from "@/lib/tema";
import { grosorDeBarra } from "@/lib/panel-odoo/grosor-barra";
import type {
  EstadoDeArriendo,
  Porcion,
  PuntoMensual,
  TramoDeVencimiento,
  Vendedor,
} from "@/lib/panel-odoo/ventas-series";

// Los gráficos del detalle de Ventas y Arriendo. No se importa directo: entra por
// ./graficos-ventas.tsx con dynamic({ ssr: false }), porque Apex mide el DOM para dibujar.
//
// Cada punto es CLICKEABLE y filtra la tabla de abajo, igual que en Facturas y CRM.

const NARANJO = "#c85217";
const NARANJO_SUAVE = "#e07a3d";
const TEAL = "#00a080";
const TEAL_SUAVE = "#35b89b";
const GRIS = "#8c8578";
const ROJO = "#dc2626";

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

/** Un eje que cuenta cosas: siempre enteros. Sin esto Apex rotula "1,5 órdenes". */
function ejeDeConteo(maximo: number) {
  return {
    min: 0,
    max: Math.max(1, maximo),
    tickAmount: Math.min(5, Math.max(1, maximo)),
    decimalsInFloat: 0,
    labels: { formatter: (v: string | number) => String(Math.round(Number(v))) },
  };
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
    yaxis: { labels: { style: { fontSize: "10px", colors: tinta }, formatter: compacto } },
    states: { hover: { filter: { type: "lighten" } }, active: { filter: { type: "none" } } },
    noData: { text: "Sin datos para estos filtros", style: { fontSize: "12px", color: GRIS } },
  };
}

function rotuloDeMes(mes: string): string {
  const [anio, m] = mes.split("-");
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m) - 1] ?? m} ${anio.slice(2)}`;
}

/** Cotizado, confirmado y arrendado por mes. El clic en un mes filtra ese mes. */
export function GraficoTendenciaVentas({
  datos,
  onElegirMes,
  mesElegido,
}: {
  datos: PuntoMensual[];
  onElegirMes: (mes: string) => void;
  mesElegido: string | null;
}) {
  const tema = useTema();
  const base = baseDe(tema, ALTO);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
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
    colors: [GRIS, TEAL, NARANJO],
    plotOptions: { bar: { columnWidth: "70%", borderRadius: 2 } },
    stroke: { width: 0 },
    fill: { opacity: mesElegido ? datos.map((p) => (p.mes === mesElegido ? 1 : 0.35)) : 1 },
    xaxis: { ...base.xaxis, categories: datos.map((p) => rotuloDeMes(p.mes)) },
    tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => money(v) } },
  };

  return (
    <ReactApexChart
      type="bar"
      height={ALTO}
      options={opciones}
      series={[
        { name: "Cotizado", data: datos.map((p) => Math.round(p.cotizado)) },
        { name: "Confirmado", data: datos.map((p) => Math.round(p.confirmado)) },
        { name: "Arrendado", data: datos.map((p) => Math.round(p.arrendado)) },
      ]}
    />
  );
}

/** Una dona por monto: dónde está la plata. El clic filtra ese grupo. */
export function GraficoDondeEstaLaPlata({
  porciones,
  onElegir,
}: {
  porciones: Porcion[];
  onElegir: (filtro: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, 220);
  const total = porciones.reduce((a, p) => a + p.monto, 0);
  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "donut",
      height: 220,
      // Sin animación: un anillo a medio dibujar se lee como un gráfico roto.
      animations: { enabled: false },
      events: {
        dataPointSelection: (_e, _c, config) => {
          const porcion = porciones[config?.dataPointIndex ?? -1];
          if (porcion) onElegir(porcion.filtro);
        },
      },
    },
    colors: [GRIS, NARANJO, TEAL],
    labels: porciones.map((p) => p.etiqueta),
    stroke: { width: porciones.length > 1 ? 2 : 0 },
    plotOptions: {
      pie: {
        expandOnClick: true,
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
      y: {
        formatter: (v: number, opts) =>
          `${money(v)} · ${porciones[opts?.seriesIndex ?? -1]?.cantidad ?? 0} orden(es)`,
      },
    },
    yaxis: { show: false },
    grid: { ...base.grid, show: false },
  };

  return <ReactApexChart type="donut" height={220} options={opciones} series={porciones.map((p) => Math.round(p.monto))} />;
}

/** Los arriendos por estado. El clic filtra los arriendos. */
export function GraficoArriendosPorEstado({
  estados,
  onElegir,
}: {
  estados: EstadoDeArriendo[];
  onElegir: (filtro: string) => void;
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
          const estado = estados[config?.dataPointIndex ?? -1];
          if (estado) onElegir(estado.filtro);
        },
      },
    },
    colors: [TEAL, TEAL_SUAVE, NARANJO_SUAVE, NARANJO, GRIS],
    plotOptions: {
      bar: {
        horizontal: true,
        distributed: true,
        barHeight: grosorDeBarra(ALTO, estados.length, GROSOR_DE_BARRA),
        borderRadius: 3,
      },
    },
    legend: { show: false },
    stroke: { width: 0 },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => (v > 0 ? String(v) : ""),
      style: { fontSize: "10px", colors: ["#ffffff"] },
    },
    xaxis: {
      ...base.xaxis,
      categories: estados.map((e) => e.estado),
      ...ejeDeConteo(Math.max(0, ...estados.map((e) => e.cantidad))),
      labels: { ...base.xaxis?.labels, formatter: (v: string | number) => String(Math.round(Number(v))) },
    },
    yaxis: { labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 140 } },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opts) =>
          `${v} arriendo(s) · ${money(estados[opts?.dataPointIndex ?? -1]?.monto ?? 0)}`,
        title: { formatter: () => "" },
      },
    },
  };

  return (
    <ReactApexChart
      type="bar"
      height={ALTO}
      options={opciones}
      series={[{ name: "Arriendos", data: estados.map((e) => e.cantidad) }]}
    />
  );
}

/** Cotizado y confirmado por vendedor, en monto. El clic busca ese nombre. */
export function GraficoVendedoresVentas({
  vendedores,
  onElegir,
}: {
  vendedores: Vendedor[];
  onElegir: (nombre: string) => void;
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
          const v = vendedores[config?.dataPointIndex ?? -1];
          if (v) onElegir(v.nombre);
        },
      },
    },
    colors: [GRIS, TEAL],
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: grosorDeBarra(ALTO, vendedores.length, GROSOR_DE_BARRA),
        borderRadius: 3,
      },
    },
    stroke: { width: 0 },
    xaxis: { ...base.xaxis, categories: vendedores.map((v) => v.nombre), labels: { ...base.xaxis?.labels, formatter: (v: string | number) => compacto(Number(v)) }, tickAmount: 4 },
    yaxis: { labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 140 } },
    tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => money(v) } },
  };

  return (
    <ReactApexChart
      type="bar"
      height={ALTO}
      options={opciones}
      series={[
        { name: "Cotizado", data: vendedores.map((v) => Math.round(v.montoCotizado)) },
        { name: "Confirmado", data: vendedores.map((v) => Math.round(v.montoConfirmado)) },
      ]}
    />
  );
}

/** Cuándo terminan los arriendos en curso. El clic en los tramos vencidos filtra los atrasados. */
export function GraficoVencimientos({
  tramos,
  onElegirAtrasados,
}: {
  tramos: TramoDeVencimiento[];
  onElegirAtrasados: () => void;
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
          // Solo el primer tramo es atraso; los demás son calendario normal.
          if ((config?.dataPointIndex ?? -1) === 0) onElegirAtrasados();
        },
      },
    },
    // Del rojo al verde: lo urgente primero, que es como se lee el eje.
    colors: [ROJO, NARANJO, NARANJO_SUAVE, TEAL_SUAVE, TEAL],
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
          `${v} arriendo(s) · ${money(tramos[opts?.dataPointIndex ?? -1]?.monto ?? 0)}`,
        title: { formatter: () => "En curso" },
      },
    },
  };

  return (
    <ReactApexChart
      type="bar"
      height={200}
      options={opciones}
      series={[{ name: "En curso", data: tramos.map((t) => t.cantidad) }]}
    />
  );
}
