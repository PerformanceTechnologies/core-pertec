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

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return cotizaciones.filter((c) => {
      if (empresaFiltro !== "todas" && c.empresa !== empresaFiltro) return false;
      if (!texto) return true;
      return (
        c.nombre.toLowerCase().includes(texto) ||
        (c.cliente ?? "").toLowerCase().includes(texto) ||
        (c.faena ?? "").toLowerCase().includes(texto)
      );
    });
  }, [cotizaciones, busqueda, empresaFiltro]);

  const hayFiltrosActivos = busqueda.trim() !== "" || empresaFiltro !== "todas";

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
        <div className="flex-1" />
        <span className="text-xs text-tinta/50">
          {filtradas.length} de {cotizaciones.length} cotizaciones
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-borde bg-white">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-borde bg-crema/60 text-xs uppercase text-tinta/50">
            <tr>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Faena</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Rev.</th>
              <th className="px-4 py-3 text-right">Monto neto/mes</th>
              <th className="px-4 py-3 text-right">Margen</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Actualizado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => (
              <tr key={c.id} className="border-b border-borde last:border-0 hover:bg-crema/40">
                <td className="px-4 py-3 font-medium text-tinta">
                  <Link href={`/cotizador/${c.id}`} className="hover:text-naranjo">
                    {c.nombre}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-tinta/60">{c.empresa}</td>
                <td className="px-4 py-3 text-tinta/60">{c.cliente ?? "—"}</td>
                <td className="px-4 py-3 text-tinta/60">{c.faena ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gris/10 px-2 py-0.5 text-[11px] font-semibold text-gris">
                    {c.tipoServicio === "spot" ? "SPOT" : "Permanente"}
                  </span>
                </td>
                <td className="px-4 py-3 text-tinta/50">{c.rev}</td>
                <td className="px-4 py-3 text-right font-semibold text-tinta">{money(c.summary?.ecoTotalNeto ?? 0)}</td>
                <td className="px-4 py-3 text-right text-teal">{pct(c.summary?.margenEfectivoTotal ?? 0)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_CLASES[c.estado] ?? ESTADO_CLASES.borrador}`}
                  >
                    {etiquetaEstado(c.estado)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-tinta/50">{fechaCl(c.actualizadoEn)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
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
