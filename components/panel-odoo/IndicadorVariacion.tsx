import { calcularVariacion } from "@/lib/panel-odoo/formato";

// Pastilla ▲/▼ % junto a un KPI, comparado contra el mismo KPI el mes
// anterior. Sin "use client": es puro JSX/numeros, corre bien en un Server
// Component (las 4 tarjetas lo son).
//
// `esGasto`: en metricas de costo (ej. "Gastado (mes)"), que suba es la
// señal mala y que baje es la buena -- justo al reves que en ingresos o
// facturacion. Invierte que color se pinta segun el sentido del cambio.
export default function IndicadorVariacion({
  actual,
  anterior,
  esGasto = false,
}: {
  actual: number;
  anterior: number;
  esGasto?: boolean;
}) {
  const variacion = calcularVariacion(actual, anterior);
  if (!variacion) return null;

  const sube = variacion.pct >= 0;
  const esBueno = esGasto ? !sube : sube;
  return (
    <span
      className={`ml-1.5 inline-flex items-center text-[10px] font-semibold ${esBueno ? "text-teal" : "text-red-600"}`}
      title="vs. mes anterior"
    >
      {sube ? "▲" : "▼"} {Math.abs(Math.round(variacion.pct))}%
    </span>
  );
}
