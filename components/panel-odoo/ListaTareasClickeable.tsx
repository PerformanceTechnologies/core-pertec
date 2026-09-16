"use client";

import { useState } from "react";
import type { FilaTarea } from "@/lib/panel-odoo/datos";
import ModalDetalleTarea from "./ModalDetalleTarea";

/** dd-mm sin año ni Date: la lista es de lo próximo, y el año no aporta ahí. */
function fechaCorta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}`;
}

export default function ListaTareasClickeable({ tareas }: { tareas: FilaTarea[] }) {
  const [seleccionada, setSeleccionada] = useState<FilaTarea | null>(null);
  const hoy = new Date().toISOString().slice(0, 10);

  if (tareas.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin tareas abiertas.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {tareas.map((t) => {
          const vencida = Boolean(t.fecha_limite) && t.fecha_limite!.slice(0, 10) < hoy;
          return (
            <button
              key={t.odoo_id}
              type="button"
              onClick={() => setSeleccionada(t)}
              className="flex w-full items-center justify-between gap-2 py-2 text-left text-xs transition hover:bg-crema/60"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {/* El color del objetivo en el panel de Odoo: es como el equipo
                    reconoce cada uno allá, y acá no se veía. */}
                {t.color_hex && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color_hex }} />
                )}
                <span title={t.nombre} className="truncate text-tinta/70">{t.nombre}</span>
              </span>
              <span title={t.proyecto_nombre ?? undefined} className="max-w-[32%] shrink-0 truncate text-tinta/45">
                {t.proyecto_nombre ?? "-"}
              </span>
              {/* El plazo es el dato que decide si algo hay que mirar hoy:
                  estaba solo dentro del modal, una tarea a la vez. */}
              <span
                className={`w-[42px] shrink-0 text-right tabular-nums ${vencida ? "font-semibold text-naranjo" : "text-tinta/40"}`}
                title={vencida ? "Vencida" : undefined}
              >
                {t.fecha_limite ? fechaCorta(t.fecha_limite) : "—"}
              </span>
            </button>
          );
        })}
      </div>
      {seleccionada && <ModalDetalleTarea tarea={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </>
  );
}
