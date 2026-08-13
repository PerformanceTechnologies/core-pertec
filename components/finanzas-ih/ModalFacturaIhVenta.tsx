"use client";

import { useEffect, useState } from "react";
import type { FinanzasIhDocumentoFila } from "@/lib/finanzas-ih/finanzas-ih";

const ETIQUETAS_TIPO_DOCUMENTO: Record<string, string> = {
  factura_afecta: "Factura Electrónica",
  factura_exenta: "Factura Exenta Electrónica",
  nota_credito: "Nota de Crédito Electrónica",
  nota_debito: "Nota de Débito Electrónica",
  guia_despacho: "Guía de Despacho Electrónica",
  boleta: "Boleta Electrónica",
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

// Documentos emitidos (venta): el XML del DTE trae siempre el mismo esquema
// sin importar el tipo de documento, asi que el detalle estructurado
// (emisor/receptor/items) se guarda en la columna `datos` al respaldar el
// XML (ver lib/finanzas-ih/sii-guias-ih.ts) y se puede mostrar bonito, igual
// que en Facturas Historicas (ModalFacturaVenta.tsx).
export default function ModalFacturaIhVenta({
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

  const datos = documento.datos;
  const [vista, setVista] = useState<"detalle" | "pdf">("detalle");
  const urlPreview = documento.pdf_sharepoint_item_id
    ? `/api/finanzas-ih/archivo?id=${encodeURIComponent(documento.pdf_sharepoint_item_id)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className={
          vista === "pdf"
            ? "flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-borde bg-white shadow-xl"
            : "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-borde bg-white p-6 shadow-xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start justify-between border-b border-borde ${vista === "pdf" ? "p-4" : "pb-4"}`}>
          <div>
            <p className="text-xs uppercase tracking-wide text-tinta/50">
              {ETIQUETAS_TIPO_DOCUMENTO[documento.tipo_documento] ?? documento.tipo_documento}
            </p>
            <h2 className="font-condensed text-2xl font-bold uppercase text-tinta">Folio {documento.folio}</h2>
            <p className="mt-1 text-xs text-tinta/50">{formatearFecha(documento.fecha_emision)}</p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {urlPreview && (
          <div className={`flex gap-1 border-b border-borde ${vista === "pdf" ? "px-4 pt-3" : "mt-4"}`}>
            <button
              onClick={() => setVista("detalle")}
              className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold uppercase ${
                vista === "detalle" ? "border-b-2 border-naranjo text-naranjo" : "text-tinta/50 hover:text-tinta"
              }`}
            >
              Detalle
            </button>
            <button
              onClick={() => setVista("pdf")}
              className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold uppercase ${
                vista === "pdf" ? "border-b-2 border-naranjo text-naranjo" : "text-tinta/50 hover:text-tinta"
              }`}
            >
              PDF original
            </button>
          </div>
        )}

        {vista === "pdf" && urlPreview ? (
          <>
            <iframe src={urlPreview} className="flex-1" title={`PDF folio ${documento.folio}`} />
            <div className="flex items-center justify-end gap-4 border-t border-borde p-3">
              <a href={urlPreview} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-naranjo hover:underline">
                Abrir en pestaña nueva
              </a>
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
          </>
        ) : datos ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-tinta/50">Emisor</p>
                <p className="mt-1 text-sm font-medium text-tinta">{datos.emisor.razonSocial ?? "-"}</p>
                <p className="text-xs text-tinta/60">RUT {datos.emisor.rut ?? "-"}</p>
                {datos.emisor.giro && <p className="text-xs text-tinta/60">{datos.emisor.giro}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-tinta/50">Receptor</p>
                <p className="mt-1 text-sm font-medium text-tinta">{datos.receptor.razonSocial ?? "-"}</p>
                <p className="text-xs text-tinta/60">RUT {datos.receptor.rut ?? "-"}</p>
                {datos.receptor.direccion && <p className="text-xs text-tinta/60">{datos.receptor.direccion}</p>}
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
                  {datos.detalle.map((item, i) => (
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
                  {datos.detalle.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-tinta/50">
                        Sin detalle de ítems.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-tinta/50">
            Este documento todavía no tiene el detalle estructurado disponible (se completa al respaldar su XML).
          </p>
        )}

        {vista === "detalle" && (
          <>
            <dl className="mt-4 ml-auto w-full max-w-xs divide-y divide-borde text-sm">
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-tinta/55">Monto neto</dt>
                <dd className="font-medium text-tinta">{formatearMonto(documento.monto_neto)}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-tinta/55">Monto exento</dt>
                <dd className="font-medium text-tinta">{formatearMonto(documento.monto_exento)}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-tinta/55">IVA</dt>
                <dd className="font-medium text-tinta">{formatearMonto(documento.monto_iva)}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-tinta/70 font-semibold">Monto total</dt>
                <dd className="font-bold text-tinta">{formatearMonto(documento.monto_total)}</dd>
              </div>
            </dl>

            {documento.xml_sharepoint_web_url && (
              <a
                href={documento.xml_sharepoint_web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-xs font-medium text-naranjo hover:underline"
              >
                Ver archivo original en SharePoint
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
