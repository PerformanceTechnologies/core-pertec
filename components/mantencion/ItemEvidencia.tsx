"use client";

import { useEffect, useRef, useState } from "react";
import type { ChecklistRunItem, FotoEvidencia } from "@/lib/mantencion";
import { MED_FIELDS, requiereMedicionTemp } from "@/lib/mantencion-utilidades";

export default function ItemEvidencia({
  item,
  editable,
  onCheck,
  onUpdate,
}: {
  item: ChecklistRunItem;
  editable: boolean;
  onCheck: (hecho: boolean) => void;
  onUpdate: (patch: { notas?: string | null; fotos?: FotoEvidencia[]; medicion?: Record<string, string> | null }) => void;
}) {
  const fotos = item.fotos ?? [];
  const [abierto, setAbierto] = useState(false);
  const [notas, setNotas] = useState(item.notas ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tieneMedicion = requiereMedicionTemp(item.titulo);
  const medGuardada = item.medicion ?? {};
  const [med, setMed] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    MED_FIELDS.forEach((f) => (base[f.k] = medGuardada[f.k] ?? ""));
    return base;
  });

  useEffect(() => {
    setNotas(item.notas ?? "");
  }, [item.notas]);

  const guardarMedicion = () => {
    const next: Record<string, string> = {};
    MED_FIELDS.forEach((f) => {
      const v = (med[f.k] ?? "").trim();
      if (v) next[f.k] = v;
    });
    if (JSON.stringify(next) === JSON.stringify(medGuardada)) return;
    onUpdate({ medicion: Object.keys(next).length ? next : null });
  };

  const guardarNotas = () => {
    if (notas === (item.notas ?? "")) return;
    onUpdate({ notas: notas.trim() || null });
  };

  const subirFotos = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return;
    setSubiendo(true);
    setError("");
    try {
      const nuevas: FotoEvidencia[] = [];
      for (const archivo of Array.from(archivos)) {
        const formData = new FormData();
        formData.append("archivo", archivo);
        const respuesta = await fetch("/api/mantencion/fotos", { method: "POST", body: formData });
        const cuerpo = await respuesta.json();
        if (!respuesta.ok) throw new Error(cuerpo.error ?? "Error al subir");
        nuevas.push(cuerpo.foto);
      }
      onUpdate({ fotos: [...fotos, ...nuevas] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo foto");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitarFoto = (idx: number) => {
    if (!window.confirm("¿Quitar esta foto?")) return;
    onUpdate({ fotos: fotos.filter((_, i) => i !== idx) });
  };

  const medCompletaAhora = !tieneMedicion || MED_FIELDS.every((f) => (med[f.k] ?? "").toString().trim() !== "");
  const bloqueaCheck = tieneMedicion && !medCompletaAhora;
  const justificado = !item.hecho && !!(item.notas && item.notas.trim());

  return (
    <li className="border-b border-borde/60 py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center" title={bloqueaCheck ? "Completa los datos de temperatura para marcar" : undefined}>
          <input
            type="checkbox"
            checked={item.hecho}
            disabled={!editable || bloqueaCheck}
            onChange={(e) => onCheck(e.target.checked)}
            className="h-[18px] w-[18px] accent-naranjo disabled:opacity-40"
          />
        </label>
        <span className={`flex-1 text-sm ${item.hecho ? "text-tinta/45 line-through" : "text-tinta"}`}>{item.titulo}</span>
        {justificado && (
          <span className="rounded-full bg-crema px-2 py-0.5 text-[10px] font-semibold uppercase text-tinta/50" title="Justificado con nota — no aplica">
            N/A
          </span>
        )}
        <button
          type="button"
          onClick={() => setAbierto((s) => !s)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${fotos.length > 0 ? "bg-naranjo/10 text-naranjo" : "text-tinta/35"} hover:text-naranjo`}
        >
          📷 {fotos.length > 0 && fotos.length}
        </button>
      </div>

      {item.descripcion && <p className="mt-1 pl-8 text-xs font-light text-tinta/50">{item.descripcion}</p>}

      {tieneMedicion && (
        <div className="mt-2.5 rounded-lg bg-crema/60 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-tinta/50">Temperatura — levante / tiempos</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MED_FIELDS.map((f) => (
              <label key={f.k} className="flex flex-col gap-1">
                <span className="text-[10px] text-tinta/50">{f.l}</span>
                <div className="flex items-center gap-1 rounded-md border border-borde bg-white px-2 py-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={med[f.k]}
                    onChange={(e) => setMed((s) => ({ ...s, [f.k]: e.target.value }))}
                    onBlur={guardarMedicion}
                    disabled={!editable}
                    placeholder={editable ? f.ph : "—"}
                    className="w-full text-xs outline-none"
                  />
                  <em className="text-[10px] text-tinta/40">{f.u}</em>
                </div>
              </label>
            ))}
          </div>
          {bloqueaCheck && editable && <p className="mt-1.5 text-[11px] text-naranjo">Completa los 4 campos para poder marcar este ítem.</p>}
        </div>
      )}

      {(editable || (item.notas && item.notas.trim())) && (
        <label className="mt-2.5 block">
          <span className="text-[10px] uppercase tracking-wide text-tinta/45">Notas</span>
          <textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={guardarNotas}
            disabled={!editable}
            placeholder={editable ? "Observaciones, hallazgos…" : "Sin notas"}
            className="mt-1 w-full rounded-md border border-borde px-2 py-1.5 text-xs outline-none focus:border-naranjo/50"
          />
        </label>
      )}

      {abierto && (
        <div className="mt-2.5">
          <div className="flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-md border border-borde">
                <img src={f.url} alt={f.nombre} className="h-full w-full cursor-pointer object-cover" onClick={() => setLightbox(f.url)} />
                {editable && (
                  <button
                    type="button"
                    onClick={() => quitarFoto(i)}
                    className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] text-white opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-borde text-tinta/40 hover:border-naranjo/50 hover:text-naranjo">
                <input ref={inputRef} type="file" accept="image/*" multiple hidden disabled={subiendo} onChange={(e) => subirFotos(e.target.files)} />
                <span className="text-lg">{subiendo ? "…" : "+"}</span>
                <span className="text-[9px]">foto</span>
              </label>
            )}
          </div>
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Foto" className="max-h-[85vh] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </li>
  );
}
