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

function TickCategoriaTruncado({
  x,
  y,
  payload,
  largoMaximo,
}: {
  x?: string | number;
  y?: string | number;
  payload?: { value: string | number };
  largoMaximo: number;
}) {
  const texto = String(payload?.value ?? "");
  const truncado = texto.length > largoMaximo ? `${texto.slice(0, largoMaximo - 1)}…` : texto;
  return (
    <text x={x} y={y} dy={3} textAnchor="end" fontSize={10} fill={GRIS}>
      {truncado}
    </text>
  );
}

export function GraficoDona({
  datos,
  dataKey = "cantidad",
  nameKey = "etapa",
  formato = "cantidad",
  expandido = false,
}: {
  datos: Record<string, string | number>[];
  dataKey?: string;
  nameKey?: string;
  // "dinero" formatea con money() -- se pasa el identificador y no la funcion
  // porque este es un Client Component: una funcion recibida como prop desde
  // un Server Component no es serializable a traves de ese limite.
  formato?: "cantidad" | "dinero";
  expandido?: boolean;
}) {
  const alto = expandido ? ALTO_GRAFICO_EXPANDIDO : ALTO_GRAFICO;
  if (datos.length === 0) return <SinDatos alto={alto} />;
  const formatear = (valor: number) => (formato === "dinero" ? money(valor) : String(valor));
  return (
    <div className={`${alto} w-full`}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={datos}
            dataKey={dataKey}
            nameKey={nameKey}
            innerRadius={expandido ? 56 : 26}
            outerRadius={expandido ? 96 : 44}
            paddingAngle={2}
            label={expandido ? ({ name, value }) => `${name} (${formatear(value)})` : undefined}
          >
            {datos.map((_, i) => (
              <Cell key={i} fill={COLORES_DONA[i % COLORES_DONA.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatear(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Ranking en barras horizontales -- se usa como "segundo grafico" de una
// tarjeta que ya tiene una dona, para que no se repita la misma forma dos
// veces en la misma tarjeta (ver plan de mejoras Panel Odoo).
export function GraficoBarrasRanking({
  datos,
  dataKey = "cantidad",
  nameKey = "etapa",
  formato = "cantidad",
  expandido = false,
}: {
  datos: Record<string, string | number>[];
  dataKey?: string;
  nameKey?: string;
  formato?: "cantidad" | "dinero";
  expandido?: boolean;
}) {
  const alto = expandido ? ALTO_GRAFICO_EXPANDIDO : ALTO_GRAFICO;
  if (datos.length === 0) return <SinDatos alto={alto} />;
  const formatear = (valor: number) => (formato === "dinero" ? money(valor) : String(valor));
  // El tick por defecto de Recharts vuelve a envolver el texto en varias
  // lineas si no cabe en el ancho del eje -- ignora el tickFormatter y con
  // nombres largos ("Hugo Antivil") parte la palabra a la mitad. Se
  // reemplaza por un <text> propio de una sola linea, truncado con "…" (el
  // nombre completo igual aparece al pasar el mouse via el Tooltip).
  const largoMaximo = expandido ? 16 : 9;
  return (
    <div className={`${alto} w-full`}>
      <ResponsiveContainer>
        <BarChart
          data={datos}
          layout="vertical"
          margin={{ top: 4, right: expandido ? 48 : 8, left: 4, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey={nameKey}
            width={expandido ? 100 : 56}
            tick={(props) => <TickCategoriaTruncado {...props} largoMaximo={largoMaximo} />}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(v) => formatear(Number(v))} />
          <Bar
            dataKey={dataKey}
            radius={[0, 3, 3, 0]}
            maxBarSize={expandido ? 18 : 12}
            label={expandido ? { position: "right", fontSize: 10, formatter: (v: unknown) => formatear(Number(v)) } : undefined}
          >
            {datos.map((_, i) => (
              <Cell key={i} fill={COLORES_DONA[i % COLORES_DONA.length]} />
            ))}
          </Bar>
        </BarChart>
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
