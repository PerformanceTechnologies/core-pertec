"use client";

import { useState } from "react";
import type { ChecklistPlantilla, ChecklistRun, EquipoMantenimiento, EstadoEquipo, FotoEvidencia } from "@/lib/mantencion";
import FichaEquipo from "./FichaEquipo";

export default function TarjetaPlantilla({
  plantilla,
  equipos,
  runsByEquipo,
  esAdmin,
  puedeOperar,
  onEditarPlantilla,
  onNuevoEquipo,
  onEditarEquipo,
  onEliminarEquipo,
  onNuevaInspeccion,
  onSetEstado,
  onCheckItem,
  onUpdateItem,
  onCerrarRun,
  onReabrirRun,
  onEliminarRun,
}: {
  plantilla: ChecklistPlantilla;
  equipos: EquipoMantenimiento[];
  runsByEquipo: Record<string, ChecklistRun[]>;
  esAdmin: boolean;
  puedeOperar: boolean;
  onEditarPlantilla: () => void;
  onNuevoEquipo: () => void;
  onEditarEquipo: (equipo: EquipoMantenimiento) => void;
  onEliminarEquipo: (equipo: EquipoMantenimiento) => void;
  onNuevaInspeccion: (equipo: EquipoMantenimiento) => void;
  onSetEstado: (equipo: EquipoMantenimiento, estado: EstadoEquipo) => void;
  onCheckItem: (runId: string, itemId: string, hecho: boolean) => void;
  onUpdateItem: (runId: string, itemId: string, patch: { notas?: string | null; fotos?: FotoEvidencia[]; medicion?: Record<string, string> | null }) => void;
  onCerrarRun: (runId: string) => void;
  onReabrirRun: (runId: string) => void;
  onEliminarRun: (runId: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const noun = plantilla.titulo.toLowerCase().includes("vulcan") ? "equipo" : "herramienta";
  const secciones = new Set((plantilla.items || []).map((i) => i.seccion || "General"));
  const q = busqueda.trim().toLowerCase();
  const equiposFiltrados = q
    ? equipos.filter((e) => e.nombre.toLowerCase().includes(q) || (e.descripcion ?? "").toLowerCase().includes(q))
    : equipos;

  return (
    <div className="border border-borde bg-white p-4">
      <div className="flex flex-wrap items-start gap-3 border-b border-borde pb-3.5">
        <button type="button" onClick={() => setAbierto((s) => !s)} className="mt-0.5 text-tinta/45">
          {abierto ? "▾" : "▸"}
        </button>
        <div className="min-w-0 flex-1">
          <span className="etiqueta-seccion">Plantilla</span>
          <h3 className="mt-1 text-[15px] font-semibold leading-tight tracking-tight text-tinta">{plantilla.titulo}</h3>
          {plantilla.descripcion && <p className="mt-0.5 text-xs font-light text-tinta/50">{plantilla.descripcion}</p>}
          <p className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[.08em] text-tinta/45">
            <span>{secciones.size} secciones</span>
            <span>·</span>
            <span>{plantilla.items?.length ?? 0} ítems</span>
            <span>·</span>
            <span>
              {equipos.length} {noun}
              {equipos.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        {puedeOperar && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onNuevoEquipo}
              className="rounded-full bg-naranjo px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:bg-[#b14614]"
            >
              + Registrar {noun}
            </button>
            <button type="button" onClick={onEditarPlantilla} className="rounded-lg p-1.5 text-tinta/40 hover:bg-crema hover:text-naranjo" title="Editar plantilla">
              ✎
            </button>
          </div>
        )}
      </div>

      {abierto && (
        <div className="mt-4 flex flex-col gap-2.5">
          {equipos.length > 0 && (
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar ${noun} por nombre o descripción…`}
              className="w-full rounded-lg border border-borde px-3 py-1.5 text-xs outline-none focus:border-naranjo/50"
            />
          )}

          {equipos.length === 0 ? (
            <p className="py-4 text-center text-xs text-tinta/40">Aún no hay {noun}s registrados.</p>
          ) : equiposFiltrados.length === 0 ? (
            <p className="py-4 text-center text-xs text-tinta/40">Sin resultados para &quot;{q}&quot;.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {equiposFiltrados.map((eq) => (
                <FichaEquipo
                  key={eq.id}
                  equipo={eq}
                  runs={runsByEquipo[eq.id] ?? []}
                  esAdmin={esAdmin}
                  puedeOperar={puedeOperar}
                  onNuevaInspeccion={() => onNuevaInspeccion(eq)}
                  onEditar={() => onEditarEquipo(eq)}
                  onEliminar={() => onEliminarEquipo(eq)}
                  onSetEstado={(estado) => onSetEstado(eq, estado)}
                  onCheckItem={onCheckItem}
                  onUpdateItem={onUpdateItem}
                  onCerrarRun={onCerrarRun}
                  onReabrirRun={onReabrirRun}
                  onEliminarRun={onEliminarRun}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
