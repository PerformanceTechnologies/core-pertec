"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CotizacionResumen } from "@/lib/cotizador";
import { EMPRESAS } from "@/lib/cotizador/empresas";
import { money, pct } from "@/lib/cotizador/formato";
import { SOMBRA_CALIDA } from "@/lib/estilos";
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
          className="h-9 w-full rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50 sm:max-w-xs"
        />
        <select
          value={empresaFiltro}
          onChange={(e) => setEmpresaFiltro(e.target.value)}
          className="h-9 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50"
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
          className="h-9 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50"
        >
          <option value="todos">Tipo: todos</option>
          <option value="spot">SPOT</option>
          <option value="contrato_permanente">Contrato permanente</option>
          <option value="spot_turnos">Obra por turnos</option>
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
          className="h-9 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50"
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
            className="h-9 rounded-lg border border-borde bg-superficie px-2 text-sm text-tinta outline-none focus:border-naranjo/50"
          />
          <span className="text-xs text-tinta/40">–</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            title="Hasta"
            className="h-9 rounded-lg border border-borde bg-superficie px-2 text-sm text-tinta outline-none focus:border-naranjo/50"
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
            className="h-9 rounded-lg border border-borde bg-superficie px-3 text-xs font-semibold text-tinta/60 transition hover:border-naranjo/50 hover:text-naranjo"
          >
            Limpiar filtros
          </button>
        )}
        <div className="hidden flex-1 sm:block" />
        <span className="text-xs tabular-nums text-tinta/50">
          {filtradas.length} de {cotizaciones.length} cotizaciones
        </span>
      </div>

      {/* Dos layouts sobre los mismos datos.

          La tabla era table-fixed con diez columnas que suman 1116px y SIN min-w,
          así que bajo ese ancho no scrolleaba: comprimía las diez columnas
          proporcionalmente hasta que el nombre del proyecto quedaba en tres
          letras. En un celular era ilegible.

          Desde xl va la tabla; debajo, una tarjeta por cotización. El corte es xl
          y no lg porque con el sidebar de 256px un viewport de 1024 deja 688px de
          contenido, y ahí las diez columnas vuelven a comprimirse. */}
      <div
        className={`mt-4 hidden overflow-x-auto rounded-2xl border border-borde bg-superficie xl:block ${SOMBRA_CALIDA}`}
      >
        {/* OCHO columnas, no diez. Empresa y Rev. bajan a una segunda línea bajo el
            nombre del proyecto, igual que en las tarjetas.

            No es un capricho: las diez columnas sumaban 1116px y a xl, con el
            sidebar de 256px, quedan 944 de contenido, así que la tabla entraba en
            scroll horizontal en su propio breakpoint. Con ocho suman 944 justos. Y
            las dos que se fueron son las menos consultadas: la empresa casi
            siempre es la misma y la revisión importa una vez que ya estás dentro.

            El colgroup, el thead y cada fila TIENEN que tener el mismo número de
            columnas. Cuando no lo tuvieron, el encabezado quedó corrido y "Cliente"
            aparecía sobre la faena. Lo verifica scripts/verificar-tablas.mjs. */}
        <table className="w-full min-w-[944px] table-fixed text-left text-sm">
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 122 }} />
          </colgroup>
          <thead className="border-b border-borde bg-crema/60 text-[11px] font-medium text-tinta/50">
            <tr>
              <th className="px-3 py-3">Proyecto</th>
              <th className="px-3 py-3">Cliente</th>
              <th className="px-3 py-3">Faena</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3 text-right">Monto neto/mes</th>
              <th className="px-3 py-3 text-right">Margen</th>
              <th className="px-3 py-3">Estado</th>
              <th className="sticky right-0 z-10 border-l border-borde bg-crema/60 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => (
              <tr key={c.id} className="group border-b border-borde last:border-0 hover:bg-crema/40">
                <td className="px-3 py-3 font-medium text-tinta">
                  <Link
                    href={`/cotizador/${c.id}`}
                    title={c.nombre}
                    className="block truncate transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                  >
                    {c.nombre}
                  </Link>
                  <p className="truncate text-[11px] font-normal text-tinta/35" title={c.empresa}>
                    {c.empresa} · Rev. {c.rev}
                  </p>
                  {c.esDemo && <EtiquetaEjemplo />}
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
                  <PastillaTipo tipo={c.tipoServicio} />
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-tinta">
                  {money(c.summary?.ecoTotalNeto ?? 0)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-teal">
                  {pct(c.summary?.margenEfectivoTotal ?? 0)}
                </td>
                <td className="px-3 py-3">
                  <PastillaEstado estado={c.estado} />
                </td>
                <td className="sticky right-0 z-10 border-l border-borde bg-superficie px-3 py-3 text-right group-hover:bg-crema/40">
                  <Acciones id={c.id} nombre={c.nombre} puedeEliminar={puedeEliminar} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tarjetas bajo xl. La única duplicación con la tabla son las etiquetas de
          cada cifra, que en la tabla las da el encabezado y acá tienen que viajar
          con el dato: un "$4.200.000" suelto no dice si es el monto o el costo. */}
      <ul className="mt-4 flex flex-col gap-2 xl:hidden">
        {filtradas.map((c) => (
          <li
            key={c.id}
            className={`rounded-xl border border-borde bg-superficie px-4 py-3.5 ${SOMBRA_CALIDA}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/cotizador/${c.id}`}
                  title={c.nombre}
                  className="block truncate font-condensed text-base font-bold uppercase tracking-wide text-tinta transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                >
                  {c.nombre}
                </Link>
                <p className="mt-1 truncate text-xs text-tinta/50">
                  {c.cliente ?? "Sin cliente"}
                  {c.faena ? ` · ${c.faena}` : ""}
                </p>
                <p className="truncate text-[11px] text-tinta/35">
                  {c.empresa} · Rev. {c.rev}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <PastillaEstado estado={c.estado} />
                <PastillaTipo tipo={c.tipoServicio} />
              </div>
            </div>

            {c.esDemo && <EtiquetaEjemplo />}

            <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-borde pt-3">
              <div>
                <span className="block text-[10px] font-medium text-tinta/40">Monto neto/mes</span>
                <span className="text-sm font-semibold tabular-nums text-tinta">
                  {money(c.summary?.ecoTotalNeto ?? 0)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-medium text-tinta/40">Margen efectivo</span>
                <span className="text-sm tabular-nums text-teal">
                  {pct(c.summary?.margenEfectivoTotal ?? 0)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex justify-end border-t border-borde pt-3">
              <Acciones id={c.id} nombre={c.nombre} puedeEliminar={puedeEliminar} />
            </div>
          </li>
        ))}
      </ul>

      {filtradas.length === 0 && (
        <p className="mx-auto mt-4 max-w-[52ch] rounded-xl border border-dashed border-borde px-4 py-10 text-center text-sm text-pretty text-tinta/50">
          {cotizaciones.length === 0
            ? "Todavía no hay cotizaciones. Crea la primera con “Nueva cotización”."
            : hayFiltrosActivos
              ? "Ningún resultado con esos filtros."
              : "Todavía no hay cotizaciones."}
        </p>
      )}
    </div>
  );
}

/**
 * Piezas compartidas entre la tabla y las tarjetas.
 *
 * Existen para que las dos vistas no puedan divergir: si la pastilla de estado se
 * define dos veces, un cambio de color queda a medias y nadie lo nota hasta que
 * alguien mira las dos en la misma pantalla.
 */
function PastillaEstado({ estado }: { estado: CotizacionResumen["estado"] }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        ESTADO_CLASES[estado] ?? ESTADO_CLASES.borrador
      }`}
    >
      {etiquetaEstado(estado)}
    </span>
  );
}

function PastillaTipo({ tipo }: { tipo: CotizacionResumen["tipoServicio"] }) {
  return (
    <span className="shrink-0 rounded-md bg-gris/10 px-2 py-0.5 text-[11px] font-semibold text-gris">
      {tipo === "spot" ? "SPOT" : tipo === "spot_turnos" ? "Obra" : "Permanente"}
    </span>
  );
}

function EtiquetaEjemplo() {
  return (
    <span
      title="Cotización de ejemplo — cifras ilustrativas, no corresponden a un documento real"
      className="mt-2 inline-block rounded-md border border-naranjo/40 bg-naranjo/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-naranjo"
    >
      Ejemplo
    </span>
  );
}

function Acciones({ id, nombre, puedeEliminar }: { id: string; nombre: string; puedeEliminar: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <Link
        href={`/cotizador/${id}`}
        className="text-xs font-medium text-tinta/70 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        Editar
      </Link>
      {puedeEliminar && (
        <BotonEliminar
          accion={eliminarCotizacionAction}
          id={id}
          mensajeConfirmacion={`¿Eliminar "${nombre}"?`}
        />
      )}
    </div>
  );
}
