"use client";

import { useMemo, useState } from "react";
import type { ChecklistPlantilla, EquipoMantenimiento, EstadoEquipo } from "@/lib/mantencion";
import { ESTADOS_EQUIPO, ESTADO_EQUIPO_COLOR, ESTADO_EQUIPO_LABEL } from "@/lib/mantencion-utilidades";

export default function FormularioEquipoModal({
  equipo,
  plantilla,
  onClose,
  onGuardado,
}: {
  equipo: EquipoMantenimiento | null;
  plantilla: ChecklistPlantilla;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esNuevo = !equipo;
  const noun = plantilla.titulo.toLowerCase().includes("vulcan") ? "equipo" : "herramienta";
  const [nombre, setNombre] = useState(equipo?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(equipo?.descripcion ?? "");
  const [estado, setEstado] = useState<EstadoEquipo>(equipo?.estado ?? "operativo");
  const [seccionesActivas, setSeccionesActivas] = useState<string[]>(equipo?.secciones_activas ?? []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const obligatorias = useMemo(() => new Set(plantilla.secciones_obligatorias ?? []), [plantilla.secciones_obligatorias]);
  const todasSecciones = useMemo(() => Array.from(new Set((plantilla.items ?? []).map((i) => i.seccion || "General"))), [plantilla.items]);
  const opcionales = todasSecciones.filter((s) => !obligatorias.has(s));

  const toggleSeccion = (s: string) =>
    setSeccionesActivas((actual) => (actual.includes(s) ? actual.filter((x) => x !== s) : [...actual, s]));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const url = esNuevo ? "/api/mantencion/equipos" : `/api/mantencion/equipos/${equipo!.id}`;
      const respuesta = await fetch(url, {
        method: esNuevo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_id: plantilla.id,
          nombre,
          descripcion: descripcion || null,
          estado,
          secciones_activas: seccionesActivas,
        }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-borde px-6 py-4">
          <h2 className="font-condensed text-xl font-bold text-tinta">{esNuevo ? `Nuevo ${noun}` : `Editar ${noun}`}</h2>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta" aria-label="Cerrar">
            ×
          </button>
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-4 px-6 py-5">
          <label>
            <span className="block text-xs font-medium text-tinta/70">Nombre</span>
            <input
              required
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={noun === "equipo" ? 'Vulcanizador #001 — 60"' : "Taladro Bosch GSB 16"}
              className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
            />
          </label>

          <label>
            <span className="block text-xs font-medium text-tinta/70">Descripción</span>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ubicación, modelo, observaciones…"
              className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
            />
          </label>

          <div>
            <span className="block text-xs font-medium text-tinta/70">Estado</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ESTADOS_EQUIPO.map((es) => {
                const color = ESTADO_EQUIPO_COLOR[es];
                const activo = estado === es;
                return (
                  <button
                    key={es}
                    type="button"
                    onClick={() => setEstado(es)}
                    className="rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] transition"
                    style={{
                      background: color.bg,
                      color: color.texto,
                      border: `1px solid ${color.borde}`,
                      boxShadow: activo ? `inset 0 0 0 2px ${color.texto}` : "none",
                    }}
                  >
                    {ESTADO_EQUIPO_LABEL[es]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-tinta/70">Secciones que aplican</span>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {Array.from(obligatorias).map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-tinta/70">
                  <input type="checkbox" checked disabled className="h-4 w-4" />
                  {s} <em className="text-xs text-tinta/40">obligatoria</em>
                </label>
              ))}
              {opcionales.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-tinta/70">
                  <input type="checkbox" checked={seccionesActivas.includes(s)} onChange={() => toggleSeccion(s)} className="h-4 w-4 accent-naranjo" />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2 border-t border-borde pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave disabled:opacity-50">
              {guardando ? "Guardando…" : esNuevo ? `Registrar ${noun}` : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
