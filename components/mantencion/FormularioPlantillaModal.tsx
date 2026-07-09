"use client";

import { useState } from "react";
import type { ChecklistPlantilla } from "@/lib/mantencion";

interface FilaItem {
  id?: string;
  titulo: string;
  descripcion: string;
  seccion: string;
}

export default function FormularioPlantillaModal({
  plantilla,
  onClose,
  onGuardado,
}: {
  plantilla: ChecklistPlantilla | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esNueva = !plantilla;
  const [titulo, setTitulo] = useState(plantilla?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? "");
  const [items, setItems] = useState<FilaItem[]>(
    (plantilla?.items ?? []).map((it) => ({ id: it.id, titulo: it.titulo, descripcion: it.descripcion ?? "", seccion: it.seccion ?? "General" }))
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregarItem = () => setItems((s) => [...s, { titulo: "", descripcion: "", seccion: s[s.length - 1]?.seccion ?? "General" }]);
  const actualizarItem = (i: number, clave: keyof FilaItem, valor: string) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, [clave]: valor } : it)));
  const quitarItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      let id = plantilla?.id;
      if (esNueva) {
        const respuesta = await fetch("/api/mantencion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo, descripcion: descripcion || null }),
        });
        const cuerpo = await respuesta.json();
        if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
        id = cuerpo.id;
      }

      const respuesta = await fetch(`/api/mantencion/plantillas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          descripcion: descripcion || null,
          items,
          itemsExistentesIds: (plantilla?.items ?? []).map((it) => it.id),
        }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error desconocido");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar la plantilla.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-borde px-6 py-4">
          <h2 className="font-condensed text-xl font-bold text-tinta">{esNueva ? "Nueva plantilla" : "Editar plantilla"}</h2>
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
              placeholder="Mantención prensa vulcanizadora"
              className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
            />
          </label>

          <label>
            <span className="block text-xs font-medium text-tinta/70">Descripción</span>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle opcional…"
              className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
            />
          </label>

          <div>
            <span className="etiqueta-seccion">Ítems</span>
            <ul className="mt-3 flex flex-col gap-2">
              {items.map((it, i) => (
                <li key={i} className="rounded-lg border border-borde p-2.5">
                  <div className="flex gap-2">
                    <span className="mt-2 w-6 shrink-0 text-xs text-tinta/40">{String(i + 1).padStart(2, "0")}</span>
                    <input
                      value={it.seccion}
                      onChange={(e) => actualizarItem(i, "seccion", e.target.value)}
                      placeholder="Sección"
                      className="w-32 shrink-0 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
                    />
                    <input
                      value={it.titulo}
                      onChange={(e) => actualizarItem(i, "titulo", e.target.value)}
                      placeholder="Ítem (ej: Inspección visual)"
                      className="flex-1 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
                    />
                    <button type="button" onClick={() => quitarItem(i)} className="text-tinta/40 hover:text-red-600">
                      ×
                    </button>
                  </div>
                  <textarea
                    rows={1}
                    value={it.descripcion}
                    onChange={(e) => actualizarItem(i, "descripcion", e.target.value)}
                    placeholder="Descripción / guía (opcional)"
                    className="mt-1.5 ml-8 w-[calc(100%-2rem)] rounded-md border border-borde px-2 py-1 text-xs outline-none focus:border-naranjo/50"
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={agregarItem}
              className="mt-3 rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-tinta/70 hover:border-naranjo/40 hover:text-naranjo"
            >
              + Agregar ítem
            </button>
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2 border-t border-borde pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave disabled:opacity-50">
              {guardando ? "Guardando…" : esNueva ? "Crear plantilla" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
