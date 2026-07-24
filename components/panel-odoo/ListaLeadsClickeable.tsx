"use client";

import { useState } from "react";
import { money } from "@/lib/cotizador/formato";
import type { FilaLead } from "@/lib/panel-odoo/datos";
import ModalDetalleLead from "./ModalDetalleLead";

export default function ListaLeadsClickeable({ leads }: { leads: FilaLead[] }) {
  const [seleccionado, setSeleccionado] = useState<FilaLead | null>(null);

  if (leads.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin oportunidades registradas aún.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {leads.map((l) => (
          <button
            key={l.odoo_id}
            type="button"
            onClick={() => setSeleccionado(l)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span className="min-w-0 flex-1 truncate text-tinta/70">{l.nombre}</span>
            <span className="ml-3 shrink-0 text-tinta/45">{l.etapa ?? "-"}</span>
            <span className="ml-3 shrink-0 font-semibold text-tinta">{money(l.monto_esperado)}</span>
          </button>
        ))}
      </div>
      {seleccionado && <ModalDetalleLead lead={seleccionado} onCerrar={() => setSeleccionado(null)} />}
    </>
  );
}
