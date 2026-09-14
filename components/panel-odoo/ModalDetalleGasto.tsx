"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaGasto } from "@/lib/panel-odoo/datos";
import { diasDesde, hoyEnChileIso, olvidado, porReembolsar, sinRespaldo } from "@/lib/panel-odoo/gastos-filtro";
import {
  traducir,
  ESTADOS_GASTO,
  ESTADOS_APROBACION_GASTO,
  FORMAS_PAGO_GASTO,
  CATEGORIAS_GASTO,
  TIPOS_DOCUMENTO_GASTO,
  TIPOS_ATRIBUCION_GASTO,
} from "@/lib/panel-odoo/traducciones";

/**
 * Todo lo que se sabe de un gasto, en cuatro bloques.
 *
 * Antes mostraba seis filas. Lo que faltaba es justo lo que se necesita para decidir qué
 * hacer con él: si tiene respaldo, a quién hay que devolverle la plata, contra qué fondo
 * se imputó y a qué venta o arriendo se le carga.
 */
export default function ModalDetalleGasto({ gasto, onCerrar }: { gasto: FilaGasto; onCerrar: () => void }) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const hoy = hoyEnChileIso();
  const dias = diasDesde(gasto.fecha, hoy);

  const dinero: Fila[] = [
    ["Total", money(gasto.monto_total)],
    ["Neto", gasto.monto_neto ? money(gasto.monto_neto) : null],
    ["IVA", gasto.monto_impuesto ? money(gasto.monto_impuesto) : null],
    ["Pendiente", (gasto.monto_pendiente ?? 0) > 0 ? money(gasto.monto_pendiente ?? 0) : null],
    ["Forma de pago", traducir(FORMAS_PAGO_GASTO, gasto.forma_pago)],
    ["Fondo por rendir", gasto.fondo],
  ];

  const tramite: Fila[] = [
    ["Estado", traducir(ESTADOS_GASTO, gasto.estado)],
    ["Aprobación", gasto.estado_aprobacion ? traducir(ESTADOS_APROBACION_GASTO, gasto.estado_aprobacion) : null],
    ["Aprobado el", gasto.fecha_aprobacion ? fechaCl(gasto.fecha_aprobacion) : null],
    ["Aprobador", gasto.aprobador],
    ["Asiento contable", gasto.asiento],
  ];

  const quien: Fila[] = [
    ["Empleado", gasto.empleado],
    ["Departamento", gasto.departamento],
    ["Proveedor", gasto.proveedor],
    ["Fecha", gasto.fecha ? `${fechaCl(gasto.fecha)}${dias === null ? "" : ` · hace ${dias} d`}` : null],
  ];

  const clasificacion: Fila[] = [
    ["Categoría", gasto.categoria ? traducir(CATEGORIAS_GASTO, gasto.categoria) : null],
    ["Categoría en Odoo", gasto.categoria_odoo],
    ["Documento", gasto.tipo_documento ? traducir(TIPOS_DOCUMENTO_GASTO, gasto.tipo_documento) : null],
    ["Concepto", gasto.concepto],
    [
      "Se le carga a",
      gasto.atribuido_a
        ? `${gasto.atribuido_a}${gasto.atribuido_tipo ? ` (${traducir(TIPOS_ATRIBUCION_GASTO, gasto.atribuido_tipo)})` : ""}`
        : null,
    ],
    ["Contraparte", gasto.contraparte],
    ["Proyecto", gasto.proyecto ? `${gasto.proyecto}${gasto.tarea ? ` · ${gasto.tarea}` : ""}` : null],
    ["Respaldos adjuntos", gasto.respaldos === null ? null : String(gasto.respaldos)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-condensed text-lg font-bold uppercase text-tinta">
              {gasto.descripcion ?? `Gasto #${gasto.odoo_id}`}
            </h2>
            <p className="text-xs text-tinta/45">
              {gasto.empleado ?? "Sin asignar"}
              {gasto.fecha ? ` · ${fechaCl(gasto.fecha)}` : ""}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="shrink-0 rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Lo que hay que arreglar, arriba: es lo único que pide una acción. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sinRespaldo(gasto) && <Alerta texto="Sin respaldo adjunto en Odoo" />}
          {olvidado(gasto, hoy) && <Alerta texto={`En borrador hace ${dias} días`} />}
          {(gasto.duplicados ?? 0) > 0 && <Alerta texto={`Odoo lo marca repetido de otro${gasto.duplicados! > 1 ? "s" : ""}`} />}
          {porReembolsar(gasto) && (
            <span className="rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
              Se le deben {money(gasto.monto_pendiente ?? 0)} a {gasto.empleado ?? "quien lo pagó"}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Bloque titulo="Dinero" filas={dinero} />
          <Bloque titulo="Trámite" filas={tramite} />
          <Bloque titulo="Quién y cuándo" filas={quien} />
          <Bloque titulo="Clasificación" filas={clasificacion} />
        </div>
      </div>
    </div>
  );
}

type Fila = [string, string | null];

/** Un bloque de filas. Las que no tienen dato no se dibujan: una lista de "-" no informa. */
function Bloque({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  const conDato = filas.filter(([, valor]) => valor !== null && valor !== "");
  if (conDato.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <dl className="mt-1 divide-y divide-borde text-sm">
        {conDato.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-center justify-between gap-3 py-1.5">
            <dt className="shrink-0 text-xs text-tinta/55">{etiqueta}</dt>
            <dd className="min-w-0 truncate text-right text-xs font-medium text-tinta" title={valor ?? undefined}>
              {valor}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Alerta({ texto }: { texto: string }) {
  return (
    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      {texto}
    </span>
  );
}
