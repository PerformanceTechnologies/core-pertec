"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { IconCheck, IconSelector } from "@tabler/icons-react";
import { cambiarEmpresaAction } from "@/app/(protegido)/cambiar-empresa";
import { pendientesOtrasEmpresasAction } from "@/app/(protegido)/buzon/acciones";
import { inicialesDe, logoDe, mostrarSelector, type Empresa } from "@/lib/empresas-modelo";

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
  // Notificaciones sin ver de OTRAS empresas: el selector late hasta que se abren.
  const [pendientes, setPendientes] = useState<Record<string, number>>({});
  useEffect(() => {
    let vigente = true;
    const traer = () => pendientesOtrasEmpresasAction().then((p) => vigente && setPendientes(p)).catch(() => {});
    void traer();
    const t = setInterval(traer, 30_000);
    const alVolver = () => document.visibilityState === "visible" && void traer();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vigente = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activa?.id]);
  const totalOtras = Object.values(pendientes).reduce((a, b) => a + b, 0);

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


  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={pendiente}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title={totalOtras ? `Tienes ${totalOtras} notificación(es) en otra empresa` : "Cambiar de empresa"}
        className={`relative flex h-[34px] items-center gap-1.5 rounded-lg border bg-superficie px-2 text-sm lg:gap-2 lg:px-2.5 text-tinta/75 transition hover:border-naranjo/40 disabled:opacity-50 ${totalOtras ? "animate-pulse border-naranjo ring-2 ring-naranjo/50" : "border-borde"}`}
      >
        {totalOtras > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-naranjo opacity-75" />
            <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-naranjo px-1 text-[10px] font-bold text-white">{totalOtras}</span>
          </span>
        )}
        <Distintivo empresa={activa} />
        <span className="max-w-[9rem] truncate text-left font-medium lg:max-w-[14rem]">{activa.nombre}</span>
        <IconSelector size={15} stroke={1.75} className="shrink-0 text-tinta/35" aria-hidden />
      </button>

      {abierto && (
        <div
          role="listbox"
          className="absolute left-0 z-50 mt-1 w-64 lg:left-auto lg:right-0 overflow-hidden rounded-xl border border-borde bg-fondo shadow-lg"
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
                <Distintivo empresa={e} />
                <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                {(pendientes[e.id] ?? 0) > 0 && (
                  <span className="shrink-0 animate-pulse rounded-full bg-naranjo px-1.5 text-[10px] font-bold text-white">{pendientes[e.id]} nueva{pendientes[e.id] === 1 ? "" : "s"}</span>
                )}
                {esActiva && <IconCheck size={15} stroke={2.25} className="shrink-0 text-naranjo" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** El logo de la empresa; si no tiene, sus iniciales en su color. */
function Distintivo({ empresa }: { empresa: Empresa }) {
  const logo = logoDe(empresa);
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ícono de 22 px servido por el propio core
      <img src={logo} alt="" className="h-[22px] w-[22px] shrink-0 object-contain" aria-hidden />
    );
  }
  return (
    <span
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-tight ${
        TONO[empresa.color] ?? TONO.gris
      }`}
      aria-hidden
    >
      {inicialesDe(empresa.nombre)}
    </span>
  );
}
