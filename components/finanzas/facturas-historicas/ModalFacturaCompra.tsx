"use client";

import { useEffect, useState } from "react";
import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import type { ResultadoBusquedaCompra } from "@/lib/facturas-historicas";
import type { DteParseado } from "@/lib/xml-dte";

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
  // Los que vienen de Odoo son el XML del DTE: no hay PDF que mostrar, así que se arma la factura
  // con sus datos (como en Ventas) y el XML queda para descargar.
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

        {esXml ? (
          <VistaDte url={`${urlPreview}&formato=dte`} />
        ) : (
          <iframe
            src={urlPreview}
            className="flex-1 rounded-b-xl"
            title={archivo.nombre}
          />
        )}

        {(archivo.webUrl || esXml) && (
          <div className="flex items-center justify-end gap-4 border-t border-borde p-3">
            {esXml && (
              <a
                href={`${urlPreview}&nombre=${encodeURIComponent(archivo.nombre)}`}
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

/** La factura armada desde su XML: emisor, ítems y totales. */
function VistaDte({ url }: { url: string }) {
  const [estado, setEstado] = useState<{
    dte: DteParseado | null;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let vigente = true;
    fetch(url)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "No se pudo leer el XML");
        return j as { dte: DteParseado | null };
      })
      .then((j) => vigente && setEstado(j))
      .catch(
        (e) =>
          vigente &&
          setEstado({
            dte: null,
            error: e instanceof Error ? e.message : String(e),
          }),
      );
    return () => {
      vigente = false;
    };
  }, [url]);

  if (!estado) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-tinta/50">
        <IconLoader2 size={16} className="animate-spin" /> Leyendo el documento…
      </div>
    );
  }
  const { dte } = estado;
  if (!dte) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-tinta/50">
        {estado.error ?? "El XML no trae un documento legible."} Puedes
        descargarlo abajo.
      </div>
    );
  }
  const { emisor, receptor, detalle } = dte.datos;
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-tinta/50">
            Emisor
          </p>
          <p className="mt-1 text-sm font-medium text-tinta">
            {emisor.razonSocial ?? "-"}
          </p>
          <p className="text-xs text-tinta/60">RUT {emisor.rut ?? "-"}</p>
          {emisor.giro && (
            <p className="text-xs text-tinta/60">{emisor.giro}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-tinta/50">
            Receptor
          </p>
          <p className="mt-1 text-sm font-medium text-tinta">
            {receptor.razonSocial ?? "-"}
          </p>
          <p className="text-xs text-tinta/60">RUT {receptor.rut ?? "-"}</p>
          {receptor.direccion && (
            <p className="text-xs text-tinta/60">{receptor.direccion}</p>
          )}
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
                  {item.descripcion && (
                    <p className="text-xs text-tinta/50">{item.descripcion}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-tinta/70">
                  {item.cantidad ?? "-"}
                </td>
                <td className="px-3 py-2 text-right text-tinta/70">
                  {formatearMonto(item.precioUnitario)}
                </td>
                <td className="px-3 py-2 text-right text-tinta">
                  {formatearMonto(item.monto)}
                </td>
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
        {[
          ["Monto neto", dte.montoNeto],
          ["Monto exento", dte.montoExento],
          ["IVA", dte.montoIva],
        ].map(([etiqueta, valor]) => (
          <div
            key={etiqueta as string}
            className="flex items-center justify-between py-1.5"
          >
            <dt className="text-tinta/55">{etiqueta}</dt>
            <dd className="font-medium text-tinta">
              {formatearMonto(valor as number | null)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between py-1.5">
          <dt className="font-semibold text-tinta/70">Monto total</dt>
          <dd className="font-bold text-tinta">
            {formatearMonto(dte.montoTotal)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
