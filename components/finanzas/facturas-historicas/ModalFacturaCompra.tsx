"use client";

import { useEffect } from "react";
import { IconDownload } from "@tabler/icons-react";
import type { ResultadoBusquedaCompra } from "@/lib/facturas-historicas";

function formatearMonto(valor: number | null): string {
  if (valor === null) return "-";
  return valor.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function formatearFecha(valor: string | null): string {
  if (!valor) return "-";
  const [anio, mes, dia] = valor.split("-");
  return `${dia}-${mes}-${anio}`;
}

export default function ModalFacturaCompra({
  archivo,
  onCerrar,
}: {
  archivo: ResultadoBusquedaCompra;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  // No se embebe el webUrl de SharePoint directo: el navegador del usuario
  // no tiene sesion en ese tenant, asi que el iframe termina redirigiendo a
  // login.microsoftonline.com, que rechaza mostrarse dentro de un iframe.
  // Este endpoint trae el PDF via Graph (con las credenciales de la app) y
  // lo sirve el mismo dominio, sin pasar por ningun login.
  const urlPreview = `/api/finanzas/facturas-compra/archivo?id=${encodeURIComponent(archivo.id)}`;
  // Los que vienen de Odoo son el XML del DTE: el endpoint lo entrega como un PDF armado con sus
  // datos (lib/dte-pdf.ts) y el XML original queda para descargar.
  const esXml = archivo.nombre.toLowerCase().endsWith(".xml");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-borde bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-borde p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-tinta/50">
              {archivo.tipoDocumentoDetectado ?? "Documento"}{" "}
              {archivo.folio ? `N° ${archivo.folio}` : ""}
            </p>
            <h2 className="font-condensed text-lg font-bold text-tinta">
              {archivo.razonSocialEmisor ?? archivo.nombre}
            </h2>
            <p className="mt-0.5 text-xs text-tinta/50">
              {archivo.rutEmisor ? `RUT ${archivo.rutEmisor} · ` : ""}
              {formatearFecha(archivo.fechaEmision)} ·{" "}
              {formatearMonto(archivo.montoTotal)}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <iframe
            src={urlPreview}
            className="flex-1 rounded-b-xl"
            title={archivo.nombre}
          />

        {(archivo.webUrl || esXml) && (
          <div className="flex items-center justify-end gap-4 border-t border-borde p-3">
            {esXml && (
              <a
                href={`${urlPreview}&descargar=1&nombre=${encodeURIComponent(archivo.nombre)}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-naranjo hover:underline"
              >
                <IconDownload size={14} /> Descargar XML
              </a>
            )}
            {archivo.webUrl && (
              <a
                href={archivo.webUrl}
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
