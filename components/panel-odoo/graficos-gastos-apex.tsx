"use client";

import { useSyncExternalStore } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { money } from "@/lib/cotizador/formato";
import { suscribirseAlTema, temaActual } from "@/lib/tema";
import { grosorDeBarra } from "@/lib/panel-odoo/grosor-barra";
import type { Grupo, PuntoMensual, TramoDeAntiguedad } from "@/lib/panel-odoo/gastos-series";

// Los gráficos del detalle de Gastos. No se importa directo: entra por ./graficos-gastos.tsx
// con dynamic({ ssr: false }), porque Apex mide el DOM para dibujar.
//
// Cada punto es CLICKEABLE y filtra la tabla de abajo, igual que en Facturas, CRM y Ventas.

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

/** Un eje que cuenta cosas: siempre enteros. Sin esto Apex rotula "1,5 gastos". */
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

function rotuloDeMes(mes: string): string {
  const [anio, m] = mes.split("-");
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombres[Number(m) - 1] ?? m} ${anio.slice(2)}`;
}

/** Lo rendido y lo que sigue en borrador, mes a mes. El clic en un mes filtra ese mes. */
export function GraficoTendenciaGastos({
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
      stacked: true,
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
    // El borrador en naranjo: apilado sobre lo rendido se ve de una cuánto del mes
    // todavía no está tramitado.
    colors: [TEAL, NARANJO],
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
        { name: "Rendido", data: datos.map((p) => Math.round(p.rendido)) },
        { name: "Sin rendir", data: datos.map((p) => Math.round(p.sinRendir)) },
      ]}
    />
  );
}

/** Una dona por monto: en qué se va la plata. El clic filtra esa categoría. */
export function GraficoPorCategoria({
  grupos,
  onElegir,
}: {
  grupos: Grupo[];
  onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const base = baseDe(tema, 220);
  const total = grupos.reduce((a, g) => a + g.monto, 0);
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
          const grupo = grupos[config?.dataPointIndex ?? -1];
          if (grupo) onElegir(grupo.clave);
        },
      },
    },
    colors: [TEAL, NARANJO, TEAL_SUAVE, NARANJO_SUAVE, GRIS, ROJO],
    labels: grupos.map((g) => g.etiqueta),
    stroke: { width: grupos.length > 1 ? 2 : 0 },
    plotOptions: {
      pie: {
        expandOnClick: true,
        // Sin la banda que Apex dibuja POR FUERA del anillo al apuntar una porción
        // (`showHoverOutline`, 8 px por omisión): acá la leyenda corre la dona hacia abajo
        // y la banda se sale por arriba, cortada. La porción apuntada se sigue aclarando.
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
      /**
       * Anclado a una esquina: para una dona Apex ubica el tooltip con `clientX/clientY`
       * (`nonAxisChartsTooltips`), que acá llegan en 0, y lo dibujaba con su contenido
       * pero fuera de la pantalla. Con `fixed` corre `drawFixedTooltipRect()`, que pisa
       * esa posición al final.
       */
      fixed: { enabled: true, position: "topRight", offsetX: 0, offsetY: 0 },
      y: {
        formatter: (v: number, opts) =>
          `${money(v)} · ${grupos[opts?.seriesIndex ?? -1]?.cantidad ?? 0} gasto(s)`,
      },
    },
    yaxis: { show: false },
    grid: { ...base.grid, show: false },
  };

  return <ReactApexChart type="donut" height={220} options={opciones} series={grupos.map((g) => Math.round(g.monto))} />;
}

/** Barras horizontales por monto, con su clic. La usan empleado, proveedor y documento. */
function BarrasPorGrupo({
  grupos,
  nombre,
  color,
  onElegir,
}: {
  grupos: Grupo[];
  nombre: string;
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
      events: {
        dataPointSelection: (_e, _c, config) => {
          const grupo = grupos[config?.dataPointIndex ?? -1];
          if (grupo) onElegir(grupo.clave);
        },
      },
    },
    colors: [color],
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: grosorDeBarra(ALTO, grupos.length, GROSOR_DE_BARRA),
        borderRadius: 3,
      },
    },
    legend: { show: false },
    stroke: { width: 0 },
    xaxis: {
      ...base.xaxis,
      categories: grupos.map((g) => g.etiqueta),
      labels: { ...base.xaxis?.labels, formatter: (v: string | number) => compacto(Number(v)) },
      tickAmount: 4,
    },
    yaxis: { labels: { style: { fontSize: "10px", colors: tema === "dark" ? "#f2ede4" : "#171411" }, maxWidth: 140 } },
    tooltip: {
      ...base.tooltip,
      y: {
        formatter: (v: number, opts) =>
          `${money(v)} · ${grupos[opts?.dataPointIndex ?? -1]?.cantidad ?? 0} gasto(s)`,
        title: { formatter: () => "" },
      },
    },
  };

  return (
    <ReactApexChart
      type="bar"
      height={ALTO}
      options={opciones}
      series={[{ name: nombre, data: grupos.map((g) => Math.round(g.monto))
 }]}
    />
  );
}

/** Cuánto gastó cada persona. El clic filtra por esa persona. */
export function GraficoPorEmpleado({ grupos, onElegir }: { grupos: Grupo[]; onElegir: (clave: string) => void }) {
  return <BarrasPorGrupo grupos={grupos} nombre="Gastado" color={TEAL} onElegir={onElegir} />;
}

/** Con qué respaldo tributario se gastó. El clic filtra ese tipo de documento. */
export function GraficoPorTipoDeDocumento({
  grupos,
  onElegir,
}: {
  grupos: Grupo[];
  onElegir: (clave: string) => void;
}) {
  return <BarrasPorGrupo grupos={grupos} nombre="Gastado" color={NARANJO_SUAVE} onElegir={onElegir} />;
}

/** En quién se va la plata. El clic filtra ese proveedor. */
export function GraficoPorProveedor({ grupos, onElegir }: { grupos: Grupo[]; onElegir: (clave: string) => void }) {
  return <BarrasPorGrupo grupos={grupos} nombre="Gastado" color={NARANJO} onElegir={onElegir} />;
}

/** Hace cuánto que los borradores esperan. El clic en los tramos viejos filtra los olvidados. */
export function GraficoAntiguedadSinRendir({
  tramos,
  onElegirOlvidados,
}: {
  tramos: TramoDeAntiguedad[];
  onElegirOlvidados: () => void;
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
          // De los 31 días en adelante es lo mismo que el aviso de "olvidados"; los dos
          // primeros tramos son trámite normal y no tienen filtro propio.
          if ((config?.dataPointIndex ?? -1) >= 2) onElegirOlvidados();
        },
      },
    },
    // Del verde al rojo: lo recién cargado a la izquierda, lo que lleva un año a la derecha.
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
        formatter: (v: number, opts) => `${v} gasto(s) · ${money(tramos[opts?.dataPointIndex ?? -1]?.monto ?? 0)}`,
        title: { formatter: () => "En borrador" },
      },
    },
  };

  return (
    <ReactApexChart
      type="bar"
      height={200}
      options={opciones}
      series={[{ name: "En borrador", data: tramos.map((t) => t.cantidad) }]}
    />
  );
}
