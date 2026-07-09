"use client";

import { useMemo, useState } from "react";
import type { ChecklistRun, ChecklistRunItem, FotoEvidencia } from "@/lib/mantencion";
import { medicionCompleta, requiereMedicionTemp } from "@/lib/mantencion-utilidades";
import ItemEvidencia from "./ItemEvidencia";

export default function FilaInspeccion({
  run,
  esAdmin,
  puedeOperar,
  onCheck,
  onUpdateItem,
  onCerrar,
  onReabrir,
  onEliminar,
}: {
  run: ChecklistRun;
  esAdmin: boolean;
  puedeOperar: boolean;
  onCheck: (itemId: string, hecho: boolean) => void;
  onUpdateItem: (itemId: string, patch: { notas?: string | null; fotos?: FotoEvidencia[]; medicion?: Record<string, string> | null }) => void;
  onCerrar: () => void;
  onReabrir: () => void;
  onEliminar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const items = run.items ?? [];
  const total = items.length;
  const hechos = items.filter((i) => i.hecho).length;
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  const cerrada = !!run.cerrado_en;
  const editable = puedeOperar && (!cerrada || esAdmin);

  const itemResuelto = (it: ChecklistRunItem) => {
    if (it.notas && it.notas.trim()) return true;
    if (requiereMedicionTemp(it.titulo)) return it.hecho && medicionCompleta(it.medicion);
    return it.hecho;
  };
  const pendientes = items.filter((it) => !itemResuelto(it));

  const secciones = useMemo(() => {
    const mapa = new Map<string, ChecklistRunItem[]>();
    items.forEach((it) => {
      const k = it.seccion || "General";
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(it);
    });
    return Array.from(mapa.entries());
  }, [items]);

  const fecha = new Date(run.iniciado_en).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <li
      className={`transition ${
        abierto
          ? "border border-naranjo bg-white shadow-[0_4px_14px_rgba(200,82,23,.05)]"
          : `border border-borde bg-crema/60 hover:border-tinta/15 ${cerrada ? "opacity-85" : ""}`
      }`}
    >
      <button type="button" onClick={() => setAbierto((s) => !s)} className="flex w-full items-center gap-3 px-3.5 py-2 text-left">
        <span className="inline-flex w-3.5 justify-center text-tinta/40">{abierto ? "▾" : "▸"}</span>
        <span style={{ color: cerrada ? "#00a080" : "#C85217" }}>{cerrada ? "✓" : "▤"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold tracking-tight text-tinta">Inspección · {fecha}</p>
          <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[.1em] text-tinta/45">
            {cerrada ? "Cerrada" : "En curso"}
            {run.creado_por_nombre && <> · por {run.creado_por_nombre}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 w-14 overflow-hidden rounded-full bg-crema">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #C85217, #00a080)" }} />
          </div>
          <span className="text-xs text-tinta/50">
            {hechos}/{total}
          </span>
        </div>
      </button>

      {abierto && (
        <div className="flex flex-col gap-3 border-t border-borde py-2.5 pl-10 pr-3.5">
          {secciones.map(([seccion, itemsSeccion]) => (
            <div key={seccion}>
              <p className="mb-2 border-b border-borde pb-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-naranjo">{seccion}</p>
              <ul className="flex flex-col">
                {itemsSeccion.map((it) => (
                  <ItemEvidencia
                    key={it.id}
                    item={it}
                    editable={editable}
                    onCheck={(hecho) => onCheck(it.id, hecho)}
                    onUpdate={(patch) => onUpdateItem(it.id, patch)}
                  />
                ))}
              </ul>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-borde pt-3">
            {puedeOperar && !cerrada && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={onCerrar}
                  disabled={pendientes.length > 0}
                  className="rounded-full bg-naranjo px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:bg-[#b14614] disabled:opacity-40 disabled:shadow-none"
                >
                  Cerrar inspección
                </button>
                {pendientes.length > 0 && (
                  <span className="text-[11px] text-tinta/45">
                    Faltan {pendientes.length} ítem{pendientes.length === 1 ? "" : "s"} por marcar o justificar con una nota.
                  </span>
                )}
              </div>
            )}
            {cerrada && editable && <span className="text-[11px] text-tinta/45">Inspección cerrada — editable por admin.</span>}
            {esAdmin && cerrada && (
              <button type="button" onClick={onReabrir} className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-tinta/70 hover:border-naranjo/40">
                Reabrir
              </button>
            )}
            <div className="flex-1" />
            {puedeOperar && (
              <button type="button" onClick={onEliminar} className="text-xs font-medium text-red-600 hover:underline">
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
