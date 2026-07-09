"use client";

import { useState } from "react";
import type { Objetivo } from "@/lib/proyectos";
import { COLOR_OPTS, colorDe, isoFecha } from "@/lib/proyectos-utilidades";

const inputClase =
  "mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50";

export default function FormularioObjetivoModal({
  objetivo,
  proyectoId,
  onClose,
  onGuardado,
  onEliminar,
}: {
  objetivo: Objetivo | null;
  proyectoId: string;
  onClose: () => void;
  onGuardado: () => void;
  onEliminar: (() => void) | null;
}) {
  const esNuevo = !objetivo;
  const hoy = isoFecha(new Date());
  const [titulo, setTitulo] = useState(objetivo?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(objetivo?.descripcion ?? "");
  const [fechaInicio, setFechaInicio] = useState(objetivo?.fecha_inicio ?? hoy);
  const [fechaFin, setFechaFin] = useState(objetivo?.fecha_fin ?? hoy);
  const [color, setColor] = useState(objetivo?.color ?? "cobre");
  const [hecho, setHecho] = useState(objetivo?.hecho ?? false);
  const [responsables, setResponsables] = useState<string[]>(objetivo?.responsables ?? []);
  const [borradorResp, setBorradorResp] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregarResponsable = () => {
    const v = borradorResp.trim();
    if (v && !responsables.includes(v)) setResponsables((r) => [...r, v]);
    setBorradorResp("");
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (fechaFin < fechaInicio) {
      setError("La fecha de fin no puede ser anterior al inicio.");
      return;
    }
    setGuardando(true);
    try {
      const url = esNuevo ? `/api/proyectos/${proyectoId}/objetivos` : `/api/objetivos/${objetivo!.id}`;
      const respuesta = await fetch(url, {
        method: esNuevo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          descripcion: descripcion || null,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          color,
          hecho,
          responsables,
          parent_id: objetivo?.parent_id ?? null,
        }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el objetivo.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-borde px-6 py-4">
          <h2 className="font-condensed text-xl font-bold text-tinta">{esNuevo ? "Nuevo objetivo" : objetivo!.titulo}</h2>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta" aria-label="Cerrar">
            ×
          </button>
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-4 px-6 py-5">
          <label>
            <span className="block text-xs font-medium text-tinta/70">Título</span>
            <input
              required
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Lanzar catálogo Q3"
              className={inputClase}
            />
          </label>

          <label>
            <span className="block text-xs font-medium text-tinta/70">Descripción</span>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle opcional…"
              className={inputClase}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="block text-xs font-medium text-tinta/70">Inicio</span>
              <input required type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputClase} />
            </label>
            <label>
              <span className="block text-xs font-medium text-tinta/70">Fin</span>
              <input required type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={inputClase} />
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

          <label>
            <span className="block text-xs font-medium text-tinta/70">Responsables</span>
            <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border border-borde p-2">
              {responsables.map((r, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-crema px-2.5 py-1 text-xs text-tinta/75">
                  {r}
                  <button
                    type="button"
                    onClick={() => setResponsables((rs) => rs.filter((_, j) => j !== i))}
                    aria-label={`Quitar ${r}`}
                    className="text-tinta/40 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={borradorResp}
                onChange={(e) => setBorradorResp(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    agregarResponsable();
                  } else if (e.key === "Backspace" && !borradorResp && responsables.length) {
                    setResponsables((rs) => rs.slice(0, -1));
                  }
                }}
                onBlur={agregarResponsable}
                placeholder={responsables.length ? "" : "Nombre y Enter…"}
                className="flex-1 min-w-[100px] border-none px-1 py-1 text-sm outline-none"
              />
            </div>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hecho} onChange={(e) => setHecho(e.target.checked)} className="h-4 w-4 accent-naranjo" />
            <span className="text-sm text-tinta/75">Marcar como completado</span>
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-2 flex items-center justify-between border-t border-borde pt-4">
            {onEliminar ? (
              <button type="button" onClick={onEliminar} className="text-sm font-medium text-red-600 hover:underline">
                Eliminar
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
                {guardando ? "Guardando…" : esNuevo ? "Crear objetivo" : "Guardar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
