"use client";

import { useEffect } from "react";
import type { FilaTarea } from "@/lib/panel-odoo/datos";

const ETIQUETAS_ESTADO: Record<string, string> = {
  "01_in_progress": "En progreso",
  "02_changes_requested": "Cambios solicitados",
  "03_approved": "Aprobada",
  "1_done": "Hecha",
  "1_canceled": "Cancelada",
  "04_waiting_normal": "En espera",
};

export default function ModalDetalleTarea({ tarea, onCerrar }: { tarea: FilaTarea; onCerrar: () => void }) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const filas: [string, string][] = [
    ["Proyecto", tarea.proyecto_nombre ?? "-"],
    ["Etapa", tarea.etapa ?? "-"],
    ["Estado", ETIQUETAS_ESTADO[tarea.estado] ?? tarea.estado],
    ["Asignados", tarea.asignados ?? "-"],
    ["Fecha límite", tarea.fecha_limite ? new Date(tarea.fecha_limite).toLocaleDateString("es-CL") : "-"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-condensed text-lg font-bold uppercase text-tinta">{tarea.nombre}</h2>
          <button
            onClick={onCerrar}
            className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 divide-y divide-borde text-sm">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex items-center justify-between py-2">
              <dt className="text-tinta/55">{etiqueta}</dt>
              <dd className="font-medium text-tinta">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
