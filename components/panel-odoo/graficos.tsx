"use client";

// Wrappers delgados de Recharts para las 4 tarjetas de Panel Odoo. Recharts
// se eligio como fallback de Tremor (ver plan de implementacion): Tremor
// (@tremor/react) esta sin publicar desde enero 2025 y su unica linea con
// soporte React 19 nunca salio de beta, asi que no es viable para produccion.
// Los colores de marca (naranjo/teal) se pasan como hex directo -- Recharts
// s no exige nombres de escala de Tailwind como exigia Tremor.

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

export function GraficoAreaSimple({ datos, dataKey = "monto" }: { datos: Record<string, number | string>[]; dataKey?: string }) {
  if (datos.length === 0) return <SinDatos />;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <AreaChart data={datos} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip formatter={(v) => money(Number(v))} labelClassName="text-xs" />
          <Area type="monotone" dataKey={dataKey} stroke={NARANJO} fill={NARANJO} fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoBarrasDobles({ datos }: { datos: { mes: string; ingreso: number; gasto: number }[] }) {
  if (datos.length === 0) return <SinDatos />;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <BarChart data={datos} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip formatter={(v) => money(Number(v))} />
          <Bar dataKey="ingreso" fill={TEAL} radius={[3, 3, 0, 0]} />
          <Bar dataKey="gasto" fill={NARANJO} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORES_DONA = [NARANJO, TEAL, "#e07a3d", "#35b89b", GRIS];

export function GraficoDona({ datos }: { datos: { etapa: string; cantidad: number }[] }) {
  if (datos.length === 0) return <SinDatos />;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={datos} dataKey="cantidad" nameKey="etapa" innerRadius={40} outerRadius={65} paddingAngle={2}>
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

function SinDatos() {
  return (
    <div className="flex h-40 w-full items-center justify-center text-xs text-tinta/40">
      Sin datos suficientes todavía.
    </div>
  );
}
