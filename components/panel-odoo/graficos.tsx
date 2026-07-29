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

// Tooltip que lista los items de "detalle" (string[]) del segmento con el
// mouse encima, en vez de solo mostrar el numero agregado -- para graficos
// tipo "vehiculos activos" o "documentacion vencida" donde lo util es ver
// CUALES vehiculos/documentos caen en ese grupo, no solo cuantos.
const LIMITE_DETALLE_TOOLTIP = 8;

function crearTooltipConDetalle(nameKey: string, dataKey: string, formatear: (v: number) => string) {
  // Recharts tipa "content" con un generico (TooltipContentProps<ValueType,
  // NameType>) poco practico de calzar para un tooltip custom simple -- se
  // usa "any" a proposito, como en los propios ejemplos de Recharts, en vez
  // de pelear con esos tipos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function TooltipConDetalle({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload as Record<string, unknown>;
    const detalle = Array.isArray(item.detalle) ? (item.detalle as string[]) : [];
    return (
      <div className="max-w-[240px] rounded-lg border border-borde bg-white p-2.5 text-xs shadow-lg">
        <p className="font-semibold text-tinta">
          {String(item[nameKey] ?? "")} ({formatear(Number(item[dataKey] ?? 0))})
        </p>
        {detalle.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {detalle.slice(0, LIMITE_DETALLE_TOOLTIP).map((linea, i) => (
              <li key={i} className="truncate text-tinta/70">
                {linea}
              </li>
            ))}
          </ul>
        )}
        {detalle.length > LIMITE_DETALLE_TOOLTIP && (
          <p className="mt-1 text-tinta/40">+{detalle.length - LIMITE_DETALLE_TOOLTIP} más</p>
        )}
      </div>
    );
  };
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
  // "dinero" formatea con money() -- se pasa el identificador y no la funcion
  // porque este es un Client Component: una funcion recibida como prop desde
  // un Server Component no es serializable a traves de ese limite.
  formato?: "cantidad" | "dinero";
  // Si los items de "datos" traen un campo "detalle" (string[]), muestra esa
  // lista en el tooltip en vez del formateo por defecto.
  mostrarDetalle?: boolean;
  // Fila de "nombre (cantidad)" siempre visible debajo del grafico -- para
  // categorias que el usuario debe poder leer sin necesidad de pasar el
  // mouse (ej. "Vigente"/"Vencida" en documentacion de Flota).
  mostrarLeyenda?: boolean;
  expandido?: boolean;
}) {
  const alto = expandido ? ALTO_GRAFICO_EXPANDIDO : ALTO_GRAFICO;
  if (datos.length === 0) return <SinDatos alto={alto} />;
  const formatear = (valor: number) => (formato === "dinero" ? money(valor) : String(valor));
  return (
    <div className="w-full">
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
            {mostrarDetalle ? (
              <Tooltip content={crearTooltipConDetalle(nameKey, dataKey, formatear)} />
            ) : (
              <Tooltip formatter={(v) => formatear(Number(v))} />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
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

// Ranking en barras horizontales -- se usa como "segundo grafico" de una
// tarjeta que ya tiene una dona, para que no se repita la misma forma dos
// veces en la misma tarjeta (ver plan de mejoras Panel Odoo).
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
          {mostrarDetalle ? (
            <Tooltip content={crearTooltipConDetalle(nameKey, dataKey, formatear)} />
          ) : (
            <Tooltip formatter={(v) => formatear(Number(v))} />
          )}
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

// Grafico combinado: una sola barra apilada horizontal que muestra el total
// (suma de todos los segmentos) y su composicion por estado a la vez -- en
// vez de una tendencia (que no aplica a los fondos, no son una serie
// temporal) o un ranking de una barra por fila (que no deja ver el total de
// un vistazo).
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
  const alto = expandido ? ALTO_GRAFICO_EXPANDIDO : ALTO_GRAFICO;
  if (datos.length === 0) return <SinDatos alto={alto} />;
  const formatear = (valor: number) => (formato === "dinero" ? money(valor) : String(valor));
  const total = datos.reduce((acc, d) => acc + Number(d[dataKey] ?? 0), 0);

  // Recharts apila barras por fila -- se arma una unica fila con una
  // columna por segmento (seg0, seg1, ...) para que las N categorias de
  // "datos" terminen dibujadas como una sola barra compuesta.
  const fila: Record<string, unknown> = { total: "Total" };
  datos.forEach((d, i) => {
    fila[`seg${i}`] = d[dataKey];
  });

  return (
    <div className="w-full">
      <p className="mb-1 text-xs font-semibold text-tinta/70">Total: {formatear(total)}</p>
      <div className={`${alto} w-full`}>
        <ResponsiveContainer>
          <BarChart data={[fila]} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="total" hide />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(valor: any, key: any) => {
                const indice = Number(String(key).replace("seg", ""));
                return [formatear(Number(valor)), String(datos[indice]?.[nameKey] ?? "")];
              }}
            />
            {datos.map((_, i) => (
              <Bar key={i} dataKey={`seg${i}`} stackId="unica" fill={COLORES_DONA[i % COLORES_DONA.length]} maxBarSize={expandido ? 40 : 26} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
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
    </div>
  );
}
