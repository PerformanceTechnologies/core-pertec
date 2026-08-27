"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OfertaResumen } from "@/lib/ofertas/datos";
import { FILTROS_VACIOS, filtrarOfertas, hayFiltros, type FiltrosDeOfertas } from "@/lib/ofertas/filtros";
import { EMPRESAS } from "@/lib/cotizador/empresas";
import { fechaCl } from "@/lib/cotizador/formato";
import { TARJETA } from "@/lib/estilos";
import { duplicarOfertaAction, eliminarOfertaAction } from "@/app/(protegido)/ofertas/acciones";

/**
 * El listado de ofertas, con su buscador y sus filtros.
 *
 * Es un componente de cliente porque el listado ya viene entero del servidor: buscar
 * es filtrar lo que está en pantalla, sin ida y vuelta ni recarga por cada tecla. La
 * regla vive aparte, en lib/ofertas/filtros.ts, para poder probarla sin abrir la
 * pantalla.
 *
 * Con tres ofertas nada de esto hace falta; con las de un año, sí — y la búsqueda es
 * por lo que uno recuerda de una oferta: el número, el servicio, el cliente, la
 * faena. Para el admin, que es el único que ve las de todos, también por quién la
 * hizo.
 */
export default function TablaOfertas({
  ofertas,
  autores,
}: {
  ofertas: OfertaResumen[];
  /** id → nombre de quien creó cada oferta; solo llega cuando mira el admin. */
  autores?: Record<string, string>;
}) {
  const [filtros, setFiltros] = useState<FiltrosDeOfertas>(FILTROS_VACIOS);
  const cambiar = (parte: Partial<FiltrosDeOfertas>) => setFiltros((previos) => ({ ...previos, ...parte }));

  const visibles = useMemo(() => filtrarOfertas(ofertas, filtros, autores), [ofertas, filtros, autores]);
  // Pendientes, no el total: marcar un aviso como revisado tiene que bajar este
  // número, que es justamente para lo que sirve marcarlo.
  const porRevisar = ofertas.filter((o) => o.pendientes > 0).length;
  const autorDe = (oferta: OfertaResumen) => (oferta.creadoPor && autores?.[oferta.creadoPor]) || null;

  const control =
    "h-9 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50";

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filtros.texto}
          onChange={(e) => cambiar({ texto: e.target.value })}
          placeholder="Buscar por número, servicio, cliente o faena…"
          className={`${control} w-full sm:max-w-sm`}
        />
        <select
          value={filtros.estado}
          onChange={(e) => cambiar({ estado: e.target.value })}
          className={control}
        >
          <option value="todos">Estado: todos</option>
          <option value="borrador">Borrador</option>
          <option value="emitida">Emitida</option>
        </select>
        <select
          value={filtros.empresa}
          onChange={(e) => cambiar({ empresa: e.target.value })}
          className={control}
        >
          <option value="todas">Empresa: todas</option>
          {EMPRESAS.map((empresa) => (
            <option key={empresa} value={empresa}>
              {empresa}
            </option>
          ))}
        </select>
        {/* El filtro propio de este módulo: lo que hay que mirar antes de emitir.
            Va como interruptor y no como una opción más de un desplegable porque es
            una pregunta de sí o no y es la que más se hace acá. */}
        <label
          className={`flex cursor-pointer items-center gap-2 ${control} ${
            filtros.soloPorRevisar ? "border-naranjo/60 text-naranjo" : "text-tinta/60"
          }`}
        >
          <input
            type="checkbox"
            checked={filtros.soloPorRevisar}
            onChange={(e) => cambiar({ soloPorRevisar: e.target.checked })}
            className="h-3.5 w-3.5 accent-naranjo"
          />
          <span className="text-xs font-medium">Con algo por revisar</span>
        </label>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-tinta/50">Modificada</label>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => cambiar({ desde: e.target.value })}
            title="Desde"
            className={`${control} px-2`}
          />
          <span className="text-xs text-tinta/40">–</span>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            title="Hasta"
            className={`${control} px-2`}
          />
        </div>
        {hayFiltros(filtros) && (
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_VACIOS)}
            className="h-9 rounded-lg border border-borde bg-superficie px-3 text-xs font-semibold text-tinta/60 transition hover:border-naranjo/50 hover:text-naranjo"
          >
            Limpiar filtros
          </button>
        )}
        <div className="hidden flex-1 sm:block" />
        {/* La cuenta dice las dos: cuántas se están viendo y cuántas hay. Con un
            filtro puesto, "3 ofertas" a secas hace dudar de si se perdió algo. */}
        <span className="text-xs tabular-nums text-tinta/50">
          {visibles.length} de {ofertas.length} oferta{ofertas.length === 1 ? "" : "s"}
          {porRevisar > 0 && <span className="text-naranjo"> · {porRevisar} con algo por revisar</span>}
        </span>
      </div>

      {visibles.length === 0 ? (
        <p className="mt-6 text-sm text-tinta/50">
          Ninguna oferta coincide con lo que buscaste.{" "}
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_VACIOS)}
            className="font-semibold text-naranjo underline"
          >
            Limpiar los filtros
          </button>
        </p>
      ) : (
        <div className={`mt-2 overflow-x-auto ${TARJETA}`}>
          <table className="w-full text-sm">
            {/* Los anchos se declaran para pantalla grande; en chica dos columnas
                no se dibujan (hidden) y el resto se reparte el espacio solo. */}
            <colgroup>
              <col />
              <col style={{ width: "22%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-borde text-left text-[11px] uppercase tracking-wide text-tinta/45">
                <th className="px-3 py-3 font-medium sm:px-4">Oferta</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Cliente</th>
                <th className="px-3 py-3 font-medium sm:px-4">Estado</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Por revisar</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Modificada</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((o) => (
                <tr key={o.id} className="border-b border-borde/60 last:border-0">
                  <td className="break-words px-3 py-3 sm:px-4">
                    <Link
                      href={`/ofertas/${o.id}`}
                      className="font-medium text-tinta transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                    >
                      {o.nombre}
                    </Link>
                    {(o.faena || autorDe(o)) && (
                      <span className="block text-[11px] text-tinta/45">
                        {[o.faena, autorDe(o)].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {/* El cliente y la fecha, que en chico no tienen columna, se leen
                        acá abajo: esconder una columna no puede ser perder el dato.
                        El ancho mínimo de una tabla es la suma de sus columnas, y
                        "Por revisar" no baja de lo que mide su propio título: con
                        seis columnas la tabla no cabía y quedaba cortada. */}
                    <span className="mt-0.5 block text-[11px] text-tinta/45 sm:hidden">
                      {o.cliente ?? "Sin cliente"} · {fechaCl(o.actualizadoEn)}
                      {o.pendientes > 0 && (
                        <span className="font-semibold text-naranjo"> · {o.pendientes} por revisar</span>
                      )}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-tinta/70 sm:table-cell">{o.cliente ?? "—"}</td>
                  <td className="px-3 py-3 sm:px-4">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        o.estado === "emitida" ? "bg-teal/10 text-teal" : "bg-gris/10 text-gris"
                      }`}
                    >
                      {o.estado === "emitida" ? "Emitida" : "Borrador"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums sm:table-cell">
                    {/* "Nada" y "Revisado" no son lo mismo, y la diferencia importa:
                        una oferta sin controles levantados no es igual a una donde
                        alguien miró nueve cosas y decidió que estaban bien. */}
                    {o.pendientes > 0 ? (
                      <span className="font-semibold text-naranjo">{o.pendientes}</span>
                    ) : o.cantidadInconsistencias > 0 ? (
                      <span className="text-teal" title={`${o.cantidadInconsistencias} revisados`}>
                        Revisado
                      </span>
                    ) : (
                      <span className="text-teal">Nada</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-[11px] tabular-nums text-tinta/50 sm:table-cell">
                    {fechaCl(o.actualizadoEn)}
                  </td>
                  <td className="px-3 py-3 text-right sm:px-4">
                    <div className="flex items-center justify-end gap-3">
                      {/* Duplicar vale para las dos: de una emitida es como se hace
                          la siguiente parecida, que es su caso principal. */}
                      <form action={duplicarOfertaAction}>
                        <input type="hidden" name="id" value={o.id} />
                        <button
                          type="submit"
                          title="Crear un borrador nuevo con este contenido"
                          className="text-[11px] font-medium text-tinta/40 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                        >
                          Duplicar
                        </button>
                      </form>
                      {/* Eliminar, solo los borradores: una emitida ya salió para
                          afuera y su registro es lo único que queda de lo que se
                          mandó. */}
                      {o.estado === "borrador" && (
                        <form action={eliminarOfertaAction}>
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            className="text-[11px] font-medium text-tinta/40 transition-colors hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                          >
                            Eliminar
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
