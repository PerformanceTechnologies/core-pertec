"use client";

import { useTransition } from "react";
import Link from "next/link";
import type { CotizacionCompleta } from "@/lib/cotizador";
import { money, pct } from "@/lib/cotizador/formato";
import { marcarEmitidaAction, crearNuevaVersionAction } from "@/app/(protegido)/cotizador/acciones";

const KPIS: { clave: keyof CotizacionCompleta["summary"]; etiqueta: string; formato: "money" | "pct" | "plain" }[] = [
  { clave: "costoMensualTotal", etiqueta: "Costo mensual total", formato: "money" },
  { clave: "costoTotalServicio", etiqueta: "Costo total servicio", formato: "money" },
  { clave: "ecoTotalNeto", etiqueta: "ECO — total neto", formato: "money" },
  { clave: "ecoConIva", etiqueta: "ECO — total con IVA", formato: "money" },
  { clave: "margenEfectivoTotal", etiqueta: "Margen efectivo", formato: "pct" },
  { clave: "dotacionTotal", etiqueta: "Dotación total (personas)", formato: "plain" },
];

export default function EditorCotizacion({ cotizacion }: { cotizacion: CotizacionCompleta }) {
  const [pendiente, iniciarTransicion] = useTransition();

  return (
    <div>
      <Link href="/cotizador" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Cotizaciones
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-condensed text-2xl font-bold uppercase text-tinta">{cotizacion.nombre}</h1>
        <span className="rounded-full bg-gris/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-gris">
          {cotizacion.tipoServicio === "spot" ? "SPOT" : "Permanente"}
        </span>
        <span className="rounded-full border border-borde px-2 py-0.5 text-[11px] font-semibold text-tinta/70">
          {cotizacion.rev}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            cotizacion.emitida ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
          }`}
        >
          {cotizacion.emitida ? "Emitida" : "Borrador"}
        </span>
        <div className="flex-1" />
        {!cotizacion.emitida ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciarTransicion(() => marcarEmitidaAction(cotizacion.id))}
            className="rounded-lg bg-naranjo px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:opacity-50"
          >
            Marcar como emitida
          </button>
        ) : (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciarTransicion(() => crearNuevaVersionAction(cotizacion.id))}
            className="rounded-lg border border-borde px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
          >
            Crear nueva versión
          </button>
        )}
      </div>
      <div className="mt-1 text-sm text-tinta/60">
        {cotizacion.cliente ?? "Sin cliente"} · {cotizacion.faena ?? "Sin faena"} · duración{" "}
        {cotizacion.input.duracionMeses} {cotizacion.input.duracionMeses === 1 ? "mes" : "meses"} ·{" "}
        {cotizacion.input.diasServicio} días de servicio
      </div>

      {cotizacion.emitida && (
        <div className="mt-4 rounded-xl bg-tinta px-4 py-3 text-sm text-white">
          Cotización <b>emitida</b> — solo lectura. Parámetros congelados al {cotizacion.parametrosSnapshot.vigenteDesde}.
          Para modificarla, cree una nueva versión.
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {KPIS.map((k) => (
          <div key={k.clave} className="rounded-xl border border-borde bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">{k.etiqueta}</div>
            <div className="mt-1 font-condensed text-xl font-bold text-tinta">
              {k.formato === "money"
                ? money(cotizacion.summary[k.clave])
                : k.formato === "pct"
                  ? pct(cotizacion.summary[k.clave])
                  : cotizacion.summary[k.clave]}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-naranjo/40 bg-naranjo/5 p-5 text-sm text-tinta/70">
        <p className="font-semibold text-tinta">Editor completo en construcción.</p>
        <p className="mt-1">
          Las pestañas de Parámetros del proyecto, Dotación y Remuneraciones, Alimentación, Costos, Resumen y Márgenes
          y Propuesta ECO —la edición línea por línea que recalcula estos KPIs en vivo— se están portando desde la app
          standalone. Por ahora esta vista es de solo lectura, mostrando el último cálculo guardado.
        </p>
      </div>
    </div>
  );
}
