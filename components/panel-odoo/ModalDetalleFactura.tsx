"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaFactura } from "@/lib/panel-odoo/datos";

const ETIQUETAS_TIPO: Record<string, string> = {
  out_invoice: "Factura de venta",
  out_refund: "Nota de crédito de venta",
  in_invoice: "Factura de compra",
  in_refund: "Nota de crédito de compra",
};

const ETIQUETAS_PAGO: Record<string, string> = {
  not_paid: "No pagada",
  in_payment: "En proceso de pago",
  paid: "Pagada",
  partial: "Pago parcial",
  reversed: "Reversada",
};

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
    ["Tipo", ETIQUETAS_TIPO[factura.move_type] ?? factura.move_type],
    ["Contraparte", factura.partner_nombre ?? "-"],
    ["Estado", factura.state === "posted" ? "Contabilizada" : factura.state === "draft" ? "Borrador" : factura.state],
    ["Estado de pago", factura.payment_state ? (ETIQUETAS_PAGO[factura.payment_state] ?? factura.payment_state) : "-"],
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
