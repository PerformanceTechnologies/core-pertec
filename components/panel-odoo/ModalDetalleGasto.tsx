"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaGasto } from "@/lib/panel-odoo/datos";

const ETIQUETAS_ESTADO: Record<string, string> = {
  draft: "Borrador",
  reported: "Reportado",
  approved: "Aprobado",
  done: "Pagado",
  refused: "Rechazado",
};

export default function ModalDetalleGasto({
  gasto,
  onCerrar,
}: {
  gasto: FilaGasto;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const filas: [string, string][] = [
    ["Empleado", gasto.empleado ?? "-"],
    ["Estado", ETIQUETAS_ESTADO[gasto.estado] ?? gasto.estado],
    ["Forma de pago", gasto.forma_pago ?? "-"],
    ["Fecha", gasto.fecha ? fechaCl(gasto.fecha) : "-"],
    ["Monto", money(gasto.monto_total)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-condensed text-lg font-bold uppercase text-tinta">
            {gasto.descripcion ?? `Gasto #${gasto.odoo_id}`}
          </h2>
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
