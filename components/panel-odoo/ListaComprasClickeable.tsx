"use client";

import { useState } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaCompra } from "@/lib/panel-odoo/datos";
import ModalDetalleCompra from "./ModalDetalleCompra";

export default function ListaComprasClickeable({ compras }: { compras: FilaCompra[] }) {
  const [seleccionada, setSeleccionada] = useState<FilaCompra | null>(null);

  if (compras.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin compras registradas todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {compras.map((c) => (
          <button
            key={c.odoo_id}
            type="button"
            onClick={() => setSeleccionada(c)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span className="min-w-0 flex-1 truncate text-tinta/70">{c.partner_nombre ?? c.numero ?? `#${c.odoo_id}`}</span>
            <span className="ml-3 shrink-0 text-tinta/45">{c.fecha_orden ? fechaCl(c.fecha_orden) : "-"}</span>
            <span className="ml-3 shrink-0 font-semibold text-tinta">{money(c.monto_total)}</span>
          </button>
        ))}
      </div>
      {seleccionada && <ModalDetalleCompra compra={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </>
  );
}
