"use client";

import { useEffect } from "react";
import type { FilaTarea } from "@/lib/panel-odoo/datos";
import { traducir, ESTADOS_TAREA } from "@/lib/panel-odoo/traducciones";
import { money } from "@/lib/cotizador/formato";

/** dd-mm-aaaa sin pasar por Date: un "2026-03-01" en UTC se corre un dia en Chile. */
function fecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

export default function ModalDetalleTarea({ tarea, onCerrar }: { tarea: FilaTarea; onCerrar: () => void }) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const hoy = new Date().toISOString().slice(0, 10);
  const vencida = !tarea.completado && Boolean(tarea.fecha_limite) && tarea.fecha_limite!.slice(0, 10) < hoy;

  // Duracion en dias, solo cuando estan las dos fechas. Es lo que aporta tener
  // objetivo_date_start, que antes ni se sincronizaba: con una sola fecha se
  // sabe cuando vence, no cuanto dura.
  const duracion =
    tarea.fecha_inicio && tarea.fecha_limite
      ? Math.round(
          (Date.parse(tarea.fecha_limite.slice(0, 10)) - Date.parse(tarea.fecha_inicio.slice(0, 10))) / 86_400_000,
        )
      : null;

  // Las filas vacias no se muestran: un modal con seis guiones se lee como si
  // el dato no existiera, cuando lo que pasa es que en Odoo no se cargo.
  const filas: [string, React.ReactNode][] = [
    ["Proyecto", tarea.proyecto_nombre],
    ["Etapa", tarea.etapa],
    ["Estado", traducir(ESTADOS_TAREA, tarea.estado)],
    ["Objetivo", tarea.completado ? "Cumplido" : "Pendiente"],
    ["Prioridad", tarea.prioridad === "1" ? "Prioritaria" : null],
    ["Asignados", tarea.asignados],
    ["Inicio", tarea.fecha_inicio ? fecha(tarea.fecha_inicio) : null],
    [
      "Fecha límite",
      tarea.fecha_limite ? (
        <span className={vencida ? "text-naranjo" : undefined}>
          {fecha(tarea.fecha_limite)}
          {vencida && " · vencida"}
        </span>
      ) : null,
    ],
    ["Duración", duracion !== null ? `${duracion} día${duracion === 1 ? "" : "s"}` : null],
    [
      "Gastos",
      tarea.gastos_cantidad > 0
        ? `${money(tarea.gastos_total)} · ${tarea.gastos_cantidad} registro${tarea.gastos_cantidad === 1 ? "" : "s"}`
        : null,
    ],
  ];
  const visibles = filas.filter(([, valor]) => valor !== null && valor !== undefined && valor !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 font-condensed text-lg font-bold uppercase text-tinta">
            {tarea.color_hex && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tarea.color_hex }} />
            )}
            <span className="min-w-0">{tarea.nombre}</span>
          </h2>
          <button
            onClick={onCerrar}
            className="shrink-0 rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 divide-y divide-borde text-sm">
          {visibles.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex items-center justify-between gap-3 py-2">
              <dt className="shrink-0 text-tinta/55">{etiqueta}</dt>
              <dd className="min-w-0 truncate text-right font-medium text-tinta">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
