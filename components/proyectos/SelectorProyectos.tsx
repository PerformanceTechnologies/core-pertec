"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Proyecto } from "@/lib/proyectos";
import { puedeEnPanel, type RolPanel } from "@/lib/permisos-panel";
import {
  colorDe,
  diasEntre,
  mesAnio,
  parseFecha,
  ESTADO_PROYECTO_COLOR,
  ESTADO_PROYECTO_LABEL,
} from "@/lib/proyectos-utilidades";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import FormularioProyectoModal from "./FormularioProyectoModal";

interface ResumenObjetivo {
  proyecto_id: string;
  hecho: boolean;
  fecha_inicio: string;
  fecha_fin: string;
}

interface StatsProyecto {
  total: number;
  hechos: number;
  vencen: number;
  minIni: Date | null;
  maxFin: Date | null;
}

function calcularStats(proyectos: Proyecto[], objetivos: ResumenObjetivo[]): Record<string, StatsProyecto> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const mapa: Record<string, StatsProyecto> = {};

  const obtener = (id: string) => {
    if (!mapa[id]) mapa[id] = { total: 0, hechos: 0, vencen: 0, minIni: null, maxFin: null };
    return mapa[id];
  };

  objetivos.forEach((o) => {
    const s = obtener(o.proyecto_id);
    s.total += 1;
    if (o.hecho) s.hechos += 1;
    const fin = parseFecha(o.fecha_fin);
    fin.setHours(0, 0, 0, 0);
    const ini = parseFecha(o.fecha_inicio);
    ini.setHours(0, 0, 0, 0);
    const diff = diasEntre(hoy, fin);
    if (!o.hecho && diff >= 0 && diff <= 7) s.vencen += 1;
    if (!s.minIni || ini < s.minIni) s.minIni = ini;
    if (!s.maxFin || fin > s.maxFin) s.maxFin = fin;
  });

  proyectos.forEach((p) => {
    const s = obtener(p.id);
    if (p.fecha_inicio) s.minIni = parseFecha(p.fecha_inicio);
    if (p.fecha_fin) s.maxFin = parseFecha(p.fecha_fin);
  });

  return mapa;
}

export default function SelectorProyectos({
  rolPanel,
  onElegir,
}: {
  rolPanel: RolPanel;
  onElegir: (id: string) => void;
}) {
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null);
  const [resumenObjetivos, setResumenObjetivos] = useState<ResumenObjetivo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Proyecto | "nuevo" | null>(null);

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/proyectos", { cache: "no-store" });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      setProyectos(cuerpo.proyectos);
      setResumenObjetivos(cuerpo.resumenObjetivos ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los proyectos.");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const stats = useMemo(
    () => calcularStats(proyectos ?? [], resumenObjetivos),
    [proyectos, resumenObjetivos],
  );
  const puedeCrear = puedeEnPanel(rolPanel, "create_objetivo");

  // La cinta de cifras suma sobre las MISMAS stats que muestran las tarjetas, no
  // sobre otra consulta: si el encabezado dijera un total distinto al de las
  // tarjetas de abajo, no habría manera de saber cuál está mal.
  const totales = useMemo(() => {
    const lista = proyectos ?? [];
    let objetivos = 0;
    let hechos = 0;
    let vencen = 0;
    lista.forEach((p) => {
      const s = stats[p.id];
      if (!s) return;
      objetivos += s.total;
      hechos += s.hechos;
      vencen += s.vencen;
    });
    return {
      proyectos: lista.length,
      enCurso: lista.filter((p) => p.estado !== "terminado").length,
      objetivos,
      hechos,
      vencen,
    };
  }, [proyectos, stats]);

  if (error && !proyectos) {
    return (
      <div className="rounded-2xl border border-borde bg-superficie p-8 text-center">
        <p className="text-sm font-medium text-red-600">{error}</p>
        <button
          onClick={cargar}
          className="mt-4 rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40 hover:text-naranjo"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    // El <main> del core no tiene tope de ancho: sin esto, en un monitor de
    // 1900px el encabezado se estira a todo lo largo. Mismo tope que Cotizador,
    // Rendir Gastos y Mi Día.
    <div className="max-w-[1500px]">
      {/* El encabezado va con el mismo tratamiento que el resto del core:
          etiqueta, título condensado en dos líneas y nada de fondo.

          Antes tenía dos gradientes radiales encima de la banda, y sobre el crema
          se veían como una mancha detrás del título en vez de como una
          iluminación. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className="etiqueta-seccion">PERTEC · {mesAnio()}</span>
          <h1 className="mt-2 max-w-[24ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
            Proyectos
            <span className="block text-tinta/40">Objetivos y avance</span>
          </h1>
          <p className="mt-3 max-w-[52ch] text-sm font-light leading-relaxed text-pretty text-tinta/55">
            Elige un proyecto para gestionar sus objetivos, su presupuesto y revisar su avance.
          </p>
        </div>

        {puedeCrear && (
          <button
            type="button"
            onClick={() => setEditando("nuevo")}
            className="shrink-0 self-start rounded-lg bg-naranjo px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo lg:self-auto"
          >
            + Nuevo proyecto
          </button>
        )}
      </div>

      {/* Cinta de cifras, igual que en los otros módulos. Reemplaza al
          "N proyectos activos" que era un h2 solo, y además llena el ancho que
          quedaba vacío arriba de las tarjetas cuando hay pocos proyectos. */}
      <dl className="mt-8 grid grid-cols-1 overflow-hidden rounded-2xl border border-borde sm:grid-cols-3">
        <div className="border-b border-borde bg-naranjo/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-medium text-tinta/55">Proyectos</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-tinta sm:text-3xl">
            {proyectos ? totales.proyectos : "—"}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">
            {proyectos ? `${totales.enCurso} en curso` : "Cargando…"}
          </dd>
        </div>
        <div className="border-b border-borde bg-gris/[0.08] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-medium text-tinta/55">Objetivos cumplidos</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-teal sm:text-3xl">
            {proyectos && totales.objetivos > 0
              ? `${Math.round((totales.hechos / totales.objetivos) * 100)}%`
              : "—"}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">
            {totales.hechos} de {totales.objetivos}
          </dd>
        </div>
        <div className="bg-teal/[0.06] px-5 py-4">
          <dt className="text-xs font-medium text-tinta/55">Vencen esta semana</dt>
          <dd
            className={`mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums sm:text-3xl ${
              totales.vencen > 0 ? "text-naranjo" : "text-tinta"
            }`}
          >
            {proyectos ? totales.vencen : "—"}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">objetivos con plazo a 7 días</dd>
        </div>
      </dl>

      {proyectos && proyectos.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-borde p-8 text-center">
          <p className="text-sm text-pretty text-tinta/60">Aún no hay proyectos.</p>
          {puedeCrear && (
            <button
              type="button"
              onClick={() => setEditando("nuevo")}
              className="mt-4 rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white transition hover:bg-naranjo-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
            >
              Crear el primero
            </button>
          )}
        </div>
      )}

      {/* El tope de 340px por columna es a propósito: con auto-fill y 1fr, dos
          proyectos se estiraban a 750px cada uno en un monitor ancho y la
          tarjeta quedaba con más aire que contenido. Ahora crecen hasta un ancho
          de tarjeta y se alinean a la izquierda. */}
      <div
        className="mt-6 grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 340px))" }}
      >
        {(proyectos ?? []).map((p, i) => {
          const s = stats[p.id] ?? { total: 0, hechos: 0, vencen: 0, minIni: null, maxFin: null };
          const pct = s.total > 0 ? Math.round((s.hechos / s.total) * 100) : 0;
          const color = colorDe(p.color);
          const terminado = p.estado === "terminado";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onElegir(p.id)}
              // h-full + flex-col + el pie con mt-auto: el título de un proyecto
              // ocupa una o tres líneas según el nombre, y sin esto el
              // "ENTRAR →" de cada tarjeta quedaba a una altura distinta.
              className={`animar-revelar group flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-borde bg-superficie p-4 text-left transition hover:-translate-y-0.5 hover:border-naranjo/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo ${SOMBRA_CALIDA}`}
              style={{
                animationDelay: `${Math.min(i, 8) * 70}ms`,
                borderTopColor: color.bg,
                borderTopWidth: 3,
              }}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color.bg }} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-pretty text-tinta">
                    {p.nombre}
                  </h3>
                  {p.descripcion && (
                    <p className="mt-1 line-clamp-2 text-xs font-light leading-relaxed text-pretty text-tinta/50">
                      {p.descripcion}
                    </p>
                  )}
                </div>
                {puedeCrear && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditando(p);
                    }}
                    className="rounded-md p-1 text-tinta/40 opacity-0 transition hover:bg-crema hover:text-naranjo group-hover:opacity-100"
                    aria-label="Editar proyecto"
                  >
                    ✎
                  </span>
                )}
              </div>

              {/* La pastilla de estado y el porcentaje comparten fila.

                  Un proyecto terminado tenía además un sello girado y absoluto en
                  el centro de la tarjeta que decía TERMINADO por segunda vez y
                  tapaba justo el 100% y su barra: el dato que uno viene a mirar
                  quedaba detrás del adorno. */}
              <div className="flex items-center justify-between gap-3">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em]"
                  style={{
                    background: ESTADO_PROYECTO_COLOR[p.estado].bg,
                    color: ESTADO_PROYECTO_COLOR[p.estado].texto,
                    border: `1px solid ${ESTADO_PROYECTO_COLOR[p.estado].borde}`,
                  }}
                >
                  {ESTADO_PROYECTO_LABEL[p.estado]}
                </span>
                <span className="font-condensed text-[22px] font-bold leading-none tracking-tight tabular-nums text-tinta">
                  {pct}
                  <span className="text-xs font-normal text-tinta/50">%</span>
                </span>
              </div>

              <div className="h-1 overflow-hidden rounded-full bg-crema">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: terminado ? "var(--color-teal)" : color.bg }}
                />
              </div>

              <div className="grid grid-cols-3 gap-0 border-t border-borde pt-3">
                <div className="flex flex-col gap-0.5 border-r border-borde pr-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-tinta/45">
                    Objetivos
                  </span>
                  <span className="text-sm font-medium tracking-tight tabular-nums text-tinta">
                    {s.total}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 border-r border-borde px-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-tinta/45">
                    Hechos
                  </span>
                  <span className="text-sm font-medium tracking-tight tabular-nums text-tinta">
                    {s.hechos}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 pl-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-tinta/45">
                    Vencen 7d
                  </span>
                  <span
                    className="text-sm font-medium tracking-tight tabular-nums"
                    style={s.vencen > 0 ? { color: "#C85217" } : { color: "var(--color-tinta)" }}
                  >
                    {s.vencen}
                  </span>
                </div>
              </div>

              {/* mt-auto: el pie se pega abajo, así que "ENTRAR →" queda a la
                  misma altura en toda la fila aunque los títulos midan distinto. */}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-dashed border-borde pt-3">
                {s.minIni && s.maxFin ? (
                  <span className="text-[11px] tabular-nums text-tinta/45">
                    {diasEntre(s.minIni, s.maxFin) + 1} días
                  </span>
                ) : (
                  <span />
                )}
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.08em] text-tinta/45 transition group-hover:gap-2 group-hover:text-naranjo">
                  Entrar →
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {editando && (
        <FormularioProyectoModal
          proyecto={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
