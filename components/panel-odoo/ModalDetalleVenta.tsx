"use client";

import { useEffect } from "react";
import { money, pct, fechaCl } from "@/lib/cotizador/formato";
import { PASTILLA_ESTADO } from "@/lib/estilos";
import type { FilaVenta } from "@/lib/panel-odoo/datos";
import {
  arriendoActivo,
  arriendoAtrasado,
  cotizacionVencida,
  diasDesde,
  esCotizacion,
  hoyEnChileIso,
} from "@/lib/panel-odoo/ventas-filtro";
import {
  traducir,
  ESTADOS_VENTA,
  ESTADOS_ARRIENDO,
  ESTADOS_FACTURACION_VENTA,
  ESTADOS_ENTREGA,
  ESTADOS_GARANTIA,
} from "@/lib/panel-odoo/traducciones";

type Fila = [string, string];

// Solo las filas con valor: una cotización de venta no tiene checklist de arriendo ni
// garantía, y diez guiones seguidos son peor que no mostrar la fila.
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

const CLASES_ESTADO: Record<string, string> = {
  draft: "bg-gris/15 text-gris",
  sent: "bg-naranjo-suave/15 text-naranjo",
  sale: "bg-teal/10 text-teal",
};

export default function ModalDetalleVenta({ venta, onCerrar }: { venta: FilaVenta; onCerrar: () => void }) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const hoy = hoyEnChileIso();
  const atrasado = arriendoAtrasado(venta, hoy);
  const vencida = cotizacionVencida(venta, hoy);
  const diasDeVida = diasDesde(venta.fecha_orden, hoy);
  const faltanParaFin = venta.fecha_fin_arriendo ? -(diasDesde(venta.fecha_fin_arriendo, hoy) ?? 0) : null;

  const orden = conValor([
    ["Tipo", venta.es_arriendo ? "Arriendo" : "Venta"],
    ["Estado", traducir(ESTADOS_VENTA, venta.estado)],
    ["Cliente", venta.partner_nombre ?? "-"],
    ["Fecha", venta.fecha_orden ? fechaCl(venta.fecha_orden) : "-"],
    diasDeVida !== null && esCotizacion(venta)
      ? ["Antigüedad", `${diasDeVida} día${diasDeVida === 1 ? "" : "s"}`]
      : null,
    ["Vendedor", venta.vendedor ?? "Sin asignar"],
    ["Equipo", venta.equipo ?? "-"],
    ["Referencia del cliente", venta.referencia_cliente ?? "-"],
    ["Documento de origen", venta.origen ?? "-"],
    // La trazabilidad al CRM: de qué oportunidad salió esta orden.
    ["Oportunidad", venta.oportunidad ?? "-"],
    venta.etiquetas && venta.etiquetas.length > 0 ? ["Etiquetas", venta.etiquetas.join(" · ")] : null,
  ]);

  const montos = conValor([
    venta.monto_neto ? ["Neto", money(venta.monto_neto)] : null,
    venta.monto_impuesto ? ["IVA", money(venta.monto_impuesto)] : null,
    ["Total", money(venta.monto_total)],
    ["Estado de facturación", traducir(ESTADOS_FACTURACION_VENTA, venta.estado_facturacion)],
    (venta.monto_facturado ?? 0) > 0 ? ["Facturado", money(venta.monto_facturado ?? 0)] : null,
    (venta.monto_por_facturar ?? 0) > 0 ? ["Falta facturar", money(venta.monto_por_facturar ?? 0)] : null,
    venta.facturas ? ["Facturas emitidas", String(venta.facturas)] : null,
    ["Condición de pago", venta.condicion_pago ?? "-"],
  ]);

  const margen = conValor([
    venta.margen ? ["Margen", money(venta.margen)] : null,
    venta.margen_porcentaje ? ["Margen %", pct(venta.margen_porcentaje / 100, 1)] : null,
    venta.margen_bajo === true
      ? ["Bajo el objetivo", venta.margen_aprobado === true ? "sí, pero aprobado" : "sí, sin aprobar"]
      : null,
  ]);

  const compromisos = conValor([
    ["Validez de la cotización", venta.validez_hasta ? fechaCl(venta.validez_hasta) : "-"],
    ["Entrega comprometida", venta.fecha_compromiso ? fechaCl(venta.fecha_compromiso) : "-"],
    ["Estado de entrega", traducir(ESTADOS_ENTREGA, venta.estado_entrega)],
  ]);

  const arriendo = venta.es_arriendo
    ? conValor([
        ["Estado del arriendo", traducir(ESTADOS_ARRIENDO, venta.estado_arriendo)],
        ["Inicio", venta.fecha_inicio_arriendo ? fechaCl(venta.fecha_inicio_arriendo) : "-"],
        ["Fin", venta.fecha_fin_arriendo ? fechaCl(venta.fecha_fin_arriendo) : "-"],
        venta.dias_arriendo ? ["Días de arriendo", String(venta.dias_arriendo)] : null,
        arriendoActivo(venta) && faltanParaFin !== null
          ? [
              "Plazo",
              faltanParaFin >= 0
                ? `faltan ${faltanParaFin} día${faltanParaFin === 1 ? "" : "s"}`
                : `pasado de fecha hace ${-faltanParaFin} día${faltanParaFin === -1 ? "" : "s"}`,
            ]
          : null,
        venta.dias_atraso ? ["Días de atraso", String(venta.dias_atraso)] : null,
        ["Devolución real", venta.fecha_devolucion ? fechaCl(venta.fecha_devolucion) : "-"],
        venta.producto_devuelto === true ? ["Producto devuelto", "sí"] : null,
      ])
    : [];

  const cierre = venta.es_arriendo
    ? conValor([
        venta.tiene_danos === true ? ["Daños registrados", "sí"] : null,
        (venta.costo_danos ?? 0) > 0 ? ["Costo de los daños", money(venta.costo_danos ?? 0)] : null,
        (venta.total_liquidacion ?? 0) > 0 ? ["Total de la liquidación", money(venta.total_liquidacion ?? 0)] : null,
        ["Garantía", traducir(ESTADOS_GARANTIA, venta.garantia_estado)],
        ["Documento de garantía", venta.garantia_documento ?? "-"],
      ])
    : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borde bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-condensed text-lg font-bold uppercase text-tinta">
              {venta.numero ?? `Orden #${venta.odoo_id}`}
            </h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className={`${PASTILLA_ESTADO} ${CLASES_ESTADO[venta.estado] ?? "bg-gris/15 text-gris"}`}>
                {traducir(ESTADOS_VENTA, venta.estado)}
              </span>
              {venta.es_arriendo && (
                <span className="rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
                  Arriendo
                </span>
              )}
              {atrasado && (
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Pasado de fecha
                </span>
              )}
              {vencida && (
                <span className="rounded-full border border-naranjo/30 bg-naranjo/10 px-2 py-0.5 text-[11px] font-semibold text-naranjo">
                  Validez vencida
                </span>
              )}
              {(venta.monto_por_facturar ?? 0) > 0 && venta.estado === "sale" && (
                <span className="rounded-full border border-naranjo/30 bg-naranjo/10 px-2 py-0.5 text-[11px] font-semibold text-naranjo">
                  Por facturar
                </span>
              )}
              {venta.tiene_danos === true && (
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Con daños
                </span>
              )}
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
          {/* Los avisos arriba y no deducidos de dos fechas en dos grupos distintos. */}
          {atrasado && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              El arriendo terminó el {venta.fecha_fin_arriendo ? fechaCl(venta.fecha_fin_arriendo) : "—"} y el equipo
              todavía no está devuelto.
            </p>
          )}
          {(venta.monto_por_facturar ?? 0) > 0 && venta.estado === "sale" && (
            <p className="mt-4 rounded-lg border border-naranjo/30 bg-naranjo/10 px-3 py-2 text-xs text-naranjo">
              Confirmada con {money(venta.monto_por_facturar ?? 0)} sin facturar.
            </p>
          )}
          <Grupo titulo="Orden" filas={orden} />
          <Grupo titulo="Montos y facturación" filas={montos} />
          <Grupo titulo="Margen" filas={margen} />
          <Grupo titulo="Compromisos" filas={compromisos} />
          <Grupo titulo="Arriendo" filas={arriendo} />
          <Grupo titulo="Cierre del arriendo" filas={cierre} />
        </div>
      </div>
    </div>
  );
}
