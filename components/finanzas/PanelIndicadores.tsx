"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IconChevronDown } from "@tabler/icons-react";
import type { CodigoIndicador, Indicador } from "@/lib/indicadores";

// Cartilla de indicadores económicos (dólar, UF, UTM, IPC) bajo la barra superior, solo en Finanzas
// y sus submódulos. Transparente y de una línea; al tocarla abre un popup con el detalle completo.

/** Rutas donde se muestra: el módulo Finanzas y todo lo que cuelga de él. */
const RUTAS = ["/modulos/finanzas", "/finanzas", "/gestion-financiera", "/rendir-gastos"];
const REFRESCO_MS = 10 * 60 * 1000;

/** Lo que muestra la cartilla, en este orden. */
const EN_CARTILLA: { codigo: CodigoIndicador; etiqueta: string }[] = [
  { codigo: "dolar", etiqueta: "Dólar" },
  { codigo: "uf", etiqueta: "UF" },
  { codigo: "utm", etiqueta: "UTM" },
  { codigo: "ipc", etiqueta: "IPC" },
];

/** Cómo se ordena el popup. */
const GRUPOS: { titulo: string; codigos: CodigoIndicador[] }[] = [
  { titulo: "Monedas", codigos: ["dolar", "euro"] },
  { titulo: "Unidades de reajuste", codigos: ["uf", "utm", "ivp"] },
  { titulo: "Inflación y actividad", codigos: ["ipc", "tpm", "imacec", "desempleo"] },
  { titulo: "Mercado", codigos: ["cobre", "ipsa"] },
];

const num = (n: number, dec: number) => n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const conSigno = (n: number, dec = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), dec)}`;

function valorCorto(i: Indicador) {
  if (i.unidad === "porcentaje") return `${num(i.valor, 1)}%`;
  return `$${num(i.valor, i.codigo === "dolar" ? 2 : 0)}`;
}

function valorLargo(i: Indicador) {
  switch (i.unidad) {
    case "porcentaje":
      return `${num(i.valor, 2)}%`;
    case "usd":
      return `US$ ${num(i.valor, 2)}`;
    case "puntos":
      return `${num(i.valor, 2)} pts`;
    default:
      return `$${num(i.valor, i.codigo === "utm" ? 0 : 2)}`;
  }
}

// Los de pesos y mercado son diarios; el IPC, la TPM del mes y compañía son mensuales: ahí un día no dice nada.
const MENSUALES: CodigoIndicador[] = ["utm", "ipc", "imacec", "desempleo"];
function fechaDe(i: Indicador) {
  if (!i.fecha) return "";
  const f = new Date(`${i.fecha}T12:00:00Z`);
  if (Number.isNaN(f.getTime())) return "";
  return MENSUALES.includes(i.codigo)
    ? f.toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })
    : f.toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Las líneas chicas bajo el valor de cada fila: lo que hace útil al número. */
function notasDe(i: Indicador): { texto: string; tono?: "sube" | "baja" }[] {
  const notas: { texto: string; tono?: "sube" | "baja" }[] = [];
  if (i.codigo === "dolar") {
    if (i.variacion !== null && i.variacionPct !== null) {
      notas.push({
        texto: `${conSigno(i.variacion)} (${conSigno(i.variacionPct)}%) vs. dato anterior`,
        tono: i.variacion > 0 ? "sube" : i.variacion < 0 ? "baja" : undefined,
      });
    }
    if (i.minimo !== null && i.maximo !== null) notas.push({ texto: `Rango 30 días: $${num(i.minimo, 2)} – $${num(i.maximo, 2)}` });
  }
  if (i.codigo === "uf" && i.variacionPct !== null) notas.push({ texto: `${conSigno(i.variacionPct)}% en 30 días` });
  if (i.codigo === "ipc") {
    if (i.acumuladoAnio !== null) notas.push({ texto: `Acumulado del año: ${conSigno(i.acumuladoAnio)}%` });
    if (i.acumulado12m !== null) notas.push({ texto: `Últimos 12 meses: ${conSigno(i.acumulado12m)}%` });
  }
  return notas;
}

export default function PanelIndicadores() {
  const ruta = usePathname();
  const visible = RUTAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));
  const [datos, setDatos] = useState<{ indicadores: Indicador[]; fuente: string } | null>(null);
  const [error, setError] = useState(false);
  // Se guarda en qué página se abrió: al navegar, el popup deja de contar como abierto solo.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === ruta;
  const [monto, setMonto] = useState("1");
  const caja = useRef<HTMLDivElement>(null);

  // Carga al entrar a Finanzas, se refresca cada 10 min y, si la pestaña estuvo oculta,
  // apenas se vuelve a ella.
  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    const cargar = () => {
      fetch("/api/indicadores")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
        .then((j) => {
          if (!vivo) return;
          setDatos(j);
          setError(false);
        })
        // los datos anteriores, si los hay, se quedan en pantalla
        .catch(() => vivo && setError(true));
    };
    cargar();
    const t = setInterval(() => !document.hidden && cargar(), REFRESCO_MS);
    const alVolver = () => !document.hidden && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [visible]);

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbiertoEn(null);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbiertoEn(null);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  if (!visible) return null;

  const porCodigo = (c: CodigoIndicador) => datos?.indicadores.find((i) => i.codigo === c);
  const [dolar, euro, uf] = [porCodigo("dolar"), porCodigo("euro"), porCodigo("uf")];
  // Se acepta coma o punto como separador decimal (1,5 y 1.5 son lo mismo).
  const cantidad = Number(monto.replace(",", ".")) || 0;

  return (
    <div ref={caja} className="relative mb-3 flex justify-end">
      {!datos && error && <p className="text-xs text-gris">Indicadores no disponibles por ahora.</p>}
      {!datos && !error && <div className="h-[46px] w-full animate-pulse rounded-full bg-tinta/[0.04] sm:w-[27rem]" aria-hidden />}

      {datos && (
        <>
          <button
            type="button"
            onClick={() => setAbiertoEn(abierto ? null : ruta)}
            aria-expanded={abierto}
            aria-haspopup="dialog"
            aria-label="Indicadores económicos: ver detalle"
            className="group flex w-full items-center rounded-full border border-borde/80 bg-transparent px-3 py-1.5 text-left transition hover:border-naranjo/40 hover:bg-tinta/[0.03] sm:w-auto sm:px-4"
          >
            <span className="grid min-w-0 flex-1 grid-cols-4 divide-x divide-borde/70 sm:flex sm:flex-none">
              {EN_CARTILLA.map(({ codigo, etiqueta }) => {
                const i = porCodigo(codigo);
                return (
                  <span key={codigo} className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                    <span className="block text-[9px] font-semibold uppercase leading-3 tracking-[0.14em] text-gris">{etiqueta}</span>
                    <span className="block truncate text-[13px] font-semibold leading-[18px] tabular-nums text-tinta">{i ? valorCorto(i) : "—"}</span>
                  </span>
                );
              })}
            </span>
            <IconChevronDown
              size={14}
              stroke={1.75}
              aria-hidden
              className={`ml-1.5 shrink-0 text-gris transition-transform group-hover:text-naranjo sm:ml-2 ${abierto ? "rotate-180" : ""}`}
            />
          </button>

          {abierto && (
            <div
              role="dialog"
              aria-label="Indicadores económicos"
              className="absolute right-0 top-full z-40 mt-2 flex max-h-[min(34rem,calc(100dvh-9rem))] w-full flex-col overflow-hidden rounded-2xl border border-borde bg-fondo shadow-[0_1px_2px_rgba(23,20,17,0.04),0_16px_36px_-12px_rgba(23,20,17,0.22)] sm:w-[26rem]"
            >
              <div className="overflow-y-auto overscroll-contain">
                {GRUPOS.map(({ titulo, codigos }) => {
                  const filas = codigos.map(porCodigo).filter((i): i is Indicador => !!i);
                  if (!filas.length) return null;
                  return (
                    <section key={titulo} className="border-b border-borde/70">
                      <h3 className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-gris">{titulo}</h3>
                      <ul className="pb-1.5">
                        {filas.map((i) => (
                          <li key={i.codigo} className="flex items-start justify-between gap-4 px-4 py-1.5">
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium leading-5 text-tinta">{i.nombre}</p>
                              <p className="text-[11px] capitalize leading-4 text-gris">{fechaDe(i)}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-condensed text-lg font-bold leading-5 tabular-nums text-tinta">{valorLargo(i)}</p>
                              {notasDe(i).map((n) => (
                                <p
                                  key={n.texto}
                                  className={`mt-0.5 text-[11px] leading-4 tabular-nums ${
                                    n.tono === "sube" ? "text-rose-600" : n.tono === "baja" ? "text-emerald-600" : "text-gris"
                                  }`}
                                >
                                  {n.texto}
                                </p>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}

                {dolar && euro && uf && (
                  <section className="px-4 pb-3 pt-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gris">Convertir a pesos</h3>
                    <input
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      inputMode="decimal"
                      aria-label="Cantidad a convertir"
                      placeholder="Cantidad"
                      className="mt-2 h-10 w-full rounded-lg border border-borde bg-transparent px-3 text-base tabular-nums text-tinta focus:border-naranjo/50 focus:outline-none sm:h-9 sm:text-sm"
                    />
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                      {[
                        { et: "UF", v: cantidad * uf.valor },
                        { et: "US$", v: cantidad * dolar.valor },
                        { et: "€", v: cantidad * euro.valor },
                      ].map(({ et, v }) => (
                        <div key={et} className="min-w-0 rounded-lg bg-tinta/[0.03] px-1.5 py-1.5">
                          <dt className="text-[10px] font-semibold text-gris">{et}</dt>
                          <dd className="truncate text-[13px] font-semibold tabular-nums text-tinta">${num(v, 0)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </div>
              <p className="shrink-0 border-t border-borde/70 px-4 py-2 text-[10px] text-gris-suave">
                Fuente: {datos.fuente}
                {error ? " · no se pudo actualizar, se muestra el último dato" : " · se actualiza solo"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
