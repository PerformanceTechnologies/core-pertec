"use client";

import { useState } from "react";
import type { FilaVehiculo } from "@/lib/panel-odoo/datos";
import ModalDetalleVehiculo from "./ModalDetalleVehiculo";

export default function ListaVehiculosClickeable({ vehiculos }: { vehiculos: FilaVehiculo[] }) {
  const [seleccionado, setSeleccionado] = useState<FilaVehiculo | null>(null);

  if (vehiculos.length === 0) {
    return <p className="mt-3 text-xs text-tinta/40">Sin vehículos registrados todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 divide-y divide-borde">
        {vehiculos.map((v) => (
          <button
            key={v.odoo_id}
            type="button"
            onClick={() => setSeleccionado(v)}
            className="flex w-full items-center justify-between py-2 text-left text-xs transition hover:bg-crema/60"
          >
            <span className="min-w-0 flex-1 truncate text-tinta/70">{v.nombre}</span>
            <span className="ml-3 shrink-0 text-tinta/45">{v.patente ?? "-"}</span>
            <span className="ml-3 shrink-0 font-semibold text-tinta">{v.estado ?? "-"}</span>
          </button>
        ))}
      </div>
      {seleccionado && <ModalDetalleVehiculo vehiculo={seleccionado} onCerrar={() => setSeleccionado(null)} />}
    </>
  );
}
