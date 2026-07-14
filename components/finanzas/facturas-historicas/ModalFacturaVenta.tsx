"use client";

import { useEffect } from "react";
import type { FacturaVentaFila } from "@/lib/facturas-historicas";

const ETIQUETAS_DTE: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta Electrónica",
  39: "Boleta Electrónica",
  41: "Boleta Exenta Electrónica",
  56: "Nota de Débito Electrónica",
  61: "Nota de Crédito Electrónica",
  110: "Factura de Exportación Electrónica",
};

function formatearMonto(valor: number | null): string {
  if (valor === null) return "-";
  return valor.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function formatearFecha(valor: string | null): string {
  if (!valor) return "-";
  const [anio, mes, dia] = valor.split("-");
  return `${dia}-${mes}-${anio}`;
}

export default function ModalFacturaVenta({
  factura,
  onCerrar,
}: {
  factura: FacturaVentaFila;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const { emisor, receptor, detalle } = factura.datos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-borde bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-borde pb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-tinta/50">
              {factura.tipo_dte ? ETIQUETAS_DTE[factura.tipo_dte] ?? `Documento tipo ${factura.tipo_dte}` : "Documento"}
            </p>
            <h2 className="font-condensed text-2xl font-bold uppercase text-tinta">Folio {factura.folio ?? "-"}</h2>
            <p className="mt-1 text-xs text-tinta/50">{formatearFecha(factura.fecha_emision)}</p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-tinta/50">Emisor</p>
            <p className="mt-1 text-sm font-medium text-tinta">{emisor.razonSocial ?? "-"}</p>
            <p className="text-xs text-tinta/60">RUT {emisor.rut ?? "-"}</p>
            {emisor.giro && <p className="text-xs text-tinta/60">{emisor.giro}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-tinta/50">Receptor</p>
            <p className="mt-1 text-sm font-medium text-tinta">{receptor.razonSocial ?? "-"}</p>
            <p className="text-xs text-tinta/60">RUT {receptor.rut ?? "-"}</p>
            {receptor.direccion && <p className="text-xs text-tinta/60">{receptor.direccion}</p>}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-borde">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
              <tr>
                <th className="px-3 py-2">Ítem</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Precio unit.</th>
                <th className="px-3 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {detalle.map((item, i) => (
                <tr key={i} className="border-b border-borde last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium text-tinta">{item.nombre}</p>
                    {item.descripcion && <p className="text-xs text-tinta/50">{item.descripcion}</p>}
                  </td>
                  <td className="px-3 py-2 text-right text-tinta/70">{item.cantidad ?? "-"}</td>
                  <td className="px-3 py-2 text-right text-tinta/70">{formatearMonto(item.precioUnitario)}</td>
                  <td className="px-3 py-2 text-right text-tinta">{formatearMonto(item.monto)}</td>
                </tr>
              ))}
              {detalle.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-tinta/50">
                    Sin detalle de ítems.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <dl className="mt-4 ml-auto w-full max-w-xs divide-y divide-borde text-sm">
          <div className="flex items-center justify-between py-1.5">
            <dt className="text-tinta/55">Monto neto</dt>
            <dd className="font-medium text-tinta">{formatearMonto(factura.monto_neto)}</dd>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <dt className="text-tinta/55">Monto exento</dt>
            <dd className="font-medium text-tinta">{formatearMonto(factura.monto_exento)}</dd>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <dt className="text-tinta/55">IVA</dt>
            <dd className="font-medium text-tinta">{formatearMonto(factura.monto_iva)}</dd>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <dt className="text-tinta/70 font-semibold">Monto total</dt>
            <dd className="font-bold text-tinta">{formatearMonto(factura.monto_total)}</dd>
          </div>
        </dl>

        {factura.web_url && (
          <a
            href={factura.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-xs font-medium text-naranjo hover:underline"
          >
            Ver archivo original en SharePoint
          </a>
        )}
      </div>
    </div>
  );
}
