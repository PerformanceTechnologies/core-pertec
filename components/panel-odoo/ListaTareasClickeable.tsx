"use client";

import { useState } from "react";
import type { FilaTarea } from "@/lib/panel-odoo/datos";
import ModalDetalleTarea from "./ModalDetalleTarea";

export default function ListaTareasClickeable({ tareas }: { tareas: FilaTarea[] }) {
  const [seleccionada, setSeleccionada] = useState<FilaTarea | null>(null);

  if (tareas.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin tareas abiertas.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {tareas.map((t) => (
          <button
            key={t.odoo_id}
            type="button"
            onClick={() => setSeleccionada(t)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span className="min-w-0 flex-1 truncate text-tinta/70">{t.nombre}</span>
            <span className="ml-3 shrink-0 truncate text-tinta/45">{t.proyecto_nombre ?? "-"}</span>
          </button>
        ))}
      </div>
      {seleccionada && <ModalDetalleTarea tarea={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </>
  );
}
