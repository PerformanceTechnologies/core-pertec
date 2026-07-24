"use client";

import { useState } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaGasto } from "@/lib/panel-odoo/datos";
import ModalDetalleGasto from "./ModalDetalleGasto";

export default function ListaGastosClickeable({ gastos }: { gastos: FilaGasto[] }) {
  const [seleccionado, setSeleccionado] = useState<FilaGasto | null>(null);

  if (gastos.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin gastos registrados todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {gastos.map((g) => (
          <button
            key={g.odoo_id}
            type="button"
            onClick={() => setSeleccionado(g)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span className="min-w-0 flex-1 truncate text-tinta/70">{g.descripcion ?? g.empleado ?? `#${g.odoo_id}`}</span>
            <span className="ml-3 shrink-0 text-tinta/45">{g.fecha ? fechaCl(g.fecha) : "-"}</span>
            <span className="ml-3 shrink-0 font-semibold text-tinta">{money(g.monto_total)}</span>
          </button>
        ))}
      </div>
      {seleccionado && <ModalDetalleGasto gasto={seleccionado} onCerrar={() => setSeleccionado(null)} />}
    </>
  );
}
