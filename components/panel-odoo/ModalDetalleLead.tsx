"use client";

import { useEffect } from "react";
import { money, pct, fechaCl } from "@/lib/cotizador/formato";
import type { FilaLead } from "@/lib/panel-odoo/datos";

export default function ModalDetalleLead({
  lead,
  onCerrar,
}: {
  lead: FilaLead;
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
    ["Tipo", lead.tipo === "opportunity" ? "Oportunidad" : "Lead"],
    ["Cliente/contacto", lead.partner_nombre ?? "-"],
    ["Etapa", lead.etapa ?? "-"],
    ["Vendedor", lead.vendedor ?? "-"],
    ["Monto esperado", money(lead.monto_esperado)],
    ["Probabilidad", pct(lead.probabilidad / 100)],
    ["Cierre estimado", lead.fecha_cierre_estimada ? fechaCl(lead.fecha_cierre_estimada) : "-"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-condensed text-lg font-bold uppercase text-tinta">{lead.nombre}</h2>
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
