"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaVenta } from "@/lib/panel-odoo/datos";

const ETIQUETAS_ESTADO: Record<string, string> = {
  draft: "Cotización",
  sent: "Enviada",
  sale: "Confirmada",
  cancel: "Cancelada",
};

const ETIQUETAS_ARRIENDO: Record<string, string> = {
  draft: "Borrador",
  quotation: "Cotización",
  to_approve: "Por aprobar",
  confirmed: "Confirmado",
  reserved: "Reservado",
  preparation: "En preparación",
  delivered: "Entregado",
  returned: "Devuelto",
  available: "Disponible",
  repair: "En reparación",
  dispute: "En disputa",
  invoiced: "Facturado",
};

export default function ModalDetalleVenta({ venta, onCerrar }: { venta: FilaVenta; onCerrar: () => void }) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const filas: [string, string][] = [
    ["Tipo", venta.es_arriendo ? "Arriendo" : "Venta"],
    ["Cliente", venta.partner_nombre ?? "-"],
    ["Estado", ETIQUETAS_ESTADO[venta.estado] ?? venta.estado],
    ["Fecha", venta.fecha_orden ? fechaCl(venta.fecha_orden) : "-"],
    ["Monto total", money(venta.monto_total)],
  ];

  if (venta.es_arriendo) {
    filas.push(
      ["Estado arriendo", venta.estado_arriendo ? (ETIQUETAS_ARRIENDO[venta.estado_arriendo] ?? venta.estado_arriendo) : "-"],
      ["Fin de arriendo", venta.fecha_fin_arriendo ? fechaCl(venta.fecha_fin_arriendo) : "-"]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-condensed text-lg font-bold uppercase text-tinta">{venta.numero ?? `#${venta.odoo_id}`}</h2>
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
