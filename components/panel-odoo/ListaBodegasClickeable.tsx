"use client";

import { useState } from "react";
import { money } from "@/lib/cotizador/formato";
import type { FilaBodega, FilaStockBodega } from "@/lib/panel-odoo/datos";
import ModalDetalleBodega from "./ModalDetalleBodega";

/**
 * Las bodegas, y al tocar una, lo que hay adentro.
 *
 * El stock de todas llega ya cargado desde el servidor —son pocas bodegas— así que
 * abrir una no dispara ninguna consulta: el detalle aparece en el acto, igual que
 * en el resto del panel, donde el modal muestra datos que ya viajaron.
 */
export default function ListaBodegasClickeable({
  bodegas,
  stockPorBodega,
  tope,
}: {
  bodegas: FilaBodega[];
  stockPorBodega: Record<number, FilaStockBodega[]>;
  tope: number;
}) {
  const [seleccionada, setSeleccionada] = useState<FilaBodega | null>(null);
  // Sin costos cargados en Odoo, la columna de plata es una fila de "$0": se muestran
  // las unidades, que es lo que de verdad diferencia una bodega de otra.
  const hayValor = bodegas.some((b) => b.valor_inventario > 0);
  const cantidad = (valor: number) => valor.toLocaleString("es-CL", { maximumFractionDigits: 0 });

  if (bodegas.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin bodegas registradas todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {bodegas.map((b) => (
          <button
            key={b.odoo_id}
            type="button"
            onClick={() => setSeleccionada(b)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span title={b.nombre} className="min-w-0 flex-1 truncate text-tinta/70">
              {b.nombre}
            </span>
            {/* Las atrasadas van acá y no solo en el modal: es lo único de una
                bodega que pide atención, y pedirla desde adentro de un modal que
                nadie abrió no sirve. */}
            {b.transferencias_atrasadas > 0 && (
              <span
                title={`${b.transferencias_atrasadas} transferencias con fecha vencida`}
                className="ml-3 shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
              >
                {b.transferencias_atrasadas} vencidas
              </span>
            )}
            <span className="ml-3 shrink-0 text-tinta/45">{b.productos_distintos} prod.</span>
            <span className="ml-3 shrink-0 font-semibold text-tinta">
              {hayValor ? money(b.valor_inventario) : `${cantidad(b.unidades)} u.`}
            </span>
          </button>
        ))}
      </div>
      {seleccionada && (
        <ModalDetalleBodega
          bodega={seleccionada}
          stock={stockPorBodega[seleccionada.odoo_id] ?? []}
          tope={tope}
          onCerrar={() => setSeleccionada(null)}
        />
      )}
    </>
  );
}
