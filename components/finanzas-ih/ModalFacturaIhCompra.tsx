"use client";

import { useEffect } from "react";
import { IconDownload } from "@tabler/icons-react";
import type { FinanzasIhDocumentoFila } from "@/lib/finanzas-ih/finanzas-ih";
import { nombreArchivoIh } from "@/lib/finanzas-ih/nombre-archivo";

const ETIQUETAS_TIPO_DOCUMENTO: Record<string, string> = {
  factura_afecta: "Factura",
  factura_exenta: "Factura exenta",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  guia_despacho: "Guía de despacho",
  boleta: "Boleta",
  boleta_honorarios: "Boleta de honorarios",
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

// Documentos recibidos (compra): solo hay PDF (generado por el sistema de
// cada proveedor, sin layout comun), asi que se muestra el archivo tal cual
// -- mismo motivo y mismo mecanismo que ModalFacturaCompra.tsx de Facturas
// Historicas: el webUrl de SharePoint no se puede embeber directo en un
// iframe (redirige a login.microsoftonline.com), asi que se sirve como
// proxy via /api/finanzas-ih/archivo.
export default function ModalFacturaIhCompra({
  documento,
  onCerrar,
}: {
  documento: FinanzasIhDocumentoFila;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const urlPreview = documento.pdf_sharepoint_item_id
    ? `/api/finanzas-ih/archivo?id=${encodeURIComponent(documento.pdf_sharepoint_item_id)}`
    : null;
  const urlDescargaXml = documento.xml_sharepoint_item_id
    ? `/api/finanzas-ih/archivo?id=${encodeURIComponent(documento.xml_sharepoint_item_id)}&tipo=xml&descarga=1&nombre=${encodeURIComponent(nombreArchivoIh(documento, "xml"))}`
    : null;
  const urlDescargaPdf = documento.pdf_sharepoint_item_id
    ? `/api/finanzas-ih/archivo?id=${encodeURIComponent(documento.pdf_sharepoint_item_id)}&tipo=pdf&descarga=1&nombre=${encodeURIComponent(nombreArchivoIh(documento, "pdf"))}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="flex h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-borde bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-borde p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-tinta/50">
              {ETIQUETAS_TIPO_DOCUMENTO[documento.tipo_documento] ?? documento.tipo_documento} N° {documento.folio}
            </p>
            <h2 className="font-condensed text-lg font-bold text-tinta">
              {documento.razon_social_contraparte ?? documento.rut_contraparte}
            </h2>
            <p className="mt-0.5 text-xs text-tinta/50">
              RUT {documento.rut_contraparte} · {formatearFecha(documento.fecha_emision)} ·{" "}
              {formatearMonto(documento.monto_total)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {urlDescargaXml && (
              <a
                href={urlDescargaXml}
                title="Descargar XML"
                className="inline-flex items-center gap-1 rounded-md border border-borde px-2 py-1 text-[11px] font-medium text-tinta/60 hover:border-naranjo/40 hover:text-naranjo"
              >
                <IconDownload size={13} stroke={2} /> XML
              </a>
            )}
            {urlDescargaPdf && (
              <a
                href={urlDescargaPdf}
                title="Descargar factura (PDF)"
                className="inline-flex items-center gap-1 rounded-md border border-borde px-2 py-1 text-[11px] font-medium text-tinta/60 hover:border-teal/40 hover:text-teal"
              >
                <IconDownload size={13} stroke={2} /> PDF
              </a>
            )}
            <button
              onClick={onCerrar}
              className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {urlPreview ? (
          <iframe src={urlPreview} className="flex-1 rounded-b-xl" title={`Documento folio ${documento.folio}`} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-tinta/50">
            Este documento todavía no tiene el PDF respaldado en SharePoint.
          </div>
        )}

        {(urlPreview || documento.pdf_sharepoint_web_url) && (
          <div className="flex items-center justify-end gap-4 border-t border-borde p-3">
            {urlPreview && (
              <a
                href={urlPreview}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-naranjo hover:underline"
              >
                Abrir en pestaña nueva
              </a>
            )}
            {documento.pdf_sharepoint_web_url && (
              <a
                href={documento.pdf_sharepoint_web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-naranjo hover:underline"
              >
                Abrir en SharePoint
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
