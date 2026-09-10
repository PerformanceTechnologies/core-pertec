"use client";

import { useMemo, useState } from "react";
import { money, pct, fechaCl } from "@/lib/cotizador/formato";
import { PASTILLA_ESTADO } from "@/lib/estilos";
import type { FilaVenta } from "@/lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  ESTADO_FILTROS,
  GRUPOS_DE_ESTADO,
  arriendoActivo,
  arriendoAtrasado,
  cotizacionVencida,
  diasDesde,
  filtrarVentas,
  hoyEnChileIso,
  ordenarVentas,
  resumirVentas,
  type CampoOrden,
  type Criterios,
} from "@/lib/panel-odoo/ventas-filtro";
import {
  arriendosPorEstado,
  avisos as avisosDeVentas,
  dondeEstaLaPlata,
  porVendedor,
  rangoDelMes,
  tendenciaMensual,
  vencimientosDeArriendo,
} from "@/lib/panel-odoo/ventas-series";
import { traducir, ESTADOS_VENTA, ESTADOS_ARRIENDO } from "@/lib/panel-odoo/traducciones";
import ModalDetalleVenta from "./ModalDetalleVenta";
import {
  GraficoArriendosPorEstado,
  GraficoDondeEstaLaPlata,
  GraficoTendenciaVentas,
  GraficoVencimientos,
  GraficoVendedoresVentas,
} from "./graficos-ventas";

const POR_TANDA = 40;

const COLUMNAS: { campo: CampoOrden; etiqueta: string; alinear?: "derecha" }[] = [
  { campo: "partner_nombre", etiqueta: "Cliente" },
  { campo: "fecha_orden", etiqueta: "Fecha" },
  { campo: "monto_total", etiqueta: "Total", alinear: "derecha" },
  { campo: "monto_por_facturar", etiqueta: "Por facturar", alinear: "derecha" },
  { campo: "margen_porcentaje", etiqueta: "Margen", alinear: "derecha" },
  { campo: "fecha_fin_arriendo", etiqueta: "Fin arriendo" },
];

const CLASES_ESTADO: Record<string, string> = {
  draft: "bg-gris/15 text-gris",
  sent: "bg-naranjo-suave/15 text-naranjo",
  sale: "bg-teal/10 text-teal",
};

export default function DetalleVentas({ ventas }: { ventas: FilaVenta[] }) {
  const [criterios, setCriterios] = useState<Criterios>(CRITERIOS_INICIALES);
  const [mostradas, setMostradas] = useState(POR_TANDA);
  const [seleccionada, setSeleccionada] = useState<FilaVenta | null>(null);
  const [verGraficos, setVerGraficos] = useState(true);

  const hoy = useMemo(() => hoyEnChileIso(), []);

  const visibles = useMemo(
    () => ordenarVentas(filtrarVentas(ventas, criterios, hoy), criterios.orden, criterios.sentido),
    [ventas, criterios, hoy],
  );
  const resumen = useMemo(() => resumirVentas(visibles, hoy), [visibles, hoy]);

  // Los gráficos se calculan sobre lo FILTRADO: la tabla y los gráficos contestan la
  // misma pregunta.
  const series = useMemo(
    () => ({
      tendencia: tendenciaMensual(visibles),
      plata: dondeEstaLaPlata(visibles),
      arriendos: arriendosPorEstado(visibles),
      vendedores: porVendedor(visibles),
      vencimientos: vencimientosDeArriendo(visibles, hoy),
    }),
    [visibles, hoy],
  );

  // Los avisos van sobre TODO y no sobre lo filtrado: son la tarea pendiente completa, y
  // esconderlos al filtrar los volvería inútiles.
  const avisos = useMemo(() => avisosDeVentas(ventas, hoy), [ventas, hoy]);

  const vendedores = useMemo(
    () => [...new Set(ventas.map((v) => v.vendedor ?? "Sin asignar"))].sort((a, b) => a.localeCompare(b, "es")),
    [ventas],
  );

  const mesElegido = useMemo(() => {
    if (!criterios.desde || !criterios.hasta) return null;
    const mes = criterios.desde.slice(0, 7);
    const rango = rangoDelMes(mes);
    return rango.desde === criterios.desde && rango.hasta === criterios.hasta ? mes : null;
  }, [criterios.desde, criterios.hasta]);

  function cambiar(parcial: Partial<Criterios>) {
    setCriterios((previos) => ({ ...previos, ...parcial }));
    setMostradas(POR_TANDA);
  }

  function alElegirMes(mes: string) {
    if (mesElegido === mes) return cambiar({ desde: "", hasta: "" });
    cambiar(rangoDelMes(mes));
  }
  const alternarEstado = (filtro: string) => cambiar({ estado: criterios.estado === filtro ? "" : filtro });
  const alternarVendedor = (v: string) => cambiar({ vendedor: criterios.vendedor === v ? "" : v });

  function ordenarPor(campo: CampoOrden) {
    cambiar(
      criterios.orden === campo
        ? { sentido: criterios.sentido === "asc" ? "desc" : "asc" }
        : { orden: campo, sentido: "desc" },
    );
  }

  const hayFiltro =
    criterios.texto !== "" ||
    criterios.estado !== "" ||
    criterios.vendedor !== "" ||
    criterios.desde !== "" ||
    criterios.hasta !== "";

  return (
    <div>
      {/* Lo que pide una acción hoy, contado y con su plata. */}
      {avisos.length > 0 && (
        <div className="mb-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-tinta/70">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">Requiere atención</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {avisos.map((a) => (
              <button
                key={a.filtro}
                type="button"
                onClick={() => alternarEstado(a.filtro)}
                className="text-left underline decoration-dotted underline-offset-2 transition hover:text-naranjo"
              >
                <strong className="font-semibold text-tinta">{a.cantidad}</strong> {a.texto}
                {a.monto > 0 && <span className="text-tinta/50"> ({money(a.monto)})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buscador y filtros */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          type="search"
          value={criterios.texto}
          onChange={(e) => cambiar({ texto: e.target.value })}
          placeholder="Buscar por cliente, número, referencia…"
          aria-label="Buscar órdenes"
          className="col-span-2 rounded-lg border border-borde px-3 py-2 text-xs text-tinta placeholder:text-tinta/40 focus:border-teal focus:outline-none"
        />
        <select
          value={criterios.estado}
          onChange={(e) => cambiar({ estado: e.target.value })}
          aria-label="Estado"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todas las órdenes</option>
          {GRUPOS_DE_ESTADO.map((grupo) => (
            <optgroup key={grupo} label={grupo}>
              {ESTADO_FILTROS.filter((e) => e.grupo === grupo).map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.etiqueta}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={criterios.vendedor}
          onChange={(e) => cambiar({ vendedor: e.target.value })}
          aria-label="Vendedor"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          Desde
          <input
            type="date"
            value={criterios.desde}
            onChange={(e) => cambiar({ desde: e.target.value })}
            aria-label="Desde"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          hasta
          <input
            type="date"
            value={criterios.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            aria-label="Hasta"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
      </div>

      {/* Lo que está filtrado, y cómo sacarlo */}
      {hayFiltro && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-tinta/40">Filtrando por</span>
          {criterios.texto && <Chip texto={`"${criterios.texto}"`} onQuitar={() => cambiar({ texto: "" })} />}
          {criterios.estado && (
            <Chip
              texto={ESTADO_FILTROS.find((e) => e.valor === criterios.estado)?.etiqueta ?? criterios.estado}
              onQuitar={() => cambiar({ estado: "" })}
            />
          )}
          {criterios.vendedor && <Chip texto={criterios.vendedor} onQuitar={() => cambiar({ vendedor: "" })} />}
          {(criterios.desde || criterios.hasta) && (
            <Chip
              texto={
                mesElegido
                  ? mesElegido
                  : `${criterios.desde ? fechaCl(criterios.desde) : "…"} a ${criterios.hasta ? fechaCl(criterios.hasta) : "…"}`
              }
              onQuitar={() => cambiar({ desde: "", hasta: "" })}
            />
          )}
          <button
            type="button"
            onClick={() => cambiar(CRITERIOS_INICIALES)}
            className="rounded-full border border-borde px-2 py-0.5 text-[11px] font-semibold text-tinta/50 transition hover:bg-crema hover:text-tinta"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Resumen de lo que quedó a la vista */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-crema/60 px-3 py-2 text-[11px] text-tinta/60">
        <span>
          <strong className="text-tinta">{resumen.cantidad}</strong> orden{resumen.cantidad === 1 ? "" : "es"}
        </span>
        <span>
          Cotizado <strong className="text-tinta">{resumen.cotizaciones}</strong> ({money(resumen.montoCotizado)})
        </span>
        <span>
          Confirmado <strong className="text-teal">{resumen.confirmadas}</strong> ({money(resumen.montoConfirmado)})
        </span>
        <span>
          Por facturar <strong className="text-naranjo">{money(resumen.montoPorFacturar)}</strong>
        </span>
        <span>
          Cierre{" "}
          <strong className="text-tinta">{resumen.tasaDeCierre === null ? "—" : pct(resumen.tasaDeCierre, 0)}</strong>
        </span>
        <span>
          Arriendos en curso <strong className="text-tinta">{resumen.arriendosActivos}</strong> (
          {money(resumen.montoArriendosActivos)})
        </span>
        {resumen.arriendosAtrasados > 0 && (
          <span>
            Pasados de fecha <strong className="text-red-600">{resumen.arriendosAtrasados}</strong>
          </span>
        )}
      </div>

      {/* Gráficos */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
          Gráficos <span className="font-normal normal-case text-tinta/35">— hacé clic para filtrar</span>
        </p>
        <button
          type="button"
          onClick={() => setVerGraficos((v) => !v)}
          aria-expanded={verGraficos}
          className="rounded-lg border border-borde px-2 py-1 text-[11px] font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta"
        >
          {verGraficos ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {verGraficos && (
        <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {/* Primero los de una columna, en pares, y al final los que van a lo ancho: un
              panel de una columna seguido de uno de dos deja la fila con un hueco. */}
          <Panel titulo="Arriendos por estado">
            <GraficoArriendosPorEstado estados={series.arriendos} onElegir={alternarEstado} />
          </Panel>
          <Panel titulo="Cotizado y confirmado por vendedor">
            <GraficoVendedoresVentas vendedores={series.vendedores} onElegir={alternarVendedor} />
          </Panel>
          <Panel titulo="Dónde está la plata">
            <GraficoDondeEstaLaPlata porciones={series.plata} onElegir={alternarEstado} />
          </Panel>
          <Panel titulo="Cuándo terminan los arriendos en curso">
            <GraficoVencimientos
              tramos={series.vencimientos}
              onElegirAtrasados={() => alternarEstado("arriendos_atrasados")}
            />
          </Panel>
          <Panel titulo="Cotizado, confirmado y arrendado por mes" ancho>
            <GraficoTendenciaVentas datos={series.tendencia} onElegirMes={alElegirMes} mesElegido={mesElegido} />
          </Panel>
        </div>
      )}

      {/* Tabla */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead>
            <tr className="border-b border-borde text-[10px] uppercase tracking-wide text-tinta/45">
              {COLUMNAS.map((c) => {
                const activa = criterios.orden === c.campo;
                return (
                  <th key={c.campo} scope="col" className={`py-2 font-semibold ${c.alinear === "derecha" ? "text-right" : ""}`}>
                    <button
                      type="button"
                      onClick={() => ordenarPor(c.campo)}
                      aria-label={`Ordenar por ${c.etiqueta}`}
                      className={`transition hover:text-tinta ${activa ? "text-teal" : ""}`}
                    >
                      {c.etiqueta}
                      {activa && <span aria-hidden> {criterios.sentido === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="py-2 pl-3 font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.slice(0, mostradas).map((v) => {
              const atrasado = arriendoAtrasado(v, hoy);
              const vencida = cotizacionVencida(v, hoy);
              const faltan = v.fecha_fin_arriendo ? -(diasDesde(v.fecha_fin_arriendo, hoy) ?? 0) : null;
              return (
                <tr
                  key={v.odoo_id}
                  onClick={() => setSeleccionada(v)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSeleccionada(v);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-crema/60"
                >
                  <td className="max-w-[220px] py-2 pr-3">
                    <p title={v.partner_nombre ?? ""} className="truncate text-tinta/80">
                      {v.partner_nombre ?? "Sin cliente"}
                    </p>
                    <p className="truncate text-[10px] text-tinta/40">
                      {v.numero ?? `#${v.odoo_id}`}
                      {v.vendedor ? ` · ${v.vendedor}` : ""}
                    </p>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-tinta/55">
                    {v.fecha_orden ? fechaCl(v.fecha_orden) : "-"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold text-tinta">
                    {money(v.monto_total)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-tinta/70">
                    {(v.monto_por_facturar ?? 0) > 0 ? (
                      <span className="text-naranjo">{money(v.monto_por_facturar ?? 0)}</span>
                    ) : (
                      <span className="text-tinta/30">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-tinta/60">
                    {v.margen_porcentaje ? (
                      <span className={v.margen_bajo && !v.margen_aprobado ? "font-semibold text-red-600" : ""}>
                        {Math.round(v.margen_porcentaje)}%
                      </span>
                    ) : (
                      <span className="text-tinta/30">—</span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap py-2 pr-3 ${atrasado ? "font-semibold text-red-600" : "text-tinta/55"}`}>
                    {v.es_arriendo && v.fecha_fin_arriendo ? (
                      <>
                        {fechaCl(v.fecha_fin_arriendo)}
                        {arriendoActivo(v) && faltan !== null && (
                          <span className="ml-1 text-[10px]">
                            ({faltan >= 0 ? `en ${faltan} d` : `hace ${-faltan} d`})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-tinta/30">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`${PASTILLA_ESTADO} ${CLASES_ESTADO[v.estado] ?? "bg-gris/15 text-gris"}`}>
                        {traducir(ESTADOS_VENTA, v.estado)}
                      </span>
                      {v.es_arriendo && (
                        <span className="rounded-full border border-teal/30 bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                          {traducir(ESTADOS_ARRIENDO, v.estado_arriendo)}
                        </span>
                      )}
                      {atrasado && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Pasado de fecha
                        </span>
                      )}
                      {vencida && (
                        <span className="rounded-full border border-naranjo/30 bg-naranjo/10 px-1.5 py-0.5 text-[10px] font-semibold text-naranjo">
                          Validez vencida
                        </span>
                      )}
                      {v.tiene_danos === true && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Daños
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibles.length === 0 && (
        <p className="mt-4 text-center text-xs text-tinta/40">Ninguna orden calza con los filtros.</p>
      )}

      {visibles.length > mostradas && (
        <button
          type="button"
          onClick={() => setMostradas((n) => n + POR_TANDA)}
          className="mt-3 w-full rounded-lg border border-borde py-2 text-xs font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta"
        >
          Ver {Math.min(POR_TANDA, visibles.length - mostradas)} más (de {visibles.length})
        </button>
      )}

      {seleccionada && <ModalDetalleVenta venta={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </div>
  );
}

/** Un filtro activo, con su × para sacarlo. */
function Chip({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
      {texto}
      <button type="button" onClick={onQuitar} aria-label={`Quitar filtro ${texto}`} className="text-teal/70 hover:text-teal">
        ✕
      </button>
    </span>
  );
}

function Panel({ titulo, ancho, children }: { titulo: string; ancho?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-borde bg-crema/40 p-3 ${ancho ? "xl:col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold text-tinta/55">{titulo}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
