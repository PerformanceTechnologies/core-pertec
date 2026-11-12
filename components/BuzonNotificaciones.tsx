"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconBell, IconPointFilled } from "@tabler/icons-react";
import type { Notificacion } from "@/lib/buzon";
import type { Empresa } from "@/lib/empresas-modelo";
import { useRouter } from "next/navigation";
import { cambiarEmpresaAction } from "@/app/(protegido)/cambiar-empresa";
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
 * La campana de la barra superior, a la izquierda de Mi Día: un número con lo pendiente y un panel
 * con las notificaciones de los módulos que esta persona ve y sus avisos personales (Tareas).
 * Abrir el panel NO las marca: cada una desaparece cuando se abre (o con «Marcar todas como leídas»).
 */
export default function BuzonNotificaciones({ activa = null, empresas = [] }: { activa?: Empresa | null; empresas?: Empresa[] }) {
  const router = useRouter();
  const nombreEmpresa = (id?: string | null) => (id && id !== activa?.id ? empresas.find((e) => e.id === id) ?? null : null);
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
      setNoLeidas(lista.length);
    };
    void traer();
    const t = setInterval(traer, 120_000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [activa?.id]);

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

  const abrir = () => setAbierto((a) => !a);

  /** La saca de la lista al instante; el servidor la marca como vista por detrás. */
  const descartar = (id: string) => {
    setNotis((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
    setNoLeidas((n) => Math.max(0, n - 1));
    marcarNotificacionesLeidasAction([id]).catch(() => {});
  };

  const descartarTodas = () => {
    const ids = (notis ?? []).map((n) => n.id);
    setNotis([]);
    setNoLeidas(0);
    if (ids.length) marcarNotificacionesLeidasAction(ids).catch(() => {});
  };

  return (
    <div className="relative" ref={contenedor}>
      {/* Mismo dibujo que el botón de Mi Día (BarraSuperior): en pantallas angostas queda solo la campana. */}
      <button
        type="button"
        onClick={abrir}
        className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg border text-sm font-medium transition ${
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
      </button>

      {/* Se abre hacia ABAJO (la barra está arriba de la página). En pantallas angostas el botón no
          queda en el borde derecho, así que el panel se ancla a la ventana y no al botón: anclado al
          botón se saldría por la izquierda. */}
      {abierto && (
        <div className="fixed inset-x-3 top-[3.75rem] z-50 max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-xl border border-borde bg-superficie shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between gap-2 border-b border-borde px-4 py-2.5">
            <span className="text-sm font-semibold text-tinta">Notificaciones</span>
            {notis && notis.length > 0 && (
              <button type="button" onClick={descartarTodas} className="text-[11px] font-semibold text-gris transition hover:text-naranjo">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {notis === null && <p className="px-4 py-6 text-center text-xs text-gris">Cargando…</p>}
            {notis && notis.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-gris">Estás al día: no tienes notificaciones pendientes.</p>
            )}
            {notis?.map((n) => {
              const cuerpo = (
                <div className="group flex gap-2.5 px-4 py-3 hover:bg-tinta/[0.03]">
                  <IconPointFilled
                    size={12}
                    className={`mt-1 shrink-0 ${COLOR_SEVERIDAD[n.severidad] ?? COLOR_SEVERIDAD.info}`}
                  />
                  <div className="min-w-0">
                    {nombreEmpresa(n.empresa_id) && (
                      <span className="mb-0.5 inline-block rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-700">{nombreEmpresa(n.empresa_id)!.nombre}</span>
                    )}
                    <p className="text-sm font-medium text-tinta">{n.titulo}</p>
                    {n.cuerpo && <p className="mt-0.5 text-xs text-gris">{n.cuerpo}</p>}
                    <p className="mt-1 text-[11px] text-gris-suave">{haceCuanto(n.creado_en)}</p>
                  </div>
                </div>
              );
              return n.enlace ? (
                <Link
                  key={n.id}
                  href={n.enlace}
                  onClick={(e) => {
                    descartar(n.id);
                    setAbierto(false);
                    // De otra empresa: primero se cambia a esa empresa y después se abre.
                    const otra = nombreEmpresa(n.empresa_id);
                    if (otra && n.enlace) {
                      e.preventDefault();
                      const destino = n.enlace;
                      void cambiarEmpresaAction(otra.slug).then(() => router.push(destino));
                    }
                  }}
                  className="block"
                >
                  {cuerpo}
                </Link>
              ) : (
                <button key={n.id} type="button" onClick={() => descartar(n.id)} className="block w-full text-left" title="Marcar como leída">
                  {cuerpo}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
