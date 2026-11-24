"use client";

import { useEffect } from "react";
import { IconDownload } from "@tabler/icons-react";
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

/**
 * La factura de venta en el visor de PDF, igual que las de compra. El PDF se arma con los datos del
 * índice (ver app/api/finanzas/facturas-venta/pdf) y el XML original queda para descargar.
 */
export default function ModalFacturaVenta({ factura, onCerrar }: { factura: FacturaVentaFila; onCerrar: () => void }) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const urlPdf = `/api/finanzas/facturas-venta/pdf?id=${encodeURIComponent(factura.id)}`;
  // El mismo proxy de archivos del sitio de Finanzas que usan las compras, para bajar el XML.
  const urlXml = `/api/finanzas/facturas-compra/archivo?id=${encodeURIComponent(factura.drive_item_id)}&descargar=1&nombre=${encodeURIComponent(factura.nombre_archivo)}`;
  const tipo = factura.tipo_dte ? (ETIQUETAS_DTE[factura.tipo_dte] ?? `Documento tipo ${factura.tipo_dte}`) : "Documento";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-borde bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-borde p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-tinta/50">
              {tipo} {factura.folio ? `N° ${factura.folio}` : ""}
            </p>
            <h2 className="font-condensed text-lg font-bold text-tinta">{factura.razon_social_receptor ?? factura.nombre_archivo}</h2>
            <p className="mt-0.5 text-xs text-tinta/50">
              {factura.rut_receptor ? `RUT ${factura.rut_receptor} · ` : ""}
              {formatearFecha(factura.fecha_emision)} · {formatearMonto(factura.monto_total)}
            </p>
          </div>
          <button onClick={onCerrar} className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <iframe src={urlPdf} className="flex-1" title={factura.nombre_archivo} />

        <div className="flex items-center justify-end gap-4 border-t border-borde p-3">
          <a href={urlXml} className="inline-flex items-center gap-1 text-xs font-medium text-naranjo hover:underline">
            <IconDownload size={14} /> Descargar XML
          </a>
          {factura.web_url && (
            <a href={factura.web_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-naranjo hover:underline">
              Abrir en SharePoint
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
