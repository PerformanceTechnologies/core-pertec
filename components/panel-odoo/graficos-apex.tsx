"use client";

import { useSyncExternalStore } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { money } from "@/lib/cotizador/formato";
import { suscribirseAlTema, temaActual } from "@/lib/tema";
import { grosorDeBarra } from "@/lib/panel-odoo/grosor-barra";

// Los cinco gráficos de las tarjetas de Panel Odoo, ahora con ApexCharts.
//
// Reemplazan uno a uno a los de ./graficos-recharts.tsx: MISMOS nombres, mismas props y
// mismo comportamiento. Los que los usan (TarjetaFacturas, TarjetaVentas, TarjetaCompras,
// TarjetaContabilidad, TarjetaCrm, TarjetaFlota, TarjetaGastos, TarjetaBodega) siguen
// importando de ./graficos.tsx sin cambiar una línea. Acá no se agregó ninguna capacidad
// nueva: el detalle interactivo con filtros es cosa de los detalles de Facturas y CRM.
//
// Se unifica en Apex porque el panel ya lo cargaba para esos dos detalles, y tener dos
// bibliotecas de gráficos en la misma pantalla significa dos estilos de tooltip, dos
// formas de dibujar una leyenda y dos veces el peso.
//
// La estética que se mantiene, porque es la que se eligió a mano en el área de tendencia:
// degradado bajo la línea, grilla horizontal punteada, números abreviados en el eje y
// línea de 3 px con su punto al pasar el mouse.

const NARANJO = "#c85217";
const TEAL = "#00a080";
const GRIS = "#8c8578";
const COLORES_DONA = [NARANJO, TEAL, "#e07a3d", "#35b89b", GRIS];

/** 96 px: compacto a propósito, son tarjetas resumen, no reportes. */
const ALTO = 96;
/** 224 px: la versión grande del modal de detalle. */
const ALTO_EXPANDIDO = 224;

/** Cuántos ítems del detalle se listan en el tooltip antes de resumir el resto. */
const LIMITE_DETALLE_TOOLTIP = 8;

function useTema() {
  // Apex escribe los colores COMO ATRIBUTOS del SVG, así que una variable CSS no lo
  // sigue: el tema llega como valor y el gráfico se redibuja al cambiarlo.
  return useSyncExternalStore(suscribirseAlTema, temaActual, () => "light" as const);
}

/** Millones y miles abreviados: en un eje de 96 px, "$42.358.564" ocupa más que el gráfico. */
function compacto(v: number): string {
  return new Intl.NumberFormat("es-CL", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(v);
}

function colores(tema: "light" | "dark") {
  return {
    tinta: tema === "dark" ? "#f2ede4" : "#171411",
    borde: tema === "dark" ? "#37322b" : "#e7e1d8",
    superficie: tema === "dark" ? "#262320" : "#ffffff",
  };
}

function baseDe(tema: "light" | "dark", alto: number): ApexOptions {
  const { tinta, borde } = colores(tema);
  return {
    chart: {
      height: alto,
      fontFamily: "inherit",
      background: "transparent",
      toolbar: { show: false },
      // Sin zoom ni selección: son tarjetas de un vistazo, y en 96 px de alto un
      // arrastre accidental deja el gráfico recortado sin forma obvia de volver.
      zoom: { enabled: false },
      selection: { enabled: false },
      animations: { enabled: true, speed: 300 },
      parentHeightOffset: 0,
    },
    theme: { mode: tema },
    grid: {
      borderColor: borde,
      strokeDashArray: 3,
      // Solo horizontales, como en el original.
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      // Padding NEGATIVO arriba en la versión compacta, y no es un truco sucio: Apex
      // reserva ~35 px sobre el área de dibujo (el hueco del título y la barra de
      // herramientas, que acá están apagados) y en una tarjeta de 96 px eso dejaba la
      // serie con 27 px de alto — la tendencia se veía casi plana. Medido en
      // scripts/probar-graficos-panel.mts, que además falla si vuelve a pasar.
      // A los lados, aire para que el primer y el último rótulo del eje entren enteros:
      // sin eje Y que los corra, el rótulo del primer mes queda centrado en x=0 y se
      // corta por la mitad ("6-05" en vez de "2026-05").
      padding:
        alto === ALTO
          ? { top: -26, right: 24, bottom: -8, left: 24 }
          : { top: 4, right: 8, bottom: 0, left: 4 },
    },
    tooltip: { theme: tema, style: { fontSize: "11px" } },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      labels: { style: { fontSize: "10px", colors: tinta } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    states: { hover: { filter: { type: "lighten" } }, active: { filter: { type: "none" } } },
  };
}

/** El texto de una categoría, cortado con "…" para que no parta en dos líneas. */
function truncar(texto: string, largoMaximo: number): string {
  return texto.length > largoMaximo ? `${texto.slice(0, largoMaximo - 1)}…` : texto;
}

/**
 * El tooltip que lista los ítems de "detalle" del segmento apuntado.
 *
 * Para gráficos tipo "vehículos activos" o "documentación vencida", donde lo útil es ver
 * CUÁLES caen en ese grupo y no solo cuántos. Se arma como HTML porque es lo que Apex
 * acepta en `tooltip.custom`; las clases del proyecto no sirven acá —el nodo lo inserta
 * Apex fuera del árbol de React— así que los colores van en línea, tomados del tema.
 */
function tooltipConDetalle(
  datos: Record<string, unknown>[],
  nameKey: string,
  dataKey: string,
  formatear: (v: number) => string,
  tema: "light" | "dark",
) {
  const { tinta, borde, superficie } = colores(tema);
  return ({ dataPointIndex, seriesIndex }: { dataPointIndex: number; seriesIndex: number }) => {
    // En la dona el índice viene en seriesIndex; en las barras, en dataPointIndex.
    const item = datos[dataPointIndex >= 0 ? dataPointIndex : seriesIndex];
    if (!item) return "";
    const detalle = Array.isArray(item.detalle) ? (item.detalle as string[]) : [];
    const lineas = detalle
      .slice(0, LIMITE_DETALLE_TOOLTIP)
      .map((linea) => `<li style="opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${linea}</li>`)
      .join("");
    const resto =
      detalle.length > LIMITE_DETALLE_TOOLTIP
        ? `<p style="opacity:.4;margin:4px 0 0">+${detalle.length - LIMITE_DETALLE_TOOLTIP} más</p>`
        : "";
    return (
      `<div style="max-width:240px;padding:10px;border:1px solid ${borde};background:${superficie};color:${tinta};font-size:11px">` +
      `<p style="font-weight:600;margin:0">${String(item[nameKey] ?? "")} (${formatear(Number(item[dataKey] ?? 0))})</p>` +
      (lineas ? `<ul style="margin:4px 0 0;padding:0;list-style:none">${lineas}</ul>` : "") +
      resto +
      "</div>"
    );
  };
}

export function GraficoAreaSimple({
  datos,
  dataKey = "monto",
  expandido = false,
}: {
  datos: Record<string, number | string>[];
  dataKey?: string;
  expandido?: boolean;
}) {
  const tema = useTema();
  const alto = expandido ? ALTO_EXPANDIDO : ALTO;
  // Con un solo punto una serie de área no dibuja nada (no hay línea entre dos puntos) y
  // deja un espacio vacío enorme -- mejor el mensaje que un gráfico que se ve roto.
  if (datos.length < 2) return <PocoHistorial expandido={expandido} />;

  const base = baseDe(tema, alto);
  const opciones: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "area", sparkline: { enabled: false } },
    colors: [NARANJO],
    stroke: { curve: "smooth", width: 3 },
    // El degradado bajo la línea, igual que el original.
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [5, 95] },
    },
    markers: { size: 0, hover: { size: 6 }, strokeColors: colores(tema).superficie, strokeWidth: 2 },
    xaxis: { ...base.xaxis, categories: datos.map((d) => String(d.mes ?? "")), tooltip: { enabled: false } },
    yaxis: { show: expandido, labels: { style: { fontSize: "10px", colors: colores(tema).tinta }, formatter: compacto } },
    tooltip: { ...base.tooltip, y: { formatter: (v: number) => money(v) } },
  };

  return (
    <ReactApexChart
      type="area"
      height={alto}
      options={opciones}
      series={[{ name: "Monto", data: datos.map((d) => Number(d[dataKey] ?? 0)) }]}
    />
  );
}

export function GraficoBarrasDobles({
  datos,
  expandido = false,
}: {
  datos: { mes: string; ingreso: number; gasto: number }[];
  expandido?: boolean;
}) {
  const tema = useTema();
  const alto = expandido ? ALTO_EXPANDIDO : ALTO;
  if (datos.length === 0) return <SinDatos expandido={expandido} />;

  const base = baseDe(tema, alto);
  const opciones: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "bar" },
    colors: [TEAL, NARANJO],
    plotOptions: {
      bar: { columnWidth: expandido ? "55%" : "70%", borderRadius: 3, borderRadiusApplication: "end" },
    },
    stroke: { width: 0 },
    xaxis: { ...base.xaxis, categories: datos.map((d) => d.mes) },
    yaxis: { show: expandido, labels: { style: { fontSize: "10px", colors: colores(tema).tinta }, formatter: compacto } },
    tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => money(v) } },
  };

  return (
    <ReactApexChart
      type="bar"
      height={alto}
      options={opciones}
      series={[
        { name: "Ingreso", data: datos.map((d) => d.ingreso) },
        { name: "Gasto", data: datos.map((d) => d.gasto) },
      ]}
    />
  );
}

export function GraficoDona({
  datos,
  dataKey = "cantidad",
  nameKey = "etapa",
  formato = "cantidad",
  mostrarDetalle = false,
  mostrarLeyenda = false,
  expandido = false,
}: {
  datos: Record<string, unknown>[];
  dataKey?: string;
  nameKey?: string;
  // "dinero" formatea con money() -- se pasa el identificador y no la funcion porque este
  // es un Client Component: una funcion recibida como prop desde un Server Component no
  // es serializable a traves de ese limite.
  formato?: "cantidad" | "dinero";
  // Si los items de "datos" traen un campo "detalle" (string[]), muestra esa lista en el
  // tooltip en vez del formateo por defecto.
  mostrarDetalle?: boolean;
  // Fila de "nombre (cantidad)" siempre visible debajo del grafico -- para categorias que
  // el usuario debe poder leer sin pasar el mouse.
  mostrarLeyenda?: boolean;
  expandido?: boolean;
}) {
  const tema = useTema();
  const alto = expandido ? ALTO_EXPANDIDO : ALTO;
  if (datos.length === 0) return <SinDatos expandido={expandido} />;
  const formatear = (valor: number) => (formato === "dinero" ? money(valor) : String(valor));

  const base = baseDe(tema, alto);
  const opciones: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "donut" },
    colors: COLORES_DONA,
    labels: datos.map((d) => String(d[nameKey] ?? "")),
    stroke: { width: 2, colors: [colores(tema).superficie] },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: { size: "58%" },
        // Solo en la tarjeta chica: Apex dibuja la dona bastante más chica que el espacio
        // que tiene, y en 96 px quedaba como una moneda en medio de un hueco. Con 1,3
        // mide 84 px, casi lo mismo que la anterior (88). En la versión grande no se
        // agranda: ahí abajo va la leyenda y se le comería el lugar.
        customScale: expandido ? 1 : 1.3,
      },
    },
    // La leyenda de Apex solo cuando el grafico es grande Y no se dibuja la fila propia
    // de abajo: dos leyendas para lo mismo es peor que ninguna.
    legend:
      expandido && !mostrarLeyenda
        ? {
            show: true,
            position: "bottom",
            fontSize: "11px",
            markers: { size: 6 },
            labels: { colors: colores(tema).tinta },
            formatter: (etiqueta: string, opts) =>
              `${etiqueta} (${formatear(Number(datos[opts?.seriesIndex ?? -1]?.[dataKey] ?? 0))})`,
          }
        : { show: false },
    tooltip: mostrarDetalle
      ? { custom: tooltipConDetalle(datos, nameKey, dataKey, formatear, tema) }
      : { ...base.tooltip, y: { formatter: (v: number) => formatear(v) } },
    // Una dona no tiene ejes; se apagan en vez de borrar las claves (con `grid: undefined`
    // Apex lanza leyendo grid.padding y no dibuja nada). Y el padding vuelve a cero: el
    // negativo de las tarjetas está pensado para recuperar el hueco del eje X, y en una
    // dona lo único que hace es dejarla dibujada del tamaño de una moneda.
    yaxis: { show: false },
    grid: { ...base.grid, show: false, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
  };

  return (
    <div className="w-full">
      <ReactApexChart
        type="donut"
        height={alto}
        options={opciones}
        series={datos.map((d) => Number(d[dataKey] ?? 0))}
      />
      {mostrarLeyenda && (
        <div className="mt-1.5 flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-[10px] text-tinta/70">
          {datos.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: COLORES_DONA[i % COLORES_DONA.length] }}
              />
              {String(item[nameKey] ?? "")} ({formatear(Number(item[dataKey] ?? 0))})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Ranking en barras horizontales -- se usa como "segundo grafico" de una tarjeta que ya
// tiene una dona, para que no se repita la misma forma dos veces.
export function GraficoBarrasRanking({
  datos,
  dataKey = "cantidad",
  nameKey = "etapa",
  formato = "cantidad",
  mostrarDetalle = false,
  expandido = false,
}: {
  datos: Record<string, unknown>[];
  dataKey?: string;
  nameKey?: string;
  formato?: "cantidad" | "dinero";
  mostrarDetalle?: boolean;
  expandido?: boolean;
}) {
  const tema = useTema();
  const alto = expandido ? ALTO_EXPANDIDO : ALTO;
  if (datos.length === 0) return <SinDatos expandido={expandido} />;
  const formatear = (valor: number) => (formato === "dinero" ? money(valor) : String(valor));
  // El nombre completo se lee igual al pasar el mouse; en el eje se corta para que no
  // parta en dos líneas ni empuje el ancho del gráfico.
  const largoMaximo = expandido ? 16 : 9;

  const base = baseDe(tema, alto);
  const opciones: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "bar" },
    colors: COLORES_DONA,
    plotOptions: {
      bar: {
        horizontal: true,
        distributed: true,
        // Los mismos topes en píxeles que tenía `maxBarSize` con Recharts: con una o dos
        // filas, un porcentaje del espacio disponible da barras enormes. Ver grosorDeBarra.
        barHeight: grosorDeBarra(alto, datos.length, expandido ? 18 : 12),
        borderRadius: 3,
        borderRadiusApplication: "end",
        dataLabels: { position: "top" },
      },
    },
    stroke: { width: 0 },
    dataLabels: expandido
      ? {
          enabled: true,
          formatter: (v: number) => formatear(v),
          offsetX: 28,
          style: { fontSize: "10px", colors: [colores(tema).tinta] },
        }
      : { enabled: false },
    xaxis: { ...base.xaxis, categories: datos.map((d) => String(d[nameKey] ?? "")), labels: { show: false } },
    yaxis: {
      labels: {
        style: { fontSize: "10px", colors: GRIS },
        maxWidth: expandido ? 100 : 56,
        // El tipo de Apex dice `number` porque en un eje normal el valor es numérico; en
        // una barra horizontal el eje Y son las categorías y llega el texto.
        formatter: (valor: unknown) => truncar(String(valor), largoMaximo),
      },
    },
    grid: { ...base.grid, xaxis: { lines: { show: false } }, yaxis: { lines: { show: false } } },
    tooltip: mostrarDetalle
      ? { custom: tooltipConDetalle(datos, nameKey, dataKey, formatear, tema) }
      : { ...base.tooltip, y: { formatter: (v: number) => formatear(v), title: { formatter: () => "" } } },
  };

  return (
    <ReactApexChart
      type="bar"
      height={alto}
      options={opciones}
      series={[{ name: "Total", data: datos.map((d) => Number(d[dataKey] ?? 0)) }]}
    />
  );
}

// Grafico combinado: una sola barra apilada horizontal que muestra el total (suma de
// todos los segmentos) y su composicion por estado a la vez -- en vez de una tendencia
// (que no aplica a los fondos, no son una serie temporal) o un ranking de una barra por
// fila (que no deja ver el total de un vistazo).
export function GraficoBarraApilada({
  datos,
  dataKey = "monto",
  nameKey = "estado",
  formato = "dinero",
  expandido = false,
}: {
  datos: Record<string, unknown>[];
  dataKey?: string;
  nameKey?: string;
  formato?: "cantidad" | "dinero";
  expandido?: boolean;
}) {
  const tema = useTema();
  const alto = expandido ? ALTO_EXPANDIDO : ALTO;
  if (datos.length === 0) return <SinDatos expandido={expandido} />;
  const formatear = (valor: number) => (formato === "dinero" ? money(valor) : String(valor));
  const total = datos.reduce((acc, d) => acc + Number(d[dataKey] ?? 0), 0);

  const base = baseDe(tema, alto);
  const opciones: ApexOptions = {
    ...base,
    chart: { ...base.chart, type: "bar", stacked: true },
    colors: COLORES_DONA,
    // Una sola fila: sin tope, la barra apilada ocupaba media tarjeta de alto.
    plotOptions: { bar: { horizontal: true, barHeight: grosorDeBarra(alto, 1, expandido ? 40 : 26), borderRadius: 3 } },
    stroke: { width: 0 },
    // Una sola fila: cada segmento es una serie con un único valor, y apilados forman la
    // barra compuesta.
    xaxis: { ...base.xaxis, categories: ["Total"], labels: { show: false } },
    yaxis: { show: false },
    grid: { ...base.grid, xaxis: { lines: { show: false } }, yaxis: { lines: { show: false } } },
    tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => formatear(v) } },
  };

  return (
    <div className="w-full">
      <p className="mb-1 text-xs font-semibold text-tinta/70">Total: {formatear(total)}</p>
      <ReactApexChart
        type="bar"
        height={alto}
        options={opciones}
        series={datos.map((d) => ({ name: String(d[nameKey] ?? ""), data: [Number(d[dataKey] ?? 0)] }))}
      />
    </div>
  );
}

function SinDatos({ expandido }: { expandido?: boolean }) {
  return <Vacio expandido={expandido}>Sin datos suficientes todavía.</Vacio>;
}

function PocoHistorial({ expandido }: { expandido?: boolean }) {
  return <Vacio expandido={expandido}>Falta historial para ver la tendencia.</Vacio>;
}

function Vacio({ expandido, children }: { expandido?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{ height: expandido ? ALTO_EXPANDIDO : ALTO }}
      className="flex w-full items-center justify-center text-xs text-tinta/40"
    >
      {children}
    </div>
  );
}
