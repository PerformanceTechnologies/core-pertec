"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import { PASTILLA_ESTADO } from "@/lib/estilos";
import { CLASES_ESTADO, ETIQUETAS_ESTADO, ETIQUETAS_DTE, TITULO_ESTADO } from "@/lib/finanzas-estados";
import { faltaEnElSii, hayDescuadreDeMonto, type FacturaCruzada } from "@/lib/panel-odoo/cruce-sii";
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
  factura: FacturaCruzada;
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
    factura.fecha_entrega ? ["Fecha de entrega", fechaCl(factura.fecha_entrega)] : null,
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
    factura.pagos ? ["Pagos aplicados", String(factura.pagos)] : null,
    factura.referencia_pago ? ["Referencia de pago", factura.referencia_pago] : null,
    factura.moneda && factura.moneda !== "CLP" ? ["Moneda", factura.moneda] : null,
  ]);

  // Lo que dice el registro del SII, que es de donde sale el estado (ver
  // lib/panel-odoo/cruce-sii.ts). Va primero que el DTE de Odoo a propósito.
  const registro = conValor([
    factura.sii ? ["Estado en el SII", ETIQUETAS_ESTADO[factura.sii.estado] ?? factura.sii.estado] : null,
    factura.sii?.razon_social ? ["Razón social en el SII", factura.sii.razon_social] : null,
    factura.folio !== null ? ["Folio", String(factura.folio)] : null,
    factura.codigo_dte !== null
      ? ["Tipo de DTE", `${factura.codigo_dte}${ETIQUETAS_DTE[factura.codigo_dte] ? ` — ${ETIQUETAS_DTE[factura.codigo_dte]}` : ""}`]
      : null,
    factura.sii?.fecha_recepcion ? ["Recepción en el SII", fechaCl(factura.sii.fecha_recepcion)] : null,
    factura.sii?.fecha_acuse ? ["Acuse de recibo", fechaCl(factura.sii.fecha_acuse)] : null,
    factura.sii?.fecha_reclamo ? ["Fecha de reclamo", fechaCl(factura.sii.fecha_reclamo)] : null,
    factura.sii ? ["Período del registro", factura.sii.periodo] : null,
    factura.sii?.monto_neto !== null && factura.sii?.monto_neto !== undefined
      ? ["Neto según el SII", money(factura.sii.monto_neto)]
      : null,
    factura.sii?.monto_exento ? ["Exento según el SII", money(factura.sii.monto_exento)] : null,
    factura.sii?.monto_iva !== null && factura.sii?.monto_iva !== undefined
      ? ["IVA según el SII", money(factura.sii.monto_iva)]
      : null,
    factura.sii?.monto_total !== null && factura.sii?.monto_total !== undefined
      ? ["Total según el SII", money(factura.sii.monto_total)]
      : null,
  ]);

  const dte = conValor([
    ["Envío al SII", traducir(ESTADOS_DTE, factura.dte_estado)],
    ["Envío al receptor", factura.dte_envio_receptor === "sent" ? "Enviado" : factura.dte_envio_receptor === "not_sent" ? "No enviado" : "-"],
    ["Acuse registrado en Odoo", traducir(ESTADOS_ACEPTACION_DTE, factura.dte_aceptacion)],
    factura.reclamo ? ["Código de reclamo", `${factura.reclamo} — ${traducir(CODIGOS_RECLAMO_SII, factura.reclamo)}`] : null,
    factura.reclamo_detalle ? ["Detalle del reclamo", factura.reclamo_detalle] : null,
    factura.dte_track_id ? ["Track ID del envío", factura.dte_track_id] : null,
  ]);

  const cesion = conValor([
    ["Cesión", traducir(ESTADOS_CESION, factura.cedida)],
    factura.cedida_a_odoo_id ? ["Factura cedida asociada", `#${factura.cedida_a_odoo_id}`] : null,
  ]);

  const edp = conValor([
    ["N° EDP", factura.edp_nombre ?? "-"],
    factura.edp_nombre ? ["Estado EDP", traducir(ESTADOS_EDP, factura.edp_estado)] : null,
    factura.edp_periodo ? ["Mes de servicio", fechaCl(factura.edp_periodo)] : null,
    factura.hes_numero ? ["N° HES / referencia del mandante", factura.hes_numero] : null,
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
              {factura.sii && (
                <span
                  title={TITULO_ESTADO[factura.sii.estado]}
                  className={`${PASTILLA_ESTADO} ${CLASES_ESTADO[factura.sii.estado] ?? "bg-gris/15 text-gris"}`}
                >
                  SII: {ETIQUETAS_ESTADO[factura.sii.estado] ?? factura.sii.estado}
                </span>
              )}
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
          {/* El contraste con Panel Finanzas: lo que no calza se dice arriba, no se
              deduce comparando dos montos en dos grupos distintos. */}
          {faltaEnElSii(factura) && (
            <p className="mt-4 rounded-lg border border-naranjo/30 bg-naranjo/10 px-3 py-2 text-xs text-naranjo">
              Esta factura está contabilizada en Odoo con folio {factura.folio} pero no aparece en el registro del
              SII que lee Panel Finanzas. Puede ser que el registro todavía no esté al día para su período.
            </p>
          )}
          {hayDescuadreDeMonto(factura) && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              El monto no calza con el del SII: Odoo dice {money(factura.monto_total)} y el registro{" "}
              {money(factura.sii?.monto_total ?? 0)} ({money(Math.abs(factura.diferenciaDeMonto ?? 0))} de
              diferencia).
            </p>
          )}
          <Grupo titulo="Documento" filas={documento} />
          <Grupo titulo="Contraparte" filas={contraparte} />
          <Grupo titulo="Montos" filas={montos} />
          <Grupo titulo="Registro del SII (Panel Finanzas)" filas={registro} />
          <Grupo titulo="Documento electrónico en Odoo" filas={dte} />
          <Grupo titulo="Cesión" filas={cesion} />
          <Grupo titulo="Estado de pago (EDP)" filas={edp} />
        </div>
      </div>
    </div>
  );
}
