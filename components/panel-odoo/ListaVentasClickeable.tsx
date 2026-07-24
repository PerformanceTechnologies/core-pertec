"use client";

import { useState } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaVenta } from "@/lib/panel-odoo/datos";
import ModalDetalleVenta from "./ModalDetalleVenta";

export default function ListaVentasClickeable({ ventas }: { ventas: FilaVenta[] }) {
  const [seleccionada, setSeleccionada] = useState<FilaVenta | null>(null);

  if (ventas.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin ventas registradas todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {ventas.map((v) => (
          <button
            key={v.odoo_id}
            type="button"
            onClick={() => setSeleccionada(v)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span className="min-w-0 flex-1 truncate text-tinta/70">
              {v.partner_nombre ?? v.numero ?? `#${v.odoo_id}`}
              {v.es_arriendo && <span className="ml-1 text-naranjo">(arriendo)</span>}
            </span>
            <span className="ml-3 shrink-0 text-tinta/45">{v.fecha_orden ? fechaCl(v.fecha_orden) : "-"}</span>
            <span className="ml-3 shrink-0 font-semibold text-tinta">{money(v.monto_total)}</span>
          </button>
        ))}
      </div>
      {seleccionada && <ModalDetalleVenta venta={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </>
  );
}
