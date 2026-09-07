"use client";

import { useSyncExternalStore } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { money } from "@/lib/cotizador/formato";
import { suscribirseAlTema, temaActual } from "@/lib/tema";
import type { Contraparte, Porcion, PuntoMensual, TramoDeMora } from "@/lib/panel-odoo/facturas-series";

// Los gráficos de facturas, con ApexCharts. Este archivo NO se importa directo: entra por
// ./graficos-facturas.tsx con dynamic({ ssr: false }), porque Apex mide el DOM para
// dibujar y en el servidor no hay DOM (mismo motivo que los de Recharts, ver graficos.tsx).
//
// Lo que aportan sobre los de Recharts, y por lo que están acá: cada punto es
// CLICKEABLE y aplica el filtro de la tabla de abajo. Un mes de la tendencia filtra ese
// mes, una porción de la torta filtra ese estado, una barra de contraparte busca ese
// nombre. Eso es todo el sentido del cambio -- no es un cambio de biblioteca por gusto.
//
// Los datos ya vienen agregados y probados (lib/panel-odoo/facturas-series.ts): acá solo
// se arman opciones de Apex.

const NARANJO = "#c85217";
const NARANJO_SUAVE = "#e07a3d";
const TEAL = "#00a080";
const TEAL_SUAVE = "#35b89b";
const GRIS = "#8c8578";
const ROJO = "#dc2626";

/**
 * El tema, para volver a dibujar cuando cambia.
 *
 * Apex escribe los colores COMO ATRIBUTOS del SVG, no con clases ni variables CSS: un
 * `var(--color-tinta)` en un atributo `fill` no se resuelve. Así que el tema tiene que
 * llegar como valor y el gráfico redibujarse al cambiarlo -- si no, en oscuro quedan las
 * etiquetas de los ejes en gris casi negro sobre fondo casi negro.
 */
function useTema() {
  return useSyncExternalStore(suscribirseAlTema, temaActual, () => "light" as const);
}

/** Millones y miles abreviados: en un eje, "$42.358.564" ocupa más que el gráfico. */
function compacto(v: number): string {
  return new Intl.NumberFormat("es-CL", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(v);
}

function baseDe(tema: "light" | "dark", alto: number): ApexOptions {
  const tinta = tema === "dark" ? "#f2ede4" : "#171411";
  const borde = tema === "dark" ? "#37322b" : "#e7e1d8";
  return {
    chart: {
      height: alto,
      fontFamily: "inherit",
      background: "transparent",
      // Sin la barra de herramientas por omisión: son gráficos dentro de un modal y los
      // iconos de descarga/zoom de Apex se pisaban con el botón de cerrar. El zoom que
      // sí sirve (arrastrar sobre la tendencia) se habilita gráfico por gráfico.
      toolbar: { show: false },
      animations: { enabled: true, speed: 300 },
      // El cursor de mano avisa que se puede hacer clic; sin esto la interacción es
      // invisible hasta que alguien la descubre de casualidad.
      selection: { enabled: false },
    },
    theme: { mode: tema },
    grid: { borderColor: borde, strokeDashArray: 3, padding: { left: 4, right: 4 } },
    tooltip: { theme: tema, style: { fontSize: "11px" } },
    dataLabels: { enabled: false },
    legend: {
      position: "top",
      horizontalAlign: "right",
      fontSize: "11px",
      markers: { size: 6 },
      labels: { colors: tinta },
    },
    xaxis: {
      labels: { style: { fontSize: "10px", colors: tinta } },
      axisBorder: { color: borde },
      axisTicks: { color: borde },
    },
    // `tickAmount` + `forceNiceScale` no son cosmética: sin eso Apex etiquetaba 0 y 1 M
    // en un eje donde la barra llegaba a 3,3 M, y los dos rótulos de arriba se
    // superponían hasta quedar ilegibles.
    yaxis: {
      labels: { style: { fontSize: "10px", colors: tinta }, formatter: compacto },
      tickAmount: 4,
      forceNiceScale: true,
    },
    states: { hover: { filter: { type: "lighten" } }, active: { filter: { type: "none" } } },
    noData: { text: "Sin datos para estos filtros", style: { fontSize: "12px", color: GRIS } },
  };
}

/** Un mes "2026-08" a "ago 26", que es lo que cabe en un eje. */
function rotuloDeMes(mes: string): string {
  const [anio, m] = mes.split("-");
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m) - 1] ?? m} ${anio.slice(2)}`;
}

export function GraficoTendenciaFacturas({
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
      id: "facturas-tendencia",
      type: "bar",
      stacked: true,
      // Arrastrar para hacer zoom en un tramo de meses: con dos años de historia la
      // tendencia se aprieta y el zoom es la única forma de mirar un trimestre.
      zoom: { enabled: true, type: "x", autoScaleYaxis: true },
      toolbar: { show: true, tools: { download: false, pan: false, reset: true, zoom: true, zoomin: true, zoomout: true, selection: false } },
      events: {
        dataPointSelection: (_e, _c, config) => {
          const punto = datos[config?.dataPointIndex ?? -1];
          if (punto) onElegirMes(punto.mes);
        },
      },
    },
    colors: [TEAL, NARANJO],
    plotOptions: {
      bar: { columnWidth: "60%", borderRadius: 3, borderRadiusApplication: "end" },
    },
    stroke: { width: 0 },
    // El mes elegido se ve: el resto baja a la mitad de opacidad. Sin esto, hacer clic
    // filtra la tabla y el gráfico no da ninguna señal de sobre qué está filtrando.
    fill: {
      opacity: mesElegido ? datos.map((p) => (p.mes === mesElegido ? 1 : 0.35)) : 1,
    },
    xaxis: {
      ...base.xaxis,
      categories: datos.map((p) => rotuloDeMes(p.mes)),
    },
    // Abajo y no arriba: arriba comparte la fila con los botones de zoom y la leyenda
    // salía cortada ("Cob…").
    legend: { ...base.legend, position: "bottom", horizontalAlign: "center" },
    tooltip: {
      ...base.tooltip,
      shared: true,
      intersect: false,
      y: { formatter: (v: number) => money(v) },
    },
  };

  return (
    <ReactApexChart
      type="bar"
      height={240}
      options={opciones}
      series={[
        { name: "Cobrado", data: datos.map((p) => Math.round(p.cobrado)) },
        { name: "Pendiente", data: datos.map((p) => Math.round(p.pendiente)) },
      ]}
    />
  );
}

export function GraficoTortaFacturas({
  porciones,
  onElegir,
  titulo,
  paleta = "pago",
}: {
  porciones: Porcion[];
  onElegir: (filtro: string) => void;
  titulo: string;
  paleta?: "pago" | "cesion";
}) {
  const tema = useTema();
  const base = baseDe(tema, 220);
  const colores = paleta === "pago" ? [TEAL, ROJO, NARANJO_SUAVE, GRIS] : [TEAL, NARANJO_SUAVE, GRIS];

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
    // El total al centro: es el número que se busca al mirar una torta, y así no hay que
    // sumar tres porciones a ojo.
    plotOptions: {
      pie: {
        // Que la porción se separe al apretarla: es la señal de que la dona se puede
        // clickear, y de cuál está filtrando.
        expandOnClick: true,
        donut: {
          size: "68%",
          labels: {
            show: true,
            name: { fontSize: "11px" },
            value: { fontSize: "14px", fontWeight: 700, formatter: (v: string) => money(Number(v)) },
            total: {
              show: true,
              label: titulo,
              fontSize: "11px",
              formatter: () => money(porciones.reduce((a, p) => a + p.monto, 0)),
            },
          },
        },
      },
    },
    legend: { ...base.legend, position: "bottom", horizontalAlign: "center" },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opciones) =>
          `${money(v)} — ${porciones[opciones?.seriesIndex ?? -1]?.cantidad ?? 0} factura(s)`,
      },
    },
    // Una dona no tiene ejes; se apagan sus etiquetas en vez de borrar la clave entera
    // (`grid: undefined` hace que Apex lance leyendo grid.padding y no se dibuja nada).
    yaxis: { show: false },
    grid: { ...base.grid, show: false },
  };

  return (
    <ReactApexChart type="donut" height={220} options={opciones} series={porciones.map((p) => Math.round(p.monto))} />
  );
}

export function GraficoTopContrapartes({
  contrapartes,
  onElegir,
}: {
  contrapartes: Contraparte[];
  onElegir: (nombre: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, 260);

  const opciones: ApexOptions = {
    ...base,
    chart: {
      ...base.chart,
      type: "bar",
      height: 260,
      stacked: true,
      events: {
        dataPointSelection: (_e, _c, config) => {
          const c = contrapartes[config?.dataPointIndex ?? -1];
          if (c) onElegir(c.nombre);
        },
      },
    },
    colors: [TEAL_SUAVE, NARANJO],
    plotOptions: { bar: { horizontal: true, barHeight: "70%", borderRadius: 3 } },
    stroke: { width: 0 },
    xaxis: {
      ...base.xaxis,
      categories: contrapartes.map((c) => c.nombre),
      labels: { ...base.xaxis?.labels, formatter: (v: string) => compacto(Number(v)) },
      tickAmount: 4,
    },
    yaxis: { labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 160 } },
    tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => money(v) } },
  };

  return (
    <ReactApexChart
      type="bar"
      height={260}
      options={opciones}
      series={[
        { name: "Cobrado", data: contrapartes.map((c) => Math.round(c.monto - c.pendiente)) },
        { name: "Pendiente", data: contrapartes.map((c) => Math.round(c.pendiente)) },
      ]}
    />
  );
}

export function GraficoMora({
  tramos,
  onElegirVencidas,
}: {
  tramos: TramoDeMora[];
  onElegirVencidas: () => void;
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
          // El primer tramo es "Por vencer": no es mora y filtrarlo como vencidas seria
          // mentir.
          if ((config?.dataPointIndex ?? 0) > 0) onElegirVencidas();
        },
      },
    },
    // Del verde al rojo según se envejece: el color dice lo mismo que el rótulo.
    colors: [TEAL, NARANJO_SUAVE, NARANJO, "#e0483d", ROJO],
    plotOptions: {
      bar: { columnWidth: "55%", borderRadius: 3, distributed: true, dataLabels: { position: "top" } },
    },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => (v > 0 ? compacto(v) : ""),
      style: { fontSize: "10px", colors: [tema === "dark" ? "#f2ede4" : "#171411"] },
      offsetY: -18,
    },
    xaxis: { ...base.xaxis, categories: tramos.map((t) => t.etiqueta) },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opciones) =>
          `${money(v)} — ${tramos[opciones?.dataPointIndex ?? -1]?.cantidad ?? 0} factura(s)`,
        title: { formatter: () => "Pendiente" },
      },
    },
  };

  return (
    <ReactApexChart type="bar" height={200} options={opciones} series={[{ name: "Pendiente", data: tramos.map((t) => Math.round(t.monto)) }]} />
  );
}
