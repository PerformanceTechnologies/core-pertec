import Link from "@/components/contratos/Enlace";
import type { Tono } from "@/lib/contratos/dashboard-modelo";

// Los gráficos del dashboard.
//
// Son SVG y HTML dibujados en el servidor, sin librería de gráficos y sin una línea de
// JavaScript de cliente. Se eligió así por tres razones: el tablero es la pantalla de entrada y
// cada KB que se descarga se nota; son pocos tipos de gráfico y todos simples; y dibujados a
// mano heredan la paleta y el modo oscuro del core (variables CSS) sin configurar nada.
//
// La interacción es CSS puro: al pasar el cursor por un tramo, los demás se apagan; el detalle
// exacto va en el `title` de cada elemento, que es lo que lee también un lector de pantalla.
// Cada gráfico lleva su texto (aria-label) porque un dibujo solo no lo entiende quien no lo ve.

/** Los colores de cada tono viven en globals.css (`[data-tono]`): un solo lugar para la paleta. */
function atributos(tono: Tono) {
  return { "data-tono": tono } as const;
}

// -----------------------------------------------------------------------------
//  Anillo de avance
// -----------------------------------------------------------------------------

export function Anillo({
  id,
  valor,
  tono = "curso",
  tamano = 96,
  grosor = 10,
  etiqueta,
  children,
}: {
  /** Único en la página: lo usa el degradado del arco. */
  id: string;
  /** 0–100. */
  valor: number;
  tono?: Tono;
  tamano?: number;
  grosor?: number;
  etiqueta: string;
  children?: React.ReactNode;
}) {
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const largo = (Math.max(0, Math.min(100, valor)) / 100) * circunferencia;

  return (
    <div
      {...atributos(tono)}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: tamano, height: tamano }}
      role="img"
      aria-label={etiqueta}
    >
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--tono-1)" }} />
            <stop offset="100%" style={{ stopColor: "var(--tono-2)" }} />
          </linearGradient>
        </defs>
        <circle cx={tamano / 2} cy={tamano / 2} r={radio} fill="none" strokeWidth={grosor} className="dash-pista" />
        {largo > 0 && (
          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            strokeWidth={grosor}
            strokeLinecap="round"
            stroke={`url(#${id})`}
            strokeDasharray={`${largo} ${circunferencia}`}
            className="dash-arco"
            style={{ "--largo": largo, "--circ": circunferencia } as React.CSSProperties}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Dona de varios tramos
// -----------------------------------------------------------------------------

export interface Tramo {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Un color CSS (normalmente una variable: `var(--etapa-validado)`). */
  color: string;
}

export function Dona({
  tramos,
  tamano = 150,
  grosor = 18,
  titulo,
  children,
}: {
  tramos: Tramo[];
  tamano?: number;
  grosor?: number;
  /** Lo que dice un lector de pantalla del conjunto. */
  titulo: string;
  children?: React.ReactNode;
}) {
  const total = tramos.reduce((n, t) => n + t.valor, 0);
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  // Una rendija entre tramos para que se lean como piezas separadas; no se aplica si hay uno solo.
  const rendija = tramos.filter((t) => t.valor > 0).length > 1 ? 3 : 0;

  // Dónde empieza cada tramo: la suma de lo que ocupan los anteriores.
  const presentes = tramos.filter((t) => t.valor > 0);
  const arcos = presentes.map((t, i) => {
    const fraccion = t.valor / total;
    const antes = presentes.slice(0, i).reduce((n, x) => n + x.valor / total, 0);
    return {
      t,
      largo: Math.max(fraccion * circunferencia - rendija, 0.5),
      desfase: -antes * circunferencia,
      porcentaje: Math.round(fraccion * 100),
    };
  });

  return (
    <div
      className="dash-dona relative inline-flex shrink-0 items-center justify-center"
      style={{ width: tamano, height: tamano }}
      role="img"
      aria-label={`${titulo}: ${tramos.filter((t) => t.valor > 0).map((t) => `${t.etiqueta} ${t.valor}`).join(", ") || "sin datos"}`}
    >
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={radio} fill="none" strokeWidth={grosor} className="dash-pista" />
        {arcos.map(({ t, largo, desfase, porcentaje }) => (
          <circle
            key={t.clave}
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            strokeWidth={grosor}
            stroke={t.color}
            strokeDasharray={`${largo} ${circunferencia - largo}`}
            strokeDashoffset={desfase}
            className="dash-tramo"
          >
            <title>{`${t.etiqueta}: ${t.valor} (${porcentaje}%)`}</title>
          </circle>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

/** La leyenda de una dona o de una barra: un punto de color, la etiqueta y la cantidad. */
export function Leyenda({ tramos, total }: { tramos: Tramo[]; total?: number }) {
  const suma = total ?? tramos.reduce((n, t) => n + t.valor, 0);
  return (
    <ul className="space-y-1.5">
      {tramos.map((t) => (
        <li key={t.clave} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-gris">{t.etiqueta}</span>
          <span className="tabular-nums font-bold text-tinta">{t.valor}</span>
          <span className="w-9 text-right tabular-nums text-gris-suave">
            {suma === 0 ? "0%" : `${Math.round((t.valor / suma) * 100)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
//  Barra partida en tramos
// -----------------------------------------------------------------------------

export function BarraPartida({
  tramos,
  alto = 10,
  titulo,
}: {
  tramos: Tramo[];
  alto?: number;
  titulo: string;
}) {
  const presentes = tramos.filter((t) => t.valor > 0);
  const total = presentes.reduce((n, t) => n + t.valor, 0);

  return (
    <div
      className="dash-partida flex w-full gap-[2px] overflow-hidden rounded-full"
      style={{ height: alto, background: total === 0 ? "var(--color-borde)" : undefined }}
      role="img"
      aria-label={`${titulo}: ${presentes.map((t) => `${t.etiqueta} ${t.valor}`).join(", ") || "sin datos"}`}
    >
      {presentes.map((t) => (
        <i
          key={t.clave}
          title={`${t.etiqueta}: ${t.valor}`}
          className="dash-partida-tramo block h-full"
          style={{ flex: `${t.valor} 1 0%`, background: t.color }}
        />
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Barras horizontales (ranking)
// -----------------------------------------------------------------------------

export interface FilaDeBarra {
  clave: string;
  etiqueta: string;
  /** Largo de la barra, de 0 a `maximo`. */
  valor: number;
  /** Una marca sobre la barra: un presupuesto, una meta. */
  referencia?: number;
  /** Lo que se escribe a la derecha. */
  texto: string;
  tono?: Tono;
  href?: string;
  /** Una segunda línea chica bajo la etiqueta. */
  detalle?: string;
}

export function BarrasHorizontales({
  filas,
  maximo,
  escalaPorFila = false,
}: {
  filas: FilaDeBarra[];
  /** Por omisión, el mayor de los valores y referencias. */
  maximo?: number;
  /**
   * Cada fila se mide contra SU propia referencia: una meta cumplida llena la barra entera. Es lo
   * que hace falta cuando lo que importa es «cuánto de lo mío llevo» (dotación por cargo), no
   * comparar el tamaño de una fila con otra.
   */
  escalaPorFila?: boolean;
}) {
  const topeGlobal = maximo ?? Math.max(1, ...filas.flatMap((f) => [f.valor, f.referencia ?? 0]));

  return (
    <ul className="space-y-3">
      {filas.map((f, i) => {
        const tope = escalaPorFila ? Math.max(1, f.valor, f.referencia ?? 0) : topeGlobal;
        const ancho = Math.max(0, Math.min(1, f.valor / tope));
        const marca = f.referencia !== undefined ? Math.max(0, Math.min(1, f.referencia / tope)) : null;
        const contenido = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-tinta">{f.etiqueta}</span>
                {f.detalle && <span className="block truncate text-[11px] text-gris-suave">{f.detalle}</span>}
              </span>
              <span className="shrink-0 tabular-nums font-bold text-tinta">{f.texto}</span>
            </span>
            <span
              {...atributos(f.tono ?? "curso")}
              className="dash-carril relative mt-1.5 block h-2 rounded-full"
              aria-hidden
            >
              <span
                className="dash-relleno absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${ancho * 100}%`, animationDelay: `${i * 60}ms` }}
              />
              {marca !== null && (
                <span
                  className="absolute -inset-y-[3px] w-[2px] rounded-full bg-tinta/70"
                  style={{ left: `calc(${marca * 100}% - 1px)` }}
                  title={`Referencia: ${f.referencia}`}
                />
              )}
            </span>
          </>
        );
        return (
          <li key={f.clave}>
            {f.href ? (
              <Link href={f.href} className="dash-fila-enlace -mx-2 block rounded-lg px-2 py-1 transition">
                {contenido}
              </Link>
            ) : (
              contenido
            )}
          </li>
        );
      })}
    </ul>
  );
}

// -----------------------------------------------------------------------------
//  Columnas por mes (presupuestado contra real)
// -----------------------------------------------------------------------------

export interface MesDelGrafico {
  etiqueta: string;
  a: number;
  b: number;
}

/**
 * Dos columnas por mes: lo presupuestado (claro) y lo real (de marca).
 *
 * Es un SVG con viewBox fijo que escala al ancho de su caja: no hace falta medir nada en el
 * navegador. Las líneas de guía son tres y se rotulan en pesos compactos, que es lo que se
 * puede leer sin calculadora.
 */
export function ColumnasPorMes({
  meses,
  formato,
  nombreA,
  nombreB,
}: {
  meses: MesDelGrafico[];
  formato: (n: number) => string;
  nombreA: string;
  nombreB: string;
}) {
  const ancho = 520;
  const alto = 190;
  const margen = { izq: 44, der: 8, arriba: 10, abajo: 24 };
  const util = { w: ancho - margen.izq - margen.der, h: alto - margen.arriba - margen.abajo };

  const maximo = Math.max(1, ...meses.flatMap((m) => [m.a, m.b]));
  // Un tope «redondo» para que las guías no digan 7.842.113.
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  const tope = Math.ceil(maximo / potencia) * potencia;

  const banda = util.w / Math.max(meses.length, 1);
  const columna = Math.min(22, banda / 3);
  const y = (v: number) => margen.arriba + util.h - (v / tope) * util.h;

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      className="w-full"
      role="img"
      aria-label={`${nombreA} y ${nombreB} por mes: ${meses.map((m) => `${m.etiqueta} ${formato(m.a)} y ${formato(m.b)}`).join("; ")}`}
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={margen.izq}
            x2={ancho - margen.der}
            y1={y(tope * f)}
            y2={y(tope * f)}
            className="dash-guia"
            strokeDasharray={f === 0 ? undefined : "3 4"}
          />
          <text x={margen.izq - 8} y={y(tope * f) + 3.5} textAnchor="end" className="dash-texto-eje">
            {formato(tope * f)}
          </text>
        </g>
      ))}

      {meses.map((m, i) => {
        const centro = margen.izq + banda * i + banda / 2;
        return (
          <g key={m.etiqueta + i} className="dash-mes">
            <rect x={centro - banda / 2 + 2} y={margen.arriba} width={banda - 4} height={util.h} className="dash-mes-fondo" rx={6} />
            <rect
              x={centro - columna - 1.5}
              y={y(m.a)}
              width={columna}
              height={Math.max(margen.arriba + util.h - y(m.a), m.a > 0 ? 2 : 0)}
              rx={4}
              className="dash-columna-a"
            >
              <title>{`${m.etiqueta} · ${nombreA}: ${formato(m.a)}`}</title>
            </rect>
            <rect
              x={centro + 1.5}
              y={y(m.b)}
              width={columna}
              height={Math.max(margen.arriba + util.h - y(m.b), m.b > 0 ? 2 : 0)}
              rx={4}
              className="dash-columna-b"
            >
              <title>{`${m.etiqueta} · ${nombreB}: ${formato(m.b)}`}</title>
            </rect>
            <text x={centro} y={alto - 7} textAnchor="middle" className="dash-texto-eje">
              {m.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// -----------------------------------------------------------------------------
//  Embudo
// -----------------------------------------------------------------------------

export function Embudo({
  pasos,
  total,
}: {
  pasos: { clave: string; etiqueta: string; valor: number }[];
  total: number;
}) {
  return (
    <ol className="space-y-1.5" aria-label="Recorrido de la acreditación">
      {pasos.map((p, i) => {
        const fraccion = total === 0 ? 0 : p.valor / total;
        const anterior = i === 0 ? null : pasos[i - 1].valor;
        const paso = anterior === null || anterior === 0 ? null : Math.round((p.valor / anterior) * 100);
        return (
          <li key={p.clave}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 flex-1 items-center justify-center">
                <div
                  className="dash-embudo flex h-full items-center justify-center rounded-lg px-2 text-sm font-extrabold text-white"
                  style={{
                    width: `${Math.max(fraccion * 100, p.valor > 0 ? 14 : 6)}%`,
                    animationDelay: `${i * 90}ms`,
                    // De cian a azul a medida que avanza: el recorrido se «profundiza».
                    background: `color-mix(in srgb, var(--color-cian) ${100 - i * 28}%, var(--color-azul))`,
                  }}
                  title={`${p.etiqueta}: ${p.valor}`}
                >
                  <span className="tabular-nums drop-shadow-sm">{p.valor}</span>
                </div>
              </div>
              <div className="w-40 shrink-0 text-xs leading-tight">
                <span className="block font-semibold text-tinta">{p.etiqueta}</span>
                {paso !== null && <span className="text-gris-suave">{paso}% del paso anterior</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// -----------------------------------------------------------------------------
//  Tiempo contra avance
// -----------------------------------------------------------------------------

/**
 * Dos pistas, una sobre otra: cuánto del tiempo se gastó y cuánto del trabajo se hizo.
 *
 * Es el gráfico que responde «¿vamos bien?»: si la barra de avance va más larga que la del
 * tiempo, hay holgura; si va más corta, se está llegando tarde.
 */
export function TiempoContraAvance({
  tiempo,
  avance,
  tono,
}: {
  tiempo: number;
  avance: number;
  tono: Tono;
}) {
  return (
    <div className="space-y-1.5" role="img" aria-label={`Tiempo transcurrido ${tiempo}%, avance ${avance}%`}>
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gris-suave">Tiempo</span>
        <span className="dash-carril relative block h-2 flex-1 rounded-full" data-tono="neutro">
          <span className="dash-relleno dash-relleno-tiempo absolute inset-y-0 left-0 rounded-full" style={{ width: `${tiempo}%` }} />
        </span>
        <span className="w-9 shrink-0 text-right text-[11px] font-bold tabular-nums text-gris">{tiempo}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gris-suave">Avance</span>
        <span className="dash-carril relative block h-2 flex-1 rounded-full" data-tono={tono}>
          <span className="dash-relleno absolute inset-y-0 left-0 rounded-full" style={{ width: `${avance}%` }} />
        </span>
        <span className="w-9 shrink-0 text-right text-[11px] font-bold tabular-nums text-tinta">{avance}%</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Piezas chicas
// -----------------------------------------------------------------------------

/** Una pastilla de estado con el color de su tono. */
export function Pastilla({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  return (
    <span {...atributos(tono)} className="dash-pastilla inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
      {children}
    </span>
  );
}

/** Una barrita de progreso fina, de un solo tono. */
export function Barrita({ valor, tono }: { valor: number; tono: Tono }) {
  return (
    <span {...atributos(tono)} className="dash-carril relative block h-1.5 rounded-full" aria-hidden>
      <span className="dash-relleno absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
    </span>
  );
}
