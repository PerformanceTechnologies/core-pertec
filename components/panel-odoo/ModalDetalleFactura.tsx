"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaFactura } from "@/lib/panel-odoo/datos";
import { traducir, TIPOS_FACTURA, ESTADOS_FACTURA, ESTADOS_PAGO_FACTURA } from "@/lib/panel-odoo/traducciones";

export default function ModalDetalleFactura({
  factura,
  onCerrar,
}: {
  factura: FilaFactura;
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
    ["Tipo", traducir(TIPOS_FACTURA, factura.move_type)],
    ["Contraparte", factura.partner_nombre ?? "-"],
    ["Estado", traducir(ESTADOS_FACTURA, factura.state)],
    ["Estado de pago", traducir(ESTADOS_PAGO_FACTURA, factura.payment_state)],
    ["Fecha", factura.fecha_factura ? fechaCl(factura.fecha_factura) : "-"],
    ["Vencimiento", factura.fecha_vencimiento ? fechaCl(factura.fecha_vencimiento) : "-"],
    ["Diario", factura.diario ?? "-"],
    ["Monto total", money(factura.monto_total)],
    ["Monto pendiente", money(factura.monto_pendiente)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-condensed text-lg font-bold uppercase text-tinta">
            {factura.numero ?? `Factura #${factura.odoo_id}`}
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
