"use client";

import { useEffect, useRef, useState } from "react";
import type { FacturaSiiFila } from "@/lib/finanzas";

function formatearMonto(valor: number): string {
  return valor.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

export default function TarjetaHoy({ facturasHoy }: { facturasHoy: FacturaSiiFila[] }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alHacerClicFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener("mousedown", alHacerClicFuera);
    return () => window.removeEventListener("mousedown", alHacerClicFuera);
  }, [abierto]);

  const total = facturasHoy.reduce((acc, f) => acc + (f.monto_total ?? 0), 0);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full rounded-xl border border-borde bg-white p-4 text-left transition hover:border-naranjo/40"
      >
        <div className="text-xs uppercase text-tinta/50">Facturas de hoy</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-condensed text-xl font-bold text-tinta">{facturasHoy.length}</span>
          <span className="text-xs text-tinta/50">{formatearMonto(total)}</span>
        </div>
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-20 mt-2 w-80 rounded-xl border border-borde bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold uppercase text-tinta/50">
            Resumen de hoy ({facturasHoy.length})
          </p>
          {facturasHoy.length === 0 ? (
            <p className="py-2 text-center text-sm text-tinta/50">Sin facturas registradas hoy.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-borde overflow-y-auto">
              {facturasHoy.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="truncate pr-2">
                    <span
                      className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase ${
                        f.tipo_documento === "compra" ? "bg-naranjo/10 text-naranjo" : "bg-teal/10 text-teal"
                      }`}
                    >
                      {f.tipo_documento === "compra" ? "C" : "V"}
                    </span>
                    {f.razon_social ?? f.rut_contraparte}
                  </span>
                  <span className="shrink-0 font-medium text-tinta">{formatearMonto(f.monto_total ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
