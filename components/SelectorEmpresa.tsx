"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconCheck, IconSelector } from "@tabler/icons-react";
import { cambiarEmpresaAction } from "@/app/(protegido)/cambiar-empresa";
import { inicialesDe, mostrarSelector, type Empresa } from "@/lib/empresas-modelo";

// El chip de cada empresa: PERTEC naranjo, Zeus dorado, Performance Service gris.
const TONO: Record<string, string> = {
  naranjo: "bg-[#c85217]/15 text-[#c85217]",
  dorado: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  gris: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

/**
 * El cambio de empresa, arriba a la derecha de la página.
 *
 * Deliberadamente discreto: un renglón con las iniciales y el nombre, del mismo
 * tamaño que los ítems del menú, que solo aparece si hay más de una empresa
 * donde pararse. Para la mayoría de la gente —que trabaja solo en PERTEC— el
 * menú queda exactamente como estaba.
 */
export default function SelectorEmpresa({
  activa,
  permitidas,
}: {
  activa: Empresa | null;
  permitidas: Empresa[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera o con Escape: un panel que se queda abierto
  // tapando el menú es peor que no tenerlo.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  if (!activa || !mostrarSelector(permitidas)) return null;

  function cambiar(slug: string) {
    setAbierto(false);
    if (slug === activa?.slug) return;
    iniciar(() => {
      void cambiarEmpresaAction(slug);
    });
  }

  const iniciales = inicialesDe(activa.nombre);
  const tono = TONO[activa.color] ?? TONO.gris;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={pendiente}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title="Cambiar de empresa"
        className="flex items-center gap-2 rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm text-tinta/75 transition hover:border-naranjo/40 disabled:opacity-50"
      >
        <span
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-tight ${tono}`}
          aria-hidden
        >
          {iniciales}
        </span>
        <span className="hidden max-w-[14rem] truncate text-left font-medium sm:inline">{activa.nombre}</span>
        <IconSelector size={15} stroke={1.75} className="shrink-0 text-tinta/35" aria-hidden />
      </button>

      {abierto && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border border-borde bg-fondo shadow-lg"
        >
          <p className="border-b border-borde px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-tinta/40">
            Empresa
          </p>
          {permitidas.map((e) => {
            const esActiva = e.slug === activa.slug;
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={esActiva}
                onClick={() => cambiar(e.slug)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-tinta/80 transition hover:bg-tinta/5"
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-tight ${
                    TONO[e.color] ?? TONO.gris
                  }`}
                  aria-hidden
                >
                  {inicialesDe(e.nombre)}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                {esActiva && <IconCheck size={15} stroke={2.25} className="shrink-0 text-naranjo" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
