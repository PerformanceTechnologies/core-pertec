"use client";

import { useState } from "react";
import type { Proyecto } from "@/lib/proyectos";
import { COLOR_OPTS, colorDe } from "@/lib/proyectos-utilidades";

const inputClase =
  "mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50";

export default function FormularioProyectoModal({
  proyecto,
  onClose,
  onGuardado,
}: {
  proyecto: Proyecto | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esNuevo = !proyecto;
  const [nombre, setNombre] = useState(proyecto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion ?? "");
  const [color, setColor] = useState(proyecto?.color ?? "cobre");
  const [fechaInicio, setFechaInicio] = useState(proyecto?.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(proyecto?.fecha_fin ?? "");
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const respuesta = await fetch(esNuevo ? "/api/proyectos" : `/api/proyectos/${proyecto!.id}`, {
        method: esNuevo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          descripcion: descripcion || null,
          color,
          fecha_inicio: fechaInicio || null,
          fecha_fin: fechaFin || null,
        }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el proyecto.");
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!proyecto) return;
    if (!window.confirm(`¿Eliminar "${proyecto.nombre}" y TODOS sus objetivos? Esta acción no se puede deshacer.`)) return;
    setEliminando(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/proyectos/${proyecto.id}`, { method: "DELETE" });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos eliminar el proyecto.");
      setEliminando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-borde px-6 py-4">
          <h2 className="font-condensed text-xl font-bold text-tinta">{esNuevo ? "Nuevo proyecto" : "Editar proyecto"}</h2>
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
              placeholder="Mantención planta X"
              className={inputClase}
            />
          </label>

          <label>
            <span className="block text-xs font-medium text-tinta/70">Descripción</span>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle opcional"
              className={inputClase}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="block text-xs font-medium text-tinta/70">Inicio</span>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputClase} />
            </label>
            <label>
              <span className="block text-xs font-medium text-tinta/70">Fin</span>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={inputClase} />
            </label>
          </div>

          <div>
            <span className="block text-xs font-medium text-tinta/70">Color</span>
            <div className="mt-1.5 flex gap-2">
              {COLOR_OPTS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className="h-7 w-7 rounded-full border-2 transition"
                  style={{
                    background: colorDe(c).bg,
                    borderColor: color === c ? colorDe(c).bg : "transparent",
                    boxShadow: color === c ? "0 0 0 2px white, 0 0 0 3px " + colorDe(c).bg : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-2 flex items-center justify-between border-t border-borde pt-4">
            {!esNuevo ? (
              <button
                type="button"
                onClick={eliminar}
                disabled={eliminando}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {eliminando ? "Eliminando…" : "Eliminar proyecto"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave disabled:opacity-50"
              >
                {guardando ? "Guardando…" : esNuevo ? "Crear proyecto" : "Guardar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
