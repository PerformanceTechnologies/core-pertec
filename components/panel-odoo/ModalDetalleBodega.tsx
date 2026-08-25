"use client";

import { useEffect } from "react";
import { money } from "@/lib/cotizador/formato";
import type { FilaBodega, FilaStockBodega } from "@/lib/panel-odoo/datos";

/**
 * Lo que hay dentro de una bodega.
 *
 * A diferencia de los otros modales del panel, este no muestra las seis casillas
 * de un documento sino una tabla: la pregunta de una bodega es "qué hay adentro",
 * y eso son filas. Arriba sus totales, abajo el detalle producto por producto,
 * ordenado por lo que tenga sentido: por valor si hay costos cargados en Odoo y por
 * cantidad si no, porque con todos los valores en cero el orden quedaría al azar.
 *
 * El tope se dice a la vista y no se esconde: son las primeras N, no todo el
 * inventario. La bodega completa está en Odoo, y una tabla de mil filas en un modal
 * no sirve para decidir nada.
 */
export default function ModalDetalleBodega({
  bodega,
  stock,
  tope,
  onCerrar,
}: {
  bodega: FilaBodega;
  stock: FilaStockBodega[];
  tope: number;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const cantidad = (valor: number) => valor.toLocaleString("es-CL", { maximumFractionDigits: 2 });
  // Las columnas de plata solo si esta bodega tiene algo valorizado: una tabla de
  // cincuenta filas en "$0" no dice nada y tapa lo que sí importa.
  const hayValor = stock.some((f) => f.valor > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-borde bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-condensed text-lg font-bold uppercase text-tinta">{bodega.nombre}</h2>
            {bodega.codigo && (
              <p className="text-[11px] uppercase tracking-wide text-tinta/45">{bodega.codigo}</p>
            )}
          </div>
          <button
            onClick={onCerrar}
            className="rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Casilla etiqueta="Unidades" valor={cantidad(bodega.unidades)} color="text-naranjo" />
          <Casilla etiqueta="Productos" valor={String(bodega.productos_distintos)} />
          <Casilla
            etiqueta="Valorizado"
            valor={hayValor ? money(bodega.valor_inventario) : "Sin costos"}
            color={hayValor ? "text-teal" : "text-tinta/40"}
          />
          <Casilla
            etiqueta="Transferencias"
            valor={String(bodega.transferencias_pendientes)}
            color={bodega.transferencias_atrasadas > 0 ? "text-red-600" : "text-tinta"}
          />
        </div>

        {bodega.transferencias_atrasadas > 0 && (
          <p className="mt-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {bodega.transferencias_atrasadas} de las {bodega.transferencias_pendientes} transferencias
            pendientes tienen la fecha programada vencida.
          </p>
        )}

        {bodega.unidades_reservadas > 0 && (
          <p className="mt-3 shrink-0 text-[11px] text-tinta/45">
            {cantidad(bodega.unidades_reservadas)} unidades están reservadas por transferencias o ventas ya
            comprometidas.
          </p>
        )}

        <p className="mt-4 shrink-0 text-xs font-semibold uppercase tracking-wide text-tinta/45">
          {stock.length === 0
            ? "Sin stock registrado"
            : stock.length >= tope
              ? `Los ${tope} productos con más ${hayValor ? "valor" : "stock"}`
              : `${stock.length} producto${stock.length === 1 ? "" : "s"} con stock`}
        </p>

        {/* La tabla scrollea sola: el modal no crece más allá de la pantalla, así
            que el encabezado y los totales quedan siempre a la vista. */}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {stock.length === 0 ? (
            <p className="text-xs text-tinta/40">
              Esta bodega no tiene existencias en la última sincronización.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-borde text-left text-[10px] uppercase tracking-wide text-tinta/45">
                  <th className="py-1.5 font-semibold">Producto</th>
                  <th className="py-1.5 text-right font-semibold">Cantidad</th>
                  {hayValor ? (
                    <>
                      <th className="py-1.5 text-right font-semibold">Costo</th>
                      <th className="py-1.5 text-right font-semibold">Valor</th>
                    </>
                  ) : (
                    <th className="py-1.5 text-right font-semibold">Reservado</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {stock.map((fila) => (
                  <tr key={fila.producto_odoo_id}>
                    <td className="max-w-[280px] py-1.5 pr-2">
                      <span title={fila.producto_nombre} className="block truncate text-tinta/80">
                        {fila.producto_nombre}
                      </span>
                      <span className="block truncate text-[10px] text-tinta/40">
                        {[fila.codigo, fila.categoria].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-tinta/70">
                      {cantidad(fila.cantidad)}
                      {fila.unidad && <span className="ml-1 text-tinta/40">{fila.unidad}</span>}
                      {hayValor && fila.reservada > 0 && (
                        <span className="ml-1 text-[10px] text-naranjo" title="Reservado">
                          ({cantidad(fila.reservada)})
                        </span>
                      )}
                    </td>
                    {hayValor ? (
                      <>
                        <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-tinta/55">
                          {money(fila.costo_unitario)}
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right font-semibold tabular-nums text-tinta">
                          {money(fila.valor)}
                        </td>
                      </>
                    ) : (
                      <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-tinta/55">
                        {fila.reservada > 0 ? cantidad(fila.reservada) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-3 shrink-0 text-[10px] text-pretty text-tinta/40">
          {hayValor
            ? "Valorizado a costo estándar del producto, como lo informa Odoo. No es el saldo contable de la cuenta de existencias."
            : "Estos productos no tienen costo estándar cargado en Odoo, así que no hay nada que valorizar. En cuanto se carguen, el valor aparece acá."}
        </p>
      </div>
    </div>
  );
}

function Casilla({
  etiqueta,
  valor,
  color = "text-tinta",
}: {
  etiqueta: string;
  valor: string;
  color?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-crema/60 px-3 py-2">
      <p className="truncate text-[10px] uppercase text-tinta/45">{etiqueta}</p>
      <p className={`mt-0.5 truncate font-condensed text-base font-bold ${color}`}>{valor}</p>
    </div>
  );
}
