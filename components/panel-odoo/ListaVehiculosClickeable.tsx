"use client";

import { useState } from "react";
import type { FilaVehiculo } from "@/lib/panel-odoo/datos";
import ModalDetalleVehiculo from "./ModalDetalleVehiculo";
import { traducir, CATEGORIAS_FLOTA } from "@/lib/panel-odoo/traducciones";

export default function ListaVehiculosClickeable({ vehiculos }: { vehiculos: FilaVehiculo[] }) {
  const [seleccionado, setSeleccionado] = useState<FilaVehiculo | null>(null);

  if (vehiculos.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin vehículos registrados todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 w-full overflow-x-auto">
        <table className="w-full table-fixed text-left text-[10px]">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[32%]" />
            <col className="w-[20%]" />
            <col className="w-[28%]" />
          </colgroup>
          <thead className="text-tinta/45">
            <tr>
              <th className="py-1 pr-1 font-medium">Tipo</th>
              <th className="py-1 pr-1 font-medium">Vehículo</th>
              <th className="py-1 pr-1 font-medium">Patente</th>
              <th className="py-1 font-medium">Asignado a</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {vehiculos.map((v) => {
              // "modelo" ya viene de Odoo como "Marca/Modelo" (ej. "Hino/XZU
              // 617 DC") -- concatenar marca de nuevo lo duplicaba.
              const vehiculo = v.modelo ?? v.nombre;
              return (
                <tr
                  key={v.odoo_id}
                  onClick={() => setSeleccionado(v)}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter" || evento.key === " ") {
                      evento.preventDefault();
                      setSeleccionado(v);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="cursor-pointer transition hover:bg-crema/60"
                >
                  <td className="truncate py-1 pr-1 text-tinta/70" title={traducir(CATEGORIAS_FLOTA, v.categoria)}>
                    {traducir(CATEGORIAS_FLOTA, v.categoria)}
                  </td>
                  <td className="truncate py-1 pr-1 text-tinta" title={vehiculo}>
                    {vehiculo}
                  </td>
                  <td className="truncate py-1 pr-1 text-tinta/70" title={v.patente ?? undefined}>
                    {v.patente ?? "-"}
                  </td>
                  <td className="truncate py-1 text-tinta/70" title={v.conductor ?? undefined}>
                    {v.conductor ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {seleccionado && <ModalDetalleVehiculo vehiculo={seleccionado} onCerrar={() => setSeleccionado(null)} />}
    </>
  );
}
