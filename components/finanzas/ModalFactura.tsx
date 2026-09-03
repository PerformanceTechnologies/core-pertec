"use client";

import { useEffect } from "react";
import type { FacturaSiiFila } from "@/lib/finanzas";

const ETIQUETAS_ESTADO: Record<string, string> = {
  registro: "Registro",
  aceptado: "Aceptada",
  pendiente: "Pendiente",
  no_incluir: "No incluir",
  // "o rechazada" a proposito: en el SII un rechazo del receptor es uno de los tres
  // reclamos (RCD, reclamo al contenido), no un estado aparte. Quien mira el panel busca
  // la palabra rechazada, asi que la etiqueta dice las dos.
  reclamado: "Reclamada/rechazada",
};

const ETIQUETAS_DTE: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura no Afecta o Exenta Electrónica",
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

function formatearFechaHora(valor: string | null): string {
  if (!valor) return "-";
  return new Date(valor).toLocaleString("es-CL");
}

export default function ModalFactura({
  factura,
  onCerrar,
}: {
  factura: FacturaSiiFila;
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
    ["Tipo", factura.tipo_documento === "compra" ? "Compra" : "Venta"],
    ["Documento", ETIQUETAS_DTE[factura.codigo_dte] ?? String(factura.codigo_dte)],
    ["RUT contraparte", factura.rut_contraparte],
    ["Razón social", factura.razon_social ?? "-"],
    ["Folio", String(factura.folio)],
    ["Estado", ETIQUETAS_ESTADO[factura.estado] ?? factura.estado],
    ["Fecha documento", formatearFecha(factura.fecha_docto)],
    ["Fecha recepción", formatearFechaHora(factura.fecha_recepcion)],
    // Solo en ventas, y solo si pasó: el acuse y el reclamo son actos del receptor. La
    // fila no se dibuja cuando no hay fecha, así que en una compra no aparece.
    ...(factura.fecha_acuse ? [["Acuse del cliente", formatearFecha(factura.fecha_acuse)] as [string, string]] : []),
    ...(factura.fecha_reclamo
      ? [["Reclamada por el cliente", formatearFecha(factura.fecha_reclamo)] as [string, string]]
      : []),
    ["Monto exento", formatearMonto(factura.monto_exento)],
    ["Monto neto", formatearMonto(factura.monto_neto)],
    ["Monto IVA recuperable", formatearMonto(factura.monto_iva_recuperable)],
    ["Monto IVA no recuperable", formatearMonto(factura.monto_iva_no_recuperable)],
    ["Monto total", formatearMonto(factura.monto_total)],
    ["Período SII", factura.periodo],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-condensed text-lg font-bold uppercase text-tinta">
            Folio {factura.folio}
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
