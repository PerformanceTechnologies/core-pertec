"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconBell, IconPointFilled } from "@tabler/icons-react";
import type { Notificacion } from "@/lib/buzon";
import {
  listarMisNotificacionesAction,
  marcarNotificacionesLeidasAction,
} from "@/app/(protegido)/buzon/acciones";

const COLOR_SEVERIDAD: Record<string, string> = {
  info: "text-teal",
  alerta: "text-amber-500",
  urgente: "text-rose-500",
};

function haceCuanto(iso: string): string {
  const seg = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seg < 60) return "recién";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} d`;
}

/**
 * La campana de la barra superior, a la izquierda de Mi Día: un número con lo no leído, y un panel
 * con las notificaciones de los módulos que esta persona ve. Al abrir el panel, lo que estaba sin
 * leer se marca como leído.
 */
export default function BuzonNotificaciones() {
  const [abierto, setAbierto] = useState(false);
  const [notis, setNotis] = useState<Notificacion[] | null>(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vigente = true;
    const traer = async () => {
      const lista = await listarMisNotificacionesAction().catch(() => [] as Notificacion[]);
      if (!vigente) return;
      setNotis(lista);
      setNoLeidas(lista.filter((n) => !n.leida).length);
    };
    void traer();
    const t = setInterval(traer, 120_000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  const abrir = async () => {
    const abrirAhora = !abierto;
    setAbierto(abrirAhora);
    if (abrirAhora && noLeidas > 0) {
      setNoLeidas(0);
      setNotis((prev) => (prev ? prev.map((n) => ({ ...n, leida: true })) : prev));
      marcarNotificacionesLeidasAction().catch(() => {});
    }
  };

  return (
    <div className="relative" ref={contenedor}>
      {/* Mismo dibujo que el botón de Mi Día (BarraSuperior): en pantallas angostas queda solo la campana. */}
      <button
        type="button"
        onClick={abrir}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
          abierto
            ? "border-naranjo/40 bg-naranjo/10 text-naranjo"
            : "border-borde bg-superficie text-tinta/75 hover:border-naranjo/40 hover:text-naranjo"
        }`}
        aria-label={noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : "Notificaciones"}
        aria-haspopup="true"
        aria-expanded={abierto}
        title="Notificaciones"
      >
        <span className="relative">
          <IconBell size={16} stroke={1.75} aria-hidden />
          {noLeidas > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {noLeidas > 9 ? "9+" : noLeidas}
            </span>
          )}
        </span>
        <span className="hidden sm:inline">Notificaciones</span>
      </button>

      {/* Se abre hacia ABAJO (la barra está arriba de la página). En pantallas angostas el botón no
          queda en el borde derecho, así que el panel se ancla a la ventana y no al botón: anclado al
          botón se saldría por la izquierda. */}
      {abierto && (
        <div className="fixed inset-x-3 top-32 z-50 overflow-hidden rounded-xl border border-borde bg-superficie shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="border-b border-borde px-4 py-2.5 text-sm font-semibold text-tinta">Notificaciones</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {notis === null && <p className="px-4 py-6 text-center text-xs text-gris">Cargando…</p>}
            {notis && notis.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-gris">No tienes notificaciones.</p>
            )}
            {notis?.map((n) => {
              const cuerpo = (
                <div className="flex gap-2.5 px-4 py-3 hover:bg-tinta/[0.03]">
                  <IconPointFilled
                    size={12}
                    className={`mt-1 shrink-0 ${COLOR_SEVERIDAD[n.severidad] ?? COLOR_SEVERIDAD.info}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-tinta">{n.titulo}</p>
                    {n.cuerpo && <p className="mt-0.5 text-xs text-gris">{n.cuerpo}</p>}
                    <p className="mt-1 text-[11px] text-gris-suave">{haceCuanto(n.creado_en)}</p>
                  </div>
                </div>
              );
              return n.enlace ? (
                <Link key={n.id} href={n.enlace} onClick={() => setAbierto(false)} className="block">
                  {cuerpo}
                </Link>
              ) : (
                <div key={n.id}>{cuerpo}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
