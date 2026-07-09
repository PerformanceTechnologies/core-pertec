"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Proyecto } from "@/lib/proyectos";
import { puedeEnPanel, type RolPanel } from "@/lib/permisos-panel";
import { colorDe, diasEntre, mesAnio, parseFecha } from "@/lib/proyectos-utilidades";
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

  const stats = useMemo(() => calcularStats(proyectos ?? [], resumenObjetivos), [proyectos, resumenObjetivos]);
  const puedeCrear = puedeEnPanel(rolPanel, "create_objetivo");

  if (error && !proyectos) {
    return (
      <div className="rounded-2xl border border-borde bg-white p-8 text-center">
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
    <div className="flex flex-col gap-7">
      <div className="animar-revelar relative overflow-hidden border-b border-borde pb-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 80% 10%, rgba(200,82,23,.12), transparent 50%), radial-gradient(ellipse at 8% 95%, rgba(0,160,128,.09), transparent 55%)",
          }}
        />
        <div className="relative">
          <span className="etiqueta-seccion">PERTEC · {mesAnio()}</span>
          <h1 className="mt-2.5 text-[28px] font-medium uppercase leading-[1.1] tracking-tight text-tinta sm:text-[32px]">
            Proyectos
          </h1>
          <p className="mt-2 max-w-lg text-sm font-light leading-relaxed text-tinta/55">
            Selecciona un proyecto para gestionar sus objetivos y revisar su avance.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium leading-none tracking-tight text-tinta">
          {proyectos ? `${proyectos.length} proyecto${proyectos.length === 1 ? "" : "s"} activo${proyectos.length === 1 ? "" : "s"}` : "Cargando…"}
        </h2>
        {puedeCrear && (
          <button
            onClick={() => setEditando("nuevo")}
            className="rounded-full bg-naranjo px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:-translate-y-px hover:bg-[#b14614] hover:shadow-[0_8px_20px_rgba(200,82,23,.35)]"
          >
            + Nuevo proyecto
          </button>
        )}
      </div>

      {proyectos && proyectos.length === 0 && (
        <div className="rounded-2xl border border-borde bg-white p-8 text-center">
          <p className="text-sm text-tinta/60">Aún no hay proyectos.</p>
          {puedeCrear && (
            <button
              onClick={() => setEditando("nuevo")}
              className="mt-4 rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave"
            >
              Crear el primero
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {(proyectos ?? []).map((p, i) => {
          const s = stats[p.id] ?? { total: 0, hechos: 0, vencen: 0, minIni: null, maxFin: null };
          const pct = s.total > 0 ? Math.round((s.hechos / s.total) * 100) : 0;
          const color = colorDe(p.color);
          return (
            <button
              key={p.id}
              onClick={() => onElegir(p.id)}
              className="animar-revelar group relative flex flex-col gap-4 border border-borde bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(12,10,9,.08)]"
              style={{ animationDelay: `${Math.min(i, 8) * 70}ms`, borderTopColor: color.bg, borderTopWidth: 3 }}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color.bg }} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-tinta">{p.nombre}</h3>
                  {p.descripcion && <p className="mt-1 text-xs font-light leading-relaxed text-tinta/50">{p.descripcion}</p>}
                </div>
                {puedeCrear && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditando(p);
                    }}
                    className="rounded-lg p-1 text-tinta/40 opacity-0 transition hover:bg-crema hover:text-naranjo group-hover:opacity-100"
                    aria-label="Editar proyecto"
                  >
                    ✎
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[22px] font-medium leading-none tracking-tight text-tinta [font-variant-numeric:tabular-nums]">
                  {pct}
                  <span className="text-xs font-normal text-tinta/50">%</span>
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-crema">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: color.bg }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-0 border-t border-borde pt-3">
                <div className="flex flex-col gap-0.5 border-r border-borde pr-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-tinta/45">Objetivos</span>
                  <span className="text-sm font-medium tracking-tight text-tinta [font-variant-numeric:tabular-nums]">{s.total}</span>
                </div>
                <div className="flex flex-col gap-0.5 border-r border-borde px-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-tinta/45">Hechos</span>
                  <span className="text-sm font-medium tracking-tight text-tinta [font-variant-numeric:tabular-nums]">{s.hechos}</span>
                </div>
                <div className="flex flex-col gap-0.5 pl-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[.14em] text-tinta/45">Vencen 7d</span>
                  <span
                    className="text-sm font-medium tracking-tight [font-variant-numeric:tabular-nums]"
                    style={s.vencen > 0 ? { color: "#C85217" } : { color: "var(--color-tinta)" }}
                  >
                    {s.vencen}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-dashed border-borde pt-3">
                {s.minIni && s.maxFin ? (
                  <span className="text-[11px] text-tinta/45">{diasEntre(s.minIni, s.maxFin) + 1} días</span>
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
