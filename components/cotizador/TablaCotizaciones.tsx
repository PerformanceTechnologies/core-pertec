"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CotizacionResumen } from "@/lib/cotizador";
import { EMPRESAS } from "@/lib/cotizador/empresas";
import { money, pct, fechaCl } from "@/lib/cotizador/formato";
import BotonEliminar from "@/components/BotonEliminar";
import { eliminarCotizacionAction } from "@/app/(protegido)/cotizador/acciones";

const ESTADO_CLASES: Record<string, string> = {
  borrador: "bg-gris/10 text-gris",
  emitida: "bg-teal/10 text-teal",
  adjudicada: "bg-teal/10 text-teal",
  perdida: "bg-red-600/10 text-red-600",
};

function etiquetaEstado(estado: string): string {
  const mapa: Record<string, string> = {
    borrador: "Borrador",
    emitida: "Emitida",
    adjudicada: "Adjudicada",
    perdida: "Perdida",
  };
  return mapa[estado] ?? estado;
}

export default function TablaCotizaciones({
  cotizaciones,
  puedeEliminar,
}: {
  cotizaciones: CotizacionResumen[];
  puedeEliminar: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string>("todas");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return cotizaciones.filter((c) => {
      if (empresaFiltro !== "todas" && c.empresa !== empresaFiltro) return false;
      if (tipoFiltro !== "todos" && c.tipoServicio !== tipoFiltro) return false;
      if (estadoFiltro !== "todos" && c.estado !== estadoFiltro) return false;
      const fechaActualizado = c.actualizadoEn.slice(0, 10);
      if (fechaDesde && fechaActualizado < fechaDesde) return false;
      if (fechaHasta && fechaActualizado > fechaHasta) return false;
      if (!texto) return true;
      return (
        c.nombre.toLowerCase().includes(texto) ||
        (c.cliente ?? "").toLowerCase().includes(texto) ||
        (c.faena ?? "").toLowerCase().includes(texto)
      );
    });
  }, [cotizaciones, busqueda, empresaFiltro, tipoFiltro, estadoFiltro, fechaDesde, fechaHasta]);

  const hayFiltrosActivos =
    busqueda.trim() !== "" ||
    empresaFiltro !== "todas" ||
    tipoFiltro !== "todos" ||
    estadoFiltro !== "todos" ||
    fechaDesde !== "" ||
    fechaHasta !== "";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proyecto, cliente o faena…"
          className="h-9 w-full max-w-xs rounded-lg border border-borde bg-white px-3 text-sm outline-none focus:border-naranjo/50"
        />
        <select
          value={empresaFiltro}
          onChange={(e) => setEmpresaFiltro(e.target.value)}
          className="h-9 rounded-lg border border-borde bg-white px-3 text-sm outline-none focus:border-naranjo/50"
        >
          <option value="todas">Empresa: todas</option>
          {EMPRESAS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className="h-9 rounded-lg border border-borde bg-white px-3 text-sm outline-none focus:border-naranjo/50"
        >
          <option value="todos">Tipo: todos</option>
          <option value="spot">SPOT</option>
          <option value="contrato_permanente">Contrato permanente</option>
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
          className="h-9 rounded-lg border border-borde bg-white px-3 text-sm outline-none focus:border-naranjo/50"
        >
          <option value="todos">Estado: todos</option>
          <option value="borrador">Borrador</option>
          <option value="emitida">Emitida</option>
          <option value="adjudicada">Adjudicada</option>
          <option value="perdida">Perdida</option>
        </select>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-tinta/50">Actualizado</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            title="Desde"
            className="h-9 rounded-lg border border-borde bg-white px-2 text-sm outline-none focus:border-naranjo/50"
          />
          <span className="text-xs text-tinta/40">–</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            title="Hasta"
            className="h-9 rounded-lg border border-borde bg-white px-2 text-sm outline-none focus:border-naranjo/50"
          />
        </div>
        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setEmpresaFiltro("todas");
              setTipoFiltro("todos");
              setEstadoFiltro("todos");
              setFechaDesde("");
              setFechaHasta("");
            }}
            className="h-9 rounded-lg border border-borde bg-white px-3 text-xs font-semibold text-tinta/60 transition hover:border-naranjo/50 hover:text-naranjo"
          >
            Limpiar filtros
          </button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-tinta/50">
          {filtradas.length} de {cotizaciones.length} cotizaciones
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-borde bg-white">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col style={{ width: 210 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 56 }} />
            <col style={{ width: 108 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              <th className="px-3 py-3">Proyecto</th>
              <th className="px-3 py-3">Empresa</th>
              <th className="px-3 py-3">Cliente</th>
              <th className="px-3 py-3">Faena</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Rev.</th>
              <th className="px-3 py-3 text-right">Monto neto/mes</th>
              <th className="px-3 py-3 text-right">Margen</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3 text-right">Actualizado</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => (
              <tr key={c.id} className="border-b border-borde last:border-0 hover:bg-crema/40">
                <td className="px-3 py-3 font-medium text-tinta">
                  <Link href={`/cotizador/${c.id}`} title={c.nombre} className="block truncate hover:text-naranjo">
                    {c.nombre}
                  </Link>
                  {c.esDemo && (
                    <span
                      title="Cotización de ejemplo — cifras ilustrativas, no corresponden a un documento real"
                      className="mt-1 inline-block rounded-full border border-naranjo/40 bg-naranjo/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-naranjo"
                    >
                      Ejemplo
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-tinta/60">
                  <span className="block truncate" title={c.empresa}>
                    {c.empresa}
                  </span>
                </td>
                <td className="px-3 py-3 text-tinta/60">
                  <span className="block truncate" title={c.cliente ?? undefined}>
                    {c.cliente ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3 text-tinta/60">
                  <span className="block truncate" title={c.faena ?? undefined}>
                    {c.faena ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-gris/10 px-2 py-0.5 text-[11px] font-semibold text-gris">
                    {c.tipoServicio === "spot" ? "SPOT" : "Permanente"}
                  </span>
                </td>
                <td className="px-3 py-3 text-tinta/50">{c.rev}</td>
                <td className="px-3 py-3 text-right font-semibold text-tinta">{money(c.summary?.ecoTotalNeto ?? 0)}</td>
                <td className="px-3 py-3 text-right text-teal">{pct(c.summary?.margenEfectivoTotal ?? 0)}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_CLASES[c.estado] ?? ESTADO_CLASES.borrador}`}
                  >
                    {etiquetaEstado(c.estado)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-tinta/50">{fechaCl(c.actualizadoEn)}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-2.5">
                    <Link href={`/cotizador/${c.id}`} className="text-xs font-medium text-tinta/70 hover:text-naranjo">
                      Editar
                    </Link>
                    {puedeEliminar && (
                      <BotonEliminar
                        accion={eliminarCotizacionAction}
                        id={c.id}
                        mensajeConfirmacion={`¿Eliminar "${c.nombre}"?`}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-tinta/50">
                  {cotizaciones.length === 0
                    ? <>Aún no hay cotizaciones. Cree la primera con &ldquo;+ Nueva cotización&rdquo;.</>
                    : hayFiltrosActivos
                      ? "Ningún resultado con esos filtros."
                      : "Aún no hay cotizaciones."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
