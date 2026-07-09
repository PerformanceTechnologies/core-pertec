"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Objetivo, Proyecto } from "@/lib/proyectos";
import { puedeEnPanel, puedeVerGastos, puedeEditarGastos, type RolPanel } from "@/lib/permisos-panel";
import { colorDe, diasEntre, parseFecha, ESTADO_PROYECTO_COLOR, ESTADO_PROYECTO_LABEL } from "@/lib/proyectos-utilidades";
import AnilloProgreso from "./AnilloProgreso";
import Gantt from "./Gantt";
import TableroObjetivos from "./TableroObjetivos";
import FormularioObjetivoModal from "./FormularioObjetivoModal";
import GastosProyecto from "./GastosProyecto";
import GastosHeroMini from "./GastosHeroMini";
import SeccionMantencion from "@/components/mantencion/SeccionMantencion";

export default function VistaProyecto({
  proyectoId,
  rolPanel,
  onVolver,
}: {
  proyectoId: string;
  rolPanel: RolPanel;
  onVolver: () => void;
}) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [objetivos, setObjetivos] = useState<Objetivo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"gantt" | "checklist">("gantt");
  const [editando, setEditando] = useState<Objetivo | "nuevo" | null>(null);
  const [seccion, setSeccion] = useState<"objetivos" | "gastos" | "mantencion">("objetivos");
  const puedeVerGastosProyecto = puedeVerGastos(rolPanel);

  // Si el rol cambia dentro de la misma sesión del navegador (sin recargar)
  // y pierde acceso a Gastos, que no se quede mostrando esa sección.
  useEffect(() => {
    if (!puedeVerGastosProyecto) setSeccion("objetivos");
  }, [puedeVerGastosProyecto]);

  const cargar = useCallback(async () => {
    try {
      const [rp, ro] = await Promise.all([
        fetch(`/api/proyectos/${proyectoId}`, { cache: "no-store" }),
        fetch(`/api/proyectos/${proyectoId}/objetivos`, { cache: "no-store" }),
      ]);
      const cp = await rp.json();
      const co = await ro.json();
      if (!rp.ok) throw new Error(cp.error ?? "Error desconocido");
      if (!ro.ok) throw new Error(co.error ?? "Error desconocido");
      setProyecto(cp.proyecto);
      setObjetivos(co.objetivos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar el proyecto.");
    }
  }, [proyectoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const objetivosTop = useMemo(() => (objetivos ?? []).filter((o) => !o.parent_id), [objetivos]);
  const objetivosPorPadre = useMemo(() => {
    const m: Record<string, Objetivo[]> = {};
    (objetivos ?? []).forEach((o) => {
      if (o.parent_id) {
        if (!m[o.parent_id]) m[o.parent_id] = [];
        m[o.parent_id].push(o);
      }
    });
    Object.keys(m).forEach((k) => m[k].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)));
    return m;
  }, [objetivos]);

  const total = objetivosTop.length;
  const hechos = objetivosTop.filter((o) => o.hecho).length;
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
  const vencen = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return (objetivos ?? []).filter((o) => {
      if (o.hecho) return false;
      const fin = parseFecha(o.fecha_fin);
      fin.setHours(0, 0, 0, 0);
      const diff = diasEntre(hoy, fin);
      return diff >= 0 && diff <= 7;
    }).length;
  }, [objetivos]);

  const puedeCrear = puedeEnPanel(rolPanel, "create_objetivo");
  const puedeEditar = puedeEnPanel(rolPanel, "edit_objetivo");
  const puedeAlternar = puedeEnPanel(rolPanel, "toggle_objetivo");
  const puedeEliminar = puedeEnPanel(rolPanel, "delete_objetivo");

  const alternarHecho = async (o: Objetivo) => {
    if (!puedeAlternar) return;
    setObjetivos((prev) => (prev ?? []).map((x) => (x.id === o.id ? { ...x, hecho: !o.hecho } : x)));
    const respuesta = await fetch(`/api/objetivos/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hecho: !o.hecho }),
    });
    if (!respuesta.ok) cargar();
  };

  const eliminarObjetivo = async (o: Objetivo) => {
    if (!puedeEliminar) return;
    if (!window.confirm(`¿Eliminar "${o.titulo}"?`)) return;
    const respuesta = await fetch(`/api/objetivos/${o.id}`, { method: "DELETE" });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) {
      alert("Error: " + (cuerpo.error ?? "desconocido"));
      return;
    }
    cargar();
  };

  const agregarSub = async (padre: Objetivo, titulo: string): Promise<boolean> => {
    if (rolPanel !== "admin") return false;
    const respuesta = await fetch(`/api/objetivos/${padre.id}/sub`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo }),
    });
    if (!respuesta.ok) return false;
    await cargar();
    return true;
  };

  if (error && !objetivos) {
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

  const color = colorDe(proyecto?.color ?? "cobre");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={onVolver} className="text-sm font-medium text-tinta/60 hover:text-naranjo">
            ← Proyectos
          </button>
          {proyecto && (
            <>
              <span className="text-tinta/30">/</span>
              <span className="h-2 w-2 rounded-full" style={{ background: color.bg }} />
              <span className="font-condensed font-bold uppercase text-tinta">{proyecto.nombre}</span>
            </>
          )}
        </div>

        <div className="flex gap-1 rounded-full border border-borde bg-white p-1">
          <button
            onClick={() => setSeccion("objetivos")}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition ${
              seccion === "objetivos" ? "bg-naranjo text-white shadow-[0_4px_14px_rgba(200,82,23,.25)]" : "text-tinta/50 hover:text-tinta"
            }`}
          >
            Objetivos
          </button>
          <button
            onClick={() => setSeccion("mantencion")}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition ${
              seccion === "mantencion" ? "bg-naranjo text-white shadow-[0_4px_14px_rgba(200,82,23,.25)]" : "text-tinta/50 hover:text-tinta"
            }`}
          >
            Mantención
          </button>
          {puedeVerGastosProyecto && (
            <button
              onClick={() => setSeccion("gastos")}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition ${
                seccion === "gastos" ? "bg-naranjo text-white shadow-[0_4px_14px_rgba(200,82,23,.25)]" : "text-tinta/50 hover:text-tinta"
              }`}
            >
              Gastos
            </button>
          )}
        </div>
      </div>

      {seccion === "gastos" && puedeVerGastosProyecto && proyecto ? (
        <GastosProyecto proyecto={proyecto} puedeEditar={puedeEditarGastos(rolPanel)} onActualizado={cargar} />
      ) : seccion === "mantencion" ? (
        <SeccionMantencion rolPanel={rolPanel} />
      ) : (
        <>

      <div className="animar-revelar relative overflow-hidden border-b border-borde py-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 80% 10%, rgba(200,82,23,.10), transparent 50%), radial-gradient(ellipse at 8% 95%, rgba(0,160,128,.08), transparent 55%)",
          }}
        />
        <div className={`relative ${puedeVerGastosProyecto ? "flex flex-col items-center justify-center gap-8 lg:flex-row lg:justify-center" : "mx-auto max-w-sm"}`}>
          {puedeVerGastosProyecto && proyecto && <GastosHeroMini proyecto={proyecto} onVerDetalle={() => setSeccion("gastos")} />}

          <div className="relative mx-auto w-full max-w-sm overflow-hidden bg-white px-6 py-5 shadow-[0_20px_40px_rgba(12,10,9,.08)]">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: "linear-gradient(180deg, #C85217 0%, #E67E3F 50%, #00A080 100%)" }}
            />
            <div className="flex items-baseline justify-between border-b border-borde pb-3.5">
              <span className="etiqueta-seccion">Progreso global</span>
              <div className="flex items-center gap-2">
                {proyecto && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em]"
                    style={{
                      background: ESTADO_PROYECTO_COLOR[proyecto.estado].bg,
                      color: ESTADO_PROYECTO_COLOR[proyecto.estado].texto,
                      border: `1px solid ${ESTADO_PROYECTO_COLOR[proyecto.estado].borde}`,
                    }}
                  >
                    {ESTADO_PROYECTO_LABEL[proyecto.estado]}
                  </span>
                )}
                <span className="text-xs font-medium tracking-wide text-tinta/50">
                  {hechos}/{total}
                </span>
              </div>
            </div>

            <div className="flex justify-center py-5">
              <div className="relative flex items-center justify-center">
                <AnilloProgreso pct={pct} size={104} stroke={8} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[26px] font-medium leading-none tracking-tight text-tinta">
                    {pct}
                    <span className="text-xs font-normal text-tinta/50">%</span>
                  </span>
                  <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[.18em] text-tinta/50">completado</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-0 border-t border-borde pt-4">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">Activos</span>
                <span className="text-lg font-medium leading-none tracking-tight" style={{ color: "#C85217" }}>
                  {total - hechos}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1.5 border-x border-borde">
                <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">Completados</span>
                <span className="text-lg font-medium leading-none tracking-tight" style={{ color: "#00A080" }}>
                  {hechos}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">Vencen ≤7d</span>
                <span className="text-lg font-medium leading-none tracking-tight" style={{ color: vencen > 0 ? "#b58900" : "var(--color-tinta)" }}>
                  {vencen}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-borde bg-white p-1">
          <button
            onClick={() => setVista("gantt")}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition ${
              vista === "gantt" ? "bg-naranjo text-white shadow-[0_4px_14px_rgba(200,82,23,.25)]" : "text-tinta/50 hover:text-tinta"
            }`}
          >
            Gantt
          </button>
          <button
            onClick={() => setVista("checklist")}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition ${
              vista === "checklist" ? "bg-naranjo text-white shadow-[0_4px_14px_rgba(200,82,23,.25)]" : "text-tinta/50 hover:text-tinta"
            }`}
          >
            Checklist
          </button>
        </div>
        {puedeCrear && (
          <button
            onClick={() => setEditando("nuevo")}
            className="rounded-full bg-naranjo px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:-translate-y-px hover:bg-[#b14614] hover:shadow-[0_8px_20px_rgba(200,82,23,.35)]"
          >
            + Nuevo objetivo
          </button>
        )}
      </div>

      {!objetivos ? (
        <div className="rounded-2xl border border-borde bg-white p-8 text-center text-sm text-tinta/50">Cargando…</div>
      ) : objetivosTop.length === 0 ? (
        <div className="rounded-2xl border border-borde bg-white p-8 text-center">
          <p className="text-sm text-tinta/60">Aún no hay objetivos cargados.</p>
          {puedeCrear && (
            <button
              onClick={() => setEditando("nuevo")}
              className="mt-4 rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave"
            >
              Crear el primero
            </button>
          )}
        </div>
      ) : vista === "gantt" ? (
        <Gantt
          objetivos={objetivosTop}
          puedeEditar={puedeEditar}
          puedeAlternar={puedeAlternar}
          onAlternar={alternarHecho}
          onEditar={(o) => puedeEditar && setEditando(o)}
        />
      ) : (
        <TableroObjetivos
          objetivos={objetivosTop}
          objetivosPorPadre={objetivosPorPadre}
          rolPanel={rolPanel}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          puedeAlternar={puedeAlternar}
          onAlternar={alternarHecho}
          onEditar={(o) => puedeEditar && setEditando(o)}
          onEliminar={eliminarObjetivo}
          onAgregarSub={agregarSub}
        />
      )}

      {editando && (
        <FormularioObjetivoModal
          objetivo={editando === "nuevo" ? null : editando}
          proyectoId={proyectoId}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
          onEliminar={
            editando !== "nuevo" && puedeEliminar
              ? () => {
                  eliminarObjetivo(editando);
                  setEditando(null);
                }
              : null
          }
        />
      )}
        </>
      )}
    </div>
  );
}
