"use client";

import { useState } from "react";
import type { Proyecto } from "@/lib/proyectos";
import { GASTO_CATEGORIAS, catTags, fmtCLP } from "@/lib/proyectos-utilidades";

interface FilaGasto {
  categoria: string;
  tag: string;
  label: string;
  monto: string;
}

export default function FormularioGastosModal({
  proyecto,
  onClose,
  onGuardado,
}: {
  proyecto: Proyecto;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [presupuesto, setPresupuesto] = useState(proyecto.presupuesto_inicial != null ? String(proyecto.presupuesto_inicial) : "");
  const [items, setItems] = useState<FilaGasto[]>(
    (proyecto.gastos ?? []).map((g) => ({
      categoria: g.categoria ?? "",
      tag: g.tag ?? "",
      label: g.label ?? "",
      monto: g.monto != null ? String(g.monto) : "",
    }))
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actualizarItem = (i: number, clave: keyof FilaGasto, valor: string) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, [clave]: valor } : it)));
  const quitarItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));
  const agregarItem = () => setItems((s) => [...s, { categoria: "", tag: "", label: "", monto: "" }]);

  const totalGastado = items.reduce((s, it) => s + (Number(it.monto) || 0), 0);
  const presupNum = Number(presupuesto) || 0;
  const disponible = presupNum - totalGastado;

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/proyectos/${proyecto.id}/gastos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presupuesto_inicial: presupNum, gastos: items }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar los gastos.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-borde px-6 py-4">
          <div>
            <span className="etiqueta-seccion">Configurar gastos</span>
            <h2 className="mt-1 font-condensed text-xl font-bold text-tinta">{proyecto.nombre}</h2>
          </div>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta" aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <label>
            <span className="block text-[10px] font-semibold uppercase tracking-[.1em] text-tinta/60">Presupuesto inicial (CLP)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={presupuesto}
              onChange={(e) => setPresupuesto(e.target.value)}
              placeholder="Ej: 2500000"
              className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
            />
          </label>

          <div className="flex gap-6 rounded-lg border border-borde bg-crema/60 px-3.5 py-2.5 text-xs">
            <span>
              Gastado <strong className="text-tinta">{fmtCLP(totalGastado)}</strong>
            </span>
            <span>
              Disponible <strong className={disponible < 0 ? "text-red-600" : "text-tinta"}>{fmtCLP(disponible)}</strong>
            </span>
          </div>

          <div>
            <span className="etiqueta-seccion">Partidas de gasto</span>
            <ul className="mt-3 flex flex-col gap-2">
              {items.map((it, i) => {
                const tags = catTags(it.categoria);
                const tagEsPreset = tags.length > 0;
                return (
                  <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-borde p-2">
                    <select
                      value={it.categoria}
                      onChange={(e) => {
                        actualizarItem(i, "categoria", e.target.value);
                        actualizarItem(i, "tag", "");
                      }}
                      className="rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
                    >
                      <option value="">Categoría…</option>
                      {GASTO_CATEGORIAS.map((g) => (
                        <option key={g.v} value={g.v}>
                          {g.l}
                        </option>
                      ))}
                    </select>
                    {tagEsPreset ? (
                      <select
                        value={it.tag}
                        onChange={(e) => actualizarItem(i, "tag", e.target.value)}
                        className="rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
                      >
                        <option value="">Tag…</option>
                        {tags.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={it.tag}
                        onChange={(e) => actualizarItem(i, "tag", e.target.value)}
                        placeholder="Tag (opcional)"
                        className="w-28 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
                      />
                    )}
                    <input
                      type="text"
                      value={it.label}
                      onChange={(e) => actualizarItem(i, "label", e.target.value)}
                      placeholder="Detalle opcional"
                      className="min-w-[120px] flex-1 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={it.monto}
                      onChange={(e) => actualizarItem(i, "monto", e.target.value)}
                      placeholder="0"
                      className="w-24 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
                    />
                    <button type="button" onClick={() => quitarItem(i)} className="text-tinta/40 hover:text-red-600">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={agregarItem}
              className="mt-3 rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-tinta/70 hover:border-naranjo/40 hover:text-naranjo"
            >
              + Agregar gasto
            </button>
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2 border-t border-borde pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40">
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
