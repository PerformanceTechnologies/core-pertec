"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CotizacionCompleta } from "@/lib/cotizador";
import { marcarEmitidaAction, crearNuevaVersionAction } from "@/app/(protegido)/cotizador/acciones";
import { useEditorCotizacion } from "./useEditorCotizacion";
import ParametrosTab from "./tabs/ParametrosTab";
import DotacionTab from "./tabs/DotacionTab";
import AlimentacionTab from "./tabs/AlimentacionTab";
import CostosTab from "./tabs/CostosTab";
import ResumenTab from "./tabs/ResumenTab";
import EcoTab from "./tabs/EcoTab";

type QuoteTab = "parametros" | "dotacion" | "alimentacion" | "costos" | "resumen" | "eco";

const TABS: { key: QuoteTab; label: string }[] = [
  { key: "parametros", label: "Parámetros del proyecto" },
  { key: "dotacion", label: "Dotación y Remuneraciones" },
  { key: "alimentacion", label: "Alimentación" },
  { key: "costos", label: "Costos" },
  { key: "resumen", label: "Resumen y Márgenes" },
  { key: "eco", label: "Propuesta ECO" },
];

const ESTADO_GUARDADO: Record<string, string> = {
  idle: "text-tinta/40",
  saving: "text-naranjo",
  saved: "text-teal",
  error: "text-red-600",
};
const ETIQUETA_GUARDADO: Record<string, string> = {
  idle: "Sin cambios",
  saving: "Guardando…",
  saved: "Guardado",
  error: "Error al guardar",
};

export default function EditorCotizacion({ cotizacion }: { cotizacion: CotizacionCompleta }) {
  const [tab, setTab] = useState<QuoteTab>("parametros");
  const [pendiente, iniciarTransicion] = useTransition();
  const { quotation, result, update, saveState, disabled } = useEditorCotizacion(cotizacion);

  return (
    <div>
      <Link href="/cotizador" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Cotizaciones
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-condensed text-2xl font-bold uppercase text-tinta">{cotizacion.nombre}</h1>
        <span className="rounded-full bg-naranjo/10 px-2 py-0.5 text-[11px] font-semibold text-naranjo">
          {cotizacion.empresa}
        </span>
        <span className="rounded-full bg-gris/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-gris">
          {quotation.tipoServicio === "spot" ? "SPOT" : "Permanente"}
        </span>
        <span className="rounded-full border border-borde px-2 py-0.5 text-[11px] font-semibold text-tinta/70">
          {cotizacion.rev}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            disabled ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
          }`}
        >
          {disabled ? "Emitida" : "Borrador"}
        </span>
        <span className={`flex items-center gap-1.5 text-[11px] font-medium ${ESTADO_GUARDADO[saveState]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {ETIQUETA_GUARDADO[saveState]}
        </span>
        <div className="flex-1" />
        {!disabled ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciarTransicion(() => marcarEmitidaAction(cotizacion.id))}
            className="rounded-md bg-naranjo px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:opacity-50"
          >
            Marcar como emitida
          </button>
        ) : (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciarTransicion(() => crearNuevaVersionAction(cotizacion.id))}
            className="rounded-md border border-borde px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:opacity-50"
          >
            Crear nueva versión
          </button>
        )}
      </div>

      <div className="mt-1 text-sm text-tinta/60">
        {cotizacion.cliente ?? "Sin cliente"} · {cotizacion.faena ?? "Sin faena"} · duración{" "}
        {quotation.duracionMeses} {quotation.duracionMeses === 1 ? "mes" : "meses"} · {quotation.diasServicio} días de
        servicio · parámetros legales vigencia {cotizacion.parametrosSnapshot.vigenteDesde}
      </div>

      {disabled && (
        <div className="mt-4 rounded-xl bg-tinta px-4 py-3 text-sm text-white">
          Cotización <b>emitida</b> — solo lectura. Snapshot de parámetros congelado al{" "}
          {cotizacion.parametrosSnapshot.vigenteDesde}. Para modificar, cree una nueva versión.
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-0.5 border-b-2 border-tinta">
        {TABS.map((t) => {
          const activo = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-t-md px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition ${
                activo ? "bg-tinta text-white" : "text-tinta/60 hover:bg-crema"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "parametros" && (
        <ParametrosTab cotizacion={cotizacion} quotation={quotation} update={update} disabled={disabled} />
      )}
      {tab === "dotacion" && <DotacionTab quotation={quotation} result={result} update={update} disabled={disabled} />}
      {tab === "alimentacion" && (
        <AlimentacionTab quotation={quotation} result={result} update={update} disabled={disabled} />
      )}
      {tab === "costos" && (
        <CostosTab
          quotation={quotation}
          result={result}
          update={update}
          disabled={disabled}
          uf={cotizacion.parametrosSnapshot.uf}
        />
      )}
      {tab === "resumen" && <ResumenTab quotation={quotation} result={result} update={update} disabled={disabled} />}
      {tab === "eco" && <EcoTab cotizacion={cotizacion} result={result} />}
    </div>
  );
}
