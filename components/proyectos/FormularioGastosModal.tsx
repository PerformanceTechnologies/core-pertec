"use client";

import { useRef, useState } from "react";
import type { ArchivoGasto, Proyecto } from "@/lib/proyectos";
import { GASTO_CATEGORIAS, catTags, fmtCLP } from "@/lib/proyectos-utilidades";

interface FilaGasto {
  categoria: string;
  tag: string;
  label: string;
  monto: string;
  archivos: ArchivoGasto[];
}

function FilaGastoRow({
  fila,
  onChange,
  onRemove,
}: {
  fila: FilaGasto;
  onChange: (patch: Partial<FilaGasto>) => void;
  onRemove: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = catTags(fila.categoria);
  const tagEsPreset = tags.length > 0;
  const archivos = fila.archivos;

  const subirArchivos = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    setSubiendo(true);
    setError("");
    try {
      const nuevos: ArchivoGasto[] = [];
      for (const archivo of Array.from(lista)) {
        const formData = new FormData();
        formData.append("archivo", archivo);
        const respuesta = await fetch("/api/proyectos/gastos/archivo", { method: "POST", body: formData });
        const cuerpo = await respuesta.json();
        if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error al subir");
        nuevos.push(cuerpo.archivo);
      }
      onChange({ archivos: [...archivos, ...nuevos] });
      setAbierto(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo archivo");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitarArchivo = (i: number) => {
    if (!window.confirm("¿Quitar este archivo de la partida?")) return;
    onChange({ archivos: archivos.filter((_, idx) => idx !== i) });
  };

  return (
    <li className="rounded-lg border border-borde p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={fila.categoria}
          onChange={(e) => onChange({ categoria: e.target.value, tag: "" })}
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
            value={fila.tag}
            onChange={(e) => onChange({ tag: e.target.value })}
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
            value={fila.tag}
            onChange={(e) => onChange({ tag: e.target.value })}
            placeholder="Tag (opcional)"
            className="w-28 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
          />
        )}
        <input
          type="text"
          value={fila.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Detalle opcional"
          className="min-w-[120px] flex-1 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
        />
        <input
          type="number"
          min="0"
          step="1"
          value={fila.monto}
          onChange={(e) => onChange({ monto: e.target.value })}
          placeholder="0"
          className="w-24 rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
        />
        <button
          type="button"
          onClick={() => setAbierto((s) => !s)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            archivos.length > 0 ? "bg-naranjo/10 text-naranjo" : "text-tinta/35"
          } hover:text-naranjo`}
          title="Documentos y fotos de respaldo"
        >
          📎 {archivos.length > 0 && archivos.length}
        </button>
        <button type="button" onClick={onRemove} className="text-tinta/40 hover:text-red-600">
          ×
        </button>
      </div>

      {abierto && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-borde pt-2">
          {archivos.map((a, i) => (
            <div key={i} className="group relative h-16 w-16 flex-none overflow-hidden rounded-md border border-borde">
              {a.tipo.startsWith("image/") ? (
                <img
                  src={a.url}
                  alt={a.nombre}
                  className="h-full w-full cursor-pointer object-cover"
                  onClick={() => setLightbox(a.url)}
                />
              ) : (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-crema/60 p-1 text-center text-tinta/60 hover:text-naranjo"
                >
                  <span className="text-lg">📄</span>
                  <span className="line-clamp-2 break-all text-[8px] leading-tight">{a.nombre}</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => quitarArchivo(i)}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] text-white opacity-0 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
          <label className="flex h-16 w-16 flex-none cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-borde text-tinta/40 hover:border-naranjo/50 hover:text-naranjo">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              hidden
              disabled={subiendo}
              onChange={(e) => subirArchivos(e.target.files)}
            />
            <span className="text-lg">{subiendo ? "…" : "+"}</span>
            <span className="text-[9px]">archivo</span>
          </label>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Adjunto" className="max-h-[85vh] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </li>
  );
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
      archivos: g.archivos ?? [],
    }))
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actualizarItem = (i: number, patch: Partial<FilaGasto>) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const quitarItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));
  const agregarItem = () => setItems((s) => [...s, { categoria: "", tag: "", label: "", monto: "", archivos: [] }]);

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
            <p className="mt-1 text-[11px] text-tinta/50">📎 para adjuntar boletas, facturas o fotos de respaldo a una partida.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {items.map((it, i) => (
                <FilaGastoRow
                  key={i}
                  fila={it}
                  onChange={(patch) => actualizarItem(i, patch)}
                  onRemove={() => quitarItem(i)}
                />
              ))}
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
