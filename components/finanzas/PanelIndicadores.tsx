"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IconChevronDown } from "@tabler/icons-react";

// Cartilla de indicadores económicos (dólar, UF, UTM, IPC) bajo la barra superior, solo en Finanzas
// y sus submódulos. Transparente y de una línea; al tocarla abre un popup con el detalle completo.

/** Rutas donde se muestra: el módulo Finanzas y todo lo que cuelga de él. */
const RUTAS = ["/modulos/finanzas", "/finanzas", "/gestion-financiera", "/rendir-gastos"];
const REFRESCO_MS = 10 * 60 * 1000;

interface Indicador {
  codigo: "dolar" | "uf" | "utm" | "ipc" | "tpm";
  nombre: string;
  valor: number;
  fecha: string;
  unidad: "pesos" | "porcentaje";
  variacion: number | null;
}

/** Lo que muestra la cartilla, en este orden. La TPM solo aparece en el popup. */
const EN_CARTILLA: { codigo: Indicador["codigo"]; etiqueta: string }[] = [
  { codigo: "dolar", etiqueta: "Dólar" },
  { codigo: "uf", etiqueta: "UF" },
  { codigo: "utm", etiqueta: "UTM" },
  { codigo: "ipc", etiqueta: "IPC" },
];

const num = (n: number, dec: number) => n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });

function valorCorto(i: Indicador) {
  if (i.unidad === "porcentaje") return `${num(i.valor, 1)}%`;
  return `$${num(i.valor, i.codigo === "dolar" ? 2 : 0)}`;
}

function valorLargo(i: Indicador) {
  if (i.unidad === "porcentaje") return `${num(i.valor, 2)}%`;
  return `$${num(i.valor, i.codigo === "utm" ? 0 : 2)}`;
}

// Los indicadores de pesos son diarios; el IPC y la TPM son de un mes: ahí un día no dice nada.
function fechaDe(i: Indicador) {
  if (!i.fecha) return "";
  const f = new Date(`${i.fecha}T12:00:00Z`);
  if (Number.isNaN(f.getTime())) return "";
  return i.unidad === "porcentaje"
    ? f.toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })
    : f.toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function PanelIndicadores() {
  const ruta = usePathname();
  const visible = RUTAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));
  const [datos, setDatos] = useState<{ indicadores: Indicador[]; fuente: string } | null>(null);
  const [error, setError] = useState(false);
  // Se guarda en qué página se abrió: al navegar, el popup deja de contar como abierto solo.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === ruta;
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

  // Cerrar al hacer clic afuera, con Escape o al cambiar de página.
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

  const porCodigo = (c: string) => datos?.indicadores.find((i) => i.codigo === c);

  return (
    <div ref={caja} className="relative mb-5 flex justify-end">
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
              className="absolute right-0 top-full z-40 mt-2 w-full overflow-hidden rounded-2xl border border-borde bg-fondo shadow-[0_1px_2px_rgba(23,20,17,0.04),0_16px_36px_-12px_rgba(23,20,17,0.22)] sm:w-[22rem]"
            >
              <ul className="divide-y divide-borde/70">
                {datos.indicadores.map((i) => (
                  <li key={i.codigo} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-tinta">{i.nombre}</p>
                      <p className="text-[11px] capitalize text-gris">{fechaDe(i)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-condensed text-lg font-bold leading-6 tabular-nums text-tinta">{valorLargo(i)}</p>
                      {i.variacion !== null && i.variacion !== 0 && (
                        <p className={`text-[11px] font-semibold tabular-nums ${i.variacion > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {i.variacion > 0 ? "▲" : "▼"} {num(Math.abs(i.variacion), 2)} vs. anterior
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="border-t border-borde/70 px-4 py-2 text-[10px] text-gris-suave">
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
