"use client";

import { useMemo, useState } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { FilaFactura } from "@/lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  ESTADO_FILTROS,
  estaVencida,
  filtrarFacturas,
  hoyEnChileIso,
  ordenarFacturas,
  resumirFacturas,
  type CampoOrden,
  type Criterios,
} from "@/lib/panel-odoo/facturas-filtro";
import { traducir, TIPOS_FACTURA, ESTADOS_FACTURA } from "@/lib/panel-odoo/traducciones";
import ModalDetalleFactura from "./ModalDetalleFactura";

// Cuántas filas se dibujan de una vez. Filtrar y ordenar se hace sobre TODAS
// las facturas (si no, "las cedidas" mostraría solo las cedidas de las
// primeras 50), pero pintarlas todas en el DOM del modal no aporta nada.
const POR_TANDA = 50;

const COLUMNAS: { campo: CampoOrden; etiqueta: string; alinear?: "derecha" }[] = [
  { campo: "partner_nombre", etiqueta: "Contraparte" },
  { campo: "fecha_factura", etiqueta: "Fecha" },
  { campo: "fecha_vencimiento", etiqueta: "Vence" },
  { campo: "monto_total", etiqueta: "Total", alinear: "derecha" },
  { campo: "monto_pendiente", etiqueta: "Pendiente", alinear: "derecha" },
];

export default function DetalleFacturas({ facturas }: { facturas: FilaFactura[] }) {
  const [criterios, setCriterios] = useState<Criterios>(CRITERIOS_INICIALES);
  const [mostradas, setMostradas] = useState(POR_TANDA);
  const [seleccionada, setSeleccionada] = useState<FilaFactura | null>(null);

  const hoy = useMemo(() => hoyEnChileIso(), []);

  const visibles = useMemo(
    () => ordenarFacturas(filtrarFacturas(facturas, criterios, hoy), criterios.orden, criterios.sentido),
    [facturas, criterios, hoy],
  );
  const resumen = useMemo(() => resumirFacturas(visibles, hoy), [visibles, hoy]);

  function cambiar(parcial: Partial<Criterios>) {
    setCriterios((previos) => ({ ...previos, ...parcial }));
    // Un filtro nuevo empieza de nuevo: si no, se quedaría mostrando 300 filas
    // de un resultado de 4.
    setMostradas(POR_TANDA);
  }

  function ordenarPor(campo: CampoOrden) {
    // Volver a apretar la misma columna da vuelta el sentido; una columna
    // nueva arranca descendente, que es lo que se quiere de una fecha o un
    // monto.
    cambiar(
      criterios.orden === campo
        ? { sentido: criterios.sentido === "asc" ? "desc" : "asc" }
        : { orden: campo, sentido: "desc" },
    );
  }

  const hayFiltro =
    criterios.texto !== "" || criterios.tipo !== "" || criterios.estado !== "" || criterios.desde !== "" || criterios.hasta !== "";

  return (
    <div>
      {/* Buscador y filtros */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          type="search"
          value={criterios.texto}
          onChange={(e) => cambiar({ texto: e.target.value })}
          placeholder="Buscar por número, cliente, RUT…"
          aria-label="Buscar facturas"
          className="col-span-2 rounded-lg border border-borde px-3 py-2 text-xs text-tinta placeholder:text-tinta/40 focus:border-teal focus:outline-none"
        />
        <select
          value={criterios.tipo}
          onChange={(e) => cambiar({ tipo: e.target.value })}
          aria-label="Tipo de documento"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_FACTURA).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select
          value={criterios.estado}
          onChange={(e) => cambiar({ estado: e.target.value })}
          aria-label="Estado"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los estados</option>
          {ESTADO_FILTROS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          Desde
          <input
            type="date"
            value={criterios.desde}
            onChange={(e) => cambiar({ desde: e.target.value })}
            aria-label="Fecha desde"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          Hasta
          <input
            type="date"
            value={criterios.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            aria-label="Fecha hasta"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
        {hayFiltro && (
          <button
            type="button"
            onClick={() => cambiar(CRITERIOS_INICIALES)}
            className="col-span-2 rounded-lg border border-borde px-2 py-1.5 text-xs font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta sm:col-span-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Resumen de lo que quedó a la vista */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-crema/60 px-3 py-2 text-[11px] text-tinta/60">
        <span>
          <strong className="text-tinta">{resumen.cantidad}</strong> factura{resumen.cantidad === 1 ? "" : "s"}
        </span>
        <span>
          Total <strong className="text-tinta">{money(resumen.total)}</strong>
        </span>
        <span>
          Pendiente <strong className="text-teal">{money(resumen.pendiente)}</strong>
        </span>
        <span>
          Cedidas <strong className="text-tinta">{resumen.cedidas}</strong> ({money(resumen.montoCedido)})
        </span>
        <span>
          Vencidas <strong className={resumen.vencidas > 0 ? "text-red-600" : "text-tinta"}>{resumen.vencidas}</strong>{" "}
          ({money(resumen.montoVencido)})
        </span>
      </div>

      {/* Encabezado ordenable */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
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
              <th scope="col" className="py-2 font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.slice(0, mostradas).map((f) => {
              const vencida = estaVencida(f, hoy);
              return (
                <tr
                  key={f.odoo_id}
                  onClick={() => setSeleccionada(f)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSeleccionada(f);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-crema/60"
                >
                  <td className="max-w-[200px] py-2 pr-3">
                    <p title={f.partner_nombre ?? ""} className="truncate text-tinta/80">
                      {f.partner_nombre ?? "-"}
                    </p>
                    <p className="truncate text-[10px] text-tinta/40">
                      {f.numero ?? `#${f.odoo_id}`}
                      {f.rut_contraparte ? ` · ${f.rut_contraparte}` : ""}
                    </p>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-tinta/55">
                    {f.fecha_factura ? fechaCl(f.fecha_factura) : "-"}
                  </td>
                  <td className={`whitespace-nowrap py-2 pr-3 ${vencida ? "font-semibold text-red-600" : "text-tinta/55"}`}>
                    {f.fecha_vencimiento ? fechaCl(f.fecha_vencimiento) : "-"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold text-tinta">{money(f.monto_total)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-tinta/70">{money(f.monto_pendiente)}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded-full border border-borde bg-crema px-1.5 py-0.5 text-[10px] text-tinta/60">
                        {traducir(ESTADOS_FACTURA, f.state)}
                      </span>
                      {f.cedida === "yielded" && (
                        <span className="rounded-full border border-teal/30 bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                          Cedida
                        </span>
                      )}
                      {f.dte_aceptacion === "claimed" && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Reclamada
                        </span>
                      )}
                      {vencida && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Vencida
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
        <p className="mt-4 text-center text-xs text-tinta/40">Ninguna factura calza con los filtros.</p>
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

      {seleccionada && <ModalDetalleFactura factura={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </div>
  );
}
