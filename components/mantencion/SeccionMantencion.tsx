"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChecklistPlantilla, ChecklistRun, EquipoMantenimiento, EstadoEquipo, FotoEvidencia, MantencionBundle } from "@/lib/mantencion";
import { puedeEnPanel, type RolPanel } from "@/lib/permisos-panel";
import { mesAnio } from "@/lib/proyectos-utilidades";
import TarjetaPlantilla from "./TarjetaPlantilla";
import FormularioPlantillaModal from "./FormularioPlantillaModal";
import FormularioEquipoModal from "./FormularioEquipoModal";

export default function SeccionMantencion({ rolPanel }: { rolPanel: RolPanel }) {
  const [bundle, setBundle] = useState<MantencionBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editandoPlantilla, setEditandoPlantilla] = useState<ChecklistPlantilla | "nueva" | null>(null);
  const [editandoEquipo, setEditandoEquipo] = useState<{ equipo: EquipoMantenimiento | null; plantilla: ChecklistPlantilla } | null>(null);

  const esAdmin = rolPanel === "admin";
  const puedeOperar = puedeEnPanel(rolPanel, "run_checklist");

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/mantencion", { cache: "no-store" });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      setBundle(cuerpo);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la mantención.");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const equiposPorPlantilla = useMemo(() => {
    const mapa: Record<string, EquipoMantenimiento[]> = {};
    (bundle?.equipos ?? []).forEach((e) => {
      if (!mapa[e.checklist_id]) mapa[e.checklist_id] = [];
      mapa[e.checklist_id].push(e);
    });
    return mapa;
  }, [bundle]);

  const runsPorEquipo = useMemo(() => {
    const mapa: Record<string, ChecklistRun[]> = {};
    (bundle?.runs ?? []).forEach((r) => {
      if (!mapa[r.equipo_id]) mapa[r.equipo_id] = [];
      mapa[r.equipo_id].push(r);
    });
    return mapa;
  }, [bundle]);

  // Mutaciones optimistas locales para no perder la posición de scroll ni
  // recargar todo el árbol en cada click de checkbox.
  const actualizarItemLocal = (runId: string, itemId: string, cambios: Partial<ChecklistRun["items"][number]>) => {
    setBundle((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        runs: prev.runs.map((r) => (r.id !== runId ? r : { ...r, items: r.items.map((it) => (it.id === itemId ? { ...it, ...cambios } : it)) })),
      };
    });
  };

  const onCheckItem = async (runId: string, itemId: string, hecho: boolean) => {
    actualizarItemLocal(runId, itemId, { hecho, hecho_en: hecho ? new Date().toISOString() : null });
    const respuesta = await fetch(`/api/mantencion/run-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hecho }),
    });
    if (!respuesta.ok) cargar();
  };

  const onUpdateItem = async (
    runId: string,
    itemId: string,
    patch: { notas?: string | null; fotos?: FotoEvidencia[]; medicion?: Record<string, string> | null }
  ) => {
    actualizarItemLocal(runId, itemId, patch);
    const respuesta = await fetch(`/api/mantencion/run-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!respuesta.ok) cargar();
  };

  const onNuevaInspeccion = async (equipo: EquipoMantenimiento, plantilla: ChecklistPlantilla) => {
    const respuesta = await fetch("/api/mantencion/inspecciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipo_id: equipo.id, checklist_id: plantilla.id }),
    });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) {
      alert("Error: " + (cuerpo.error ?? "desconocido"));
      return;
    }
    cargar();
  };

  const onCerrarRun = async (runId: string) => {
    const respuesta = await fetch(`/api/mantencion/inspecciones/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "cerrar" }),
    });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json();
      alert("Error: " + (cuerpo.error ?? "desconocido"));
    }
    cargar();
  };

  const onReabrirRun = async (runId: string) => {
    const respuesta = await fetch(`/api/mantencion/inspecciones/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "reabrir" }),
    });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json();
      alert("Error: " + (cuerpo.error ?? "desconocido"));
    }
    cargar();
  };

  const onEliminarRun = async (runId: string, run: ChecklistRun) => {
    const doneCount = run.items.filter((i) => i.hecho).length;
    const msg = doneCount > 0 ? `Esta inspección tiene ${doneCount} ítem(s) marcado(s). ¿Eliminarla?` : "¿Eliminar esta inspección?";
    if (!window.confirm(msg)) return;
    const respuesta = await fetch(`/api/mantencion/inspecciones/${runId}`, { method: "DELETE" });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json();
      alert("Error: " + (cuerpo.error ?? "desconocido"));
    }
    cargar();
  };

  const onEliminarEquipo = async (equipo: EquipoMantenimiento) => {
    const runCount = (runsPorEquipo[equipo.id] ?? []).length;
    const msg = runCount > 0 ? `"${equipo.nombre}" tiene ${runCount} inspección(es). ¿Eliminar el equipo y todo su historial?` : `¿Eliminar "${equipo.nombre}"?`;
    if (!window.confirm(msg)) return;
    const respuesta = await fetch(`/api/mantencion/equipos/${equipo.id}`, { method: "DELETE" });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json();
      alert("Error: " + (cuerpo.error ?? "desconocido"));
    }
    cargar();
  };

  const onSetEstado = async (equipo: EquipoMantenimiento, estado: EstadoEquipo) => {
    setBundle((prev) => (prev ? { ...prev, equipos: prev.equipos.map((e) => (e.id === equipo.id ? { ...e, estado } : e)) } : prev));
    const respuesta = await fetch(`/api/mantencion/equipos/${equipo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: equipo.nombre, descripcion: equipo.descripcion, estado, secciones_activas: equipo.secciones_activas }),
    });
    if (!respuesta.ok) cargar();
  };

  const totalEquipos = bundle?.equipos.length ?? 0;

  if (error && !bundle) {
    return (
      <div className="rounded-2xl border border-borde bg-white p-8 text-center">
        <p className="text-sm font-medium text-red-600">{error}</p>
        <button onClick={cargar} className="mt-4 rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40 hover:text-naranjo">
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
          <h1 className="mt-2.5 text-[28px] font-medium uppercase leading-[1.1] tracking-tight text-tinta sm:text-[32px]">Mantención</h1>
          <p className="mt-2 max-w-lg text-sm font-light leading-relaxed text-tinta/55">
            Plantillas de checklist, equipos/herramientas e historial de inspecciones.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium leading-none tracking-tight text-tinta">
          {bundle ? `${bundle.plantillas.length} plantilla${bundle.plantillas.length === 1 ? "" : "s"} · ${totalEquipos} equipo${totalEquipos === 1 ? "" : "s"}` : "Cargando…"}
        </h2>
        {puedeOperar && (
          <button
            onClick={() => setEditandoPlantilla("nueva")}
            className="rounded-full bg-naranjo px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:-translate-y-px hover:bg-[#b14614] hover:shadow-[0_8px_20px_rgba(200,82,23,.35)]"
          >
            + Nueva plantilla
          </button>
        )}
      </div>

      {!bundle ? (
        <div className="rounded-2xl border border-borde bg-white p-8 text-center text-sm text-tinta/50">Cargando…</div>
      ) : bundle.plantillas.length === 0 ? (
        <div className="rounded-2xl border border-borde bg-white p-8 text-center">
          <p className="text-sm text-tinta/60">No hay plantillas de mantención.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {bundle.plantillas.map((plantilla) => (
            <TarjetaPlantilla
              key={plantilla.id}
              plantilla={plantilla}
              equipos={equiposPorPlantilla[plantilla.id] ?? []}
              runsByEquipo={runsPorEquipo}
              esAdmin={esAdmin}
              puedeOperar={puedeOperar}
              onEditarPlantilla={() => setEditandoPlantilla(plantilla)}
              onNuevoEquipo={() => setEditandoEquipo({ equipo: null, plantilla })}
              onEditarEquipo={(equipo) => setEditandoEquipo({ equipo, plantilla })}
              onEliminarEquipo={onEliminarEquipo}
              onNuevaInspeccion={(equipo) => onNuevaInspeccion(equipo, plantilla)}
              onSetEstado={onSetEstado}
              onCheckItem={onCheckItem}
              onUpdateItem={onUpdateItem}
              onCerrarRun={onCerrarRun}
              onReabrirRun={onReabrirRun}
              onEliminarRun={(runId) => {
                const run = bundle.runs.find((r) => r.id === runId);
                if (run) onEliminarRun(runId, run);
              }}
            />
          ))}
        </div>
      )}

      {editandoPlantilla && (
        <FormularioPlantillaModal
          plantilla={editandoPlantilla === "nueva" ? null : editandoPlantilla}
          onClose={() => setEditandoPlantilla(null)}
          onGuardado={() => {
            setEditandoPlantilla(null);
            cargar();
          }}
        />
      )}

      {editandoEquipo && (
        <FormularioEquipoModal
          equipo={editandoEquipo.equipo}
          plantilla={editandoEquipo.plantilla}
          onClose={() => setEditandoEquipo(null)}
          onGuardado={() => {
            setEditandoEquipo(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
