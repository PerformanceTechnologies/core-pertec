"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaFactura } from "@/lib/panel-odoo/datos";
import { diasDeAtraso, estaVencida, hoyEnChileIso } from "@/lib/panel-odoo/facturas-filtro";
import {
  traducir,
  TIPOS_FACTURA,
  ESTADOS_FACTURA,
  ESTADOS_PAGO_FACTURA,
  ESTADOS_CESION,
  ESTADOS_DTE,
  ESTADOS_ACEPTACION_DTE,
  CODIGOS_RECLAMO_SII,
  ESTADOS_EDP,
} from "@/lib/panel-odoo/traducciones";

type Fila = [string, string];

// Solo las filas con valor: una factura de compra no tiene DTE propio ni EDP,
// y mostrar diez guiones seguidos es peor que no mostrar la fila.
function conValor(filas: (Fila | null)[]): Fila[] {
  return filas.filter((f): f is Fila => f !== null && f[1] !== "" && f[1] !== "-");
}

function Grupo({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  if (filas.length === 0) return null;
  return (
    <section className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <dl className="mt-1 divide-y divide-borde text-sm">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-start justify-between gap-4 py-2">
            <dt className="shrink-0 text-tinta/55">{etiqueta}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-tinta">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Pastilla({ texto, tono }: { texto: string; tono: "teal" | "naranjo" | "rojo" | "gris" }) {
  const tonos = {
    teal: "border-teal/30 bg-teal/10 text-teal",
    naranjo: "border-naranjo/30 bg-naranjo/10 text-naranjo",
    rojo: "border-red-200 bg-red-50 text-red-700",
    gris: "border-borde bg-crema text-tinta/60",
  } as const;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tonos[tono]}`}>{texto}</span>
  );
}

export default function ModalDetalleFactura({
  factura,
  onCerrar,
}: {
  factura: FilaFactura;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const hoy = hoyEnChileIso();
  const atraso = diasDeAtraso(factura, hoy);
  const vencida = estaVencida(factura, hoy);

  const documento = conValor([
    ["Tipo", traducir(TIPOS_FACTURA, factura.move_type)],
    ["Tipo de documento (SII)", factura.tipo_documento ?? "-"],
    ["Estado", traducir(ESTADOS_FACTURA, factura.state)],
    ["Fecha", factura.fecha_factura ? fechaCl(factura.fecha_factura) : "-"],
    ["Vencimiento", factura.fecha_vencimiento ? fechaCl(factura.fecha_vencimiento) : "-"],
    atraso !== null && factura.payment_state !== "paid"
      ? ["Plazo", atraso > 0 ? `Vencida hace ${atraso} día${atraso === 1 ? "" : "s"}` : `Vence en ${-atraso} día${atraso === -1 ? "" : "s"}`]
      : null,
    ["Condición de pago", factura.condicion_pago ?? "-"],
    ["Diario", factura.diario ?? "-"],
    ["Vendedor", factura.vendedor ?? "-"],
    ["Referencia", factura.referencia ?? "-"],
    ["Origen", factura.origen ?? "-"],
  ]);

  const contraparte = conValor([
    ["Contraparte", factura.partner_nombre ?? "-"],
    ["RUT", factura.rut_contraparte ?? "-"],
  ]);

  const montos = conValor([
    factura.monto_neto !== null ? ["Neto", money(factura.monto_neto)] : null,
    factura.monto_impuesto !== null ? ["IVA", money(factura.monto_impuesto)] : null,
    ["Total", money(factura.monto_total)],
    ["Pendiente", money(factura.monto_pendiente)],
    ["Pagado", money(factura.monto_total - factura.monto_pendiente)],
    ["Estado de pago", traducir(ESTADOS_PAGO_FACTURA, factura.payment_state)],
    factura.moneda && factura.moneda !== "CLP" ? ["Moneda", factura.moneda] : null,
  ]);

  const sii = conValor([
    ["Estado del DTE", traducir(ESTADOS_DTE, factura.dte_estado)],
    ["Acuse del receptor", traducir(ESTADOS_ACEPTACION_DTE, factura.dte_aceptacion)],
    factura.reclamo ? ["Código de reclamo", `${factura.reclamo} — ${traducir(CODIGOS_RECLAMO_SII, factura.reclamo)}`] : null,
  ]);

  const cesion = conValor([
    ["Cesión", traducir(ESTADOS_CESION, factura.cedida)],
    factura.cedida_a_odoo_id ? ["Factura cedida asociada", `#${factura.cedida_a_odoo_id}`] : null,
  ]);

  const edp = conValor([
    ["N° EDP", factura.edp_nombre ?? "-"],
    factura.edp_nombre ? ["Estado EDP", traducir(ESTADOS_EDP, factura.edp_estado)] : null,
  ]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borde bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-condensed text-lg font-bold uppercase text-tinta">
              {factura.numero ?? `Factura #${factura.odoo_id}`}
            </h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {factura.cedida === "yielded" && <Pastilla texto="Cedida (factoring)" tono="teal" />}
              {factura.cedida === "to_yield" && <Pastilla texto="Por ceder" tono="gris" />}
              {vencida && <Pastilla texto="Vencida" tono="rojo" />}
              {factura.dte_aceptacion === "claimed" && <Pastilla texto="Reclamada" tono="rojo" />}
              {(factura.dte_estado === "rejected" || factura.dte_estado === "objected") && (
                <Pastilla texto={traducir(ESTADOS_DTE, factura.dte_estado)} tono="naranjo" />
              )}
              {factura.payment_state === "paid" && <Pastilla texto="Pagada" tono="teal" />}
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="shrink-0 rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          <Grupo titulo="Documento" filas={documento} />
          <Grupo titulo="Contraparte" filas={contraparte} />
          <Grupo titulo="Montos" filas={montos} />
          <Grupo titulo="SII" filas={sii} />
          <Grupo titulo="Cesión" filas={cesion} />
          <Grupo titulo="Estado de pago (EDP)" filas={edp} />
        </div>
      </div>
    </div>
  );
}
