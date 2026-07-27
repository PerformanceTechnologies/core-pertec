"use client";

// Wrappers delgados de Recharts para las 4 tarjetas de Panel Odoo. Recharts
// se eligio como fallback de Tremor (ver plan de implementacion): Tremor
// (@tremor/react) esta sin publicar desde enero 2025 y su unica linea con
// soporte React 19 nunca salio de beta, asi que no es viable para produccion.
// Los colores de marca (naranjo/teal) se pasan como hex directo -- Recharts
// no exige nombres de escala de Tailwind como exigia Tremor.

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { money } from "@/lib/cotizador/formato";

const NARANJO = "#c85217";
const TEAL = "#00a080";
const GRIS = "#8c8578";
const ALTO_GRAFICO = "h-24"; // 96px -- compacto a proposito, son tarjetas resumen, no reportes
const ALTO_GRAFICO_EXPANDIDO = "h-56"; // 224px -- version grande para el modal de detalle

export function GraficoAreaSimple({
  datos,
  dataKey = "monto",
  expandido = false,
}: {
  datos: Record<string, number | string>[];
  dataKey?: string;
  expandido?: boolean;
}) {
  const alto = expandido ? ALTO_GRAFICO_EXPANDIDO : ALTO_GRAFICO;
  // Con 1 solo punto una serie de area no dibuja nada (no hay linea entre 2
  // puntos) y deja un espacio vacio enorme -- mejor mostrar el mensaje que un
  // grafico que se ve roto.
  if (datos.length < 2) return <PocoHistorial alto={alto} />;
  return (
    <div className={`${alto} w-full`}>
      <ResponsiveContainer>
        <AreaChart data={datos} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide={!expandido} tick={{ fontSize: 10 }} width={expandido ? 44 : 0} />
          <Tooltip formatter={(v) => money(Number(v))} labelClassName="text-xs" />
          <Area type="monotone" dataKey={dataKey} stroke={NARANJO} fill={NARANJO} fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoBarrasDobles({
  datos,
  expandido = false,
}: {
  datos: { mes: string; ingreso: number; gasto: number }[];
  expandido?: boolean;
}) {
  const alto = expandido ? ALTO_GRAFICO_EXPANDIDO : ALTO_GRAFICO;
  if (datos.length === 0) return <SinDatos alto={alto} />;
  return (
    <div className={`${alto} w-full`}>
      <ResponsiveContainer>
        <BarChart data={datos} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide={!expandido} tick={{ fontSize: 10 }} width={expandido ? 44 : 0} />
          <Tooltip formatter={(v) => money(Number(v))} />
          <Bar dataKey="ingreso" fill={TEAL} radius={[3, 3, 0, 0]} maxBarSize={expandido ? 40 : 28} />
          <Bar dataKey="gasto" fill={NARANJO} radius={[3, 3, 0, 0]} maxBarSize={expandido ? 40 : 28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORES_DONA = [NARANJO, TEAL, "#e07a3d", "#35b89b", GRIS];

export function GraficoDona({
  datos,
  expandido = false,
}: {
  datos: { etapa: string; cantidad: number }[];
  expandido?: boolean;
}) {
  const alto = expandido ? ALTO_GRAFICO_EXPANDIDO : ALTO_GRAFICO;
  if (datos.length === 0) return <SinDatos alto={alto} />;
  return (
    <div className={`${alto} w-full`}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={datos}
            dataKey="cantidad"
            nameKey="etapa"
            innerRadius={expandido ? 56 : 26}
            outerRadius={expandido ? 96 : 44}
            paddingAngle={2}
            label={expandido ? ({ name, value }) => `${name} (${value})` : undefined}
          >
            {datos.map((_, i) => (
              <Cell key={i} fill={COLORES_DONA[i % COLORES_DONA.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function SinDatos({ alto = ALTO_GRAFICO }: { alto?: string }) {
  return (
    <div className={`flex ${alto} w-full items-center justify-center text-xs text-tinta/40`}>
      Sin datos suficientes todavía.
    </div>
  );
}

function PocoHistorial({ alto = ALTO_GRAFICO }: { alto?: string }) {
  return (
    <div className={`flex ${alto} w-full items-center justify-center text-xs text-tinta/40`}>
      Falta historial para ver la tendencia.
    </div>
  );
}
