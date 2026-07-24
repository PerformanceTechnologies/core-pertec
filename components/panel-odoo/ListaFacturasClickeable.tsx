"use client";

import { useState } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaFactura } from "@/lib/panel-odoo/datos";
import ModalDetalleFactura from "./ModalDetalleFactura";

export default function ListaFacturasClickeable({ facturas }: { facturas: FilaFactura[] }) {
  const [seleccionada, setSeleccionada] = useState<FilaFactura | null>(null);

  if (facturas.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin facturas registradas todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {facturas.map((f) => (
          <button
            key={f.odoo_id}
            type="button"
            onClick={() => setSeleccionada(f)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span className="min-w-0 flex-1 truncate text-tinta/70">
              {f.partner_nombre ?? f.numero ?? `#${f.odoo_id}`}
            </span>
            <span className="ml-3 shrink-0 text-tinta/45">
              {f.fecha_factura ? fechaCl(f.fecha_factura) : "-"}
            </span>
            <span className="ml-3 shrink-0 font-semibold text-tinta">{money(f.monto_total)}</span>
          </button>
        ))}
      </div>
      {seleccionada && <ModalDetalleFactura factura={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </>
  );
}
