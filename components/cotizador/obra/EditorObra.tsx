"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { CotizacionCompleta } from "@/lib/cotizador";
import type { CatalogoCargo } from "@/lib/cotizador/catalogo-cargos-tipos";
import type { CargoObra, ItemObra, ObraInput } from "@/lib/cotizador/obra/tipos";
import { money, pct } from "@/lib/cotizador/formato";
import { puedeEnCotizador, type RolCotizador } from "@/lib/permisos-cotizador";
import { marcarEmitidaAction, crearNuevaVersionAction } from "@/app/(protegido)/cotizador/acciones";
import { TARJETA } from "@/lib/estilos";
import { useEditorObra } from "./useEditorObra";

/**
 * Editor de una obra (SPOT por turnos).
 *
 * Todo en una página y no en pestañas como el editor de cotizaciones mensuales:
 * una obra tiene cuatro bloques cortos —turnos, cuadrilla, ítems, márgenes— y el
 * total cambia con cada tecla. Repartirlos en pestañas obliga a saltar entre
 * ellas para ver el efecto de lo que se acaba de escribir, que es justo lo que
 * uno quiere ver al cotizar.
 */

const ETIQUETA_GUARDADO: Record<string, string> = {
  idle: "Sin cambios",
  saving: "Guardando…",
  saved: "Guardado",
  error: "Error al guardar",
};
const COLOR_GUARDADO: Record<string, string> = {
  idle: "text-tinta/40",
  saving: "text-naranjo",
  saved: "text-teal",
  error: "text-red-600",
};

const UNIDADES: ItemObra["unidad"][] = ["dia", "unidad", "global", "mes"];
const CATEGORIAS: ItemObra["categoria"][] = ["equipo_mayor", "transporte", "insumo", "servicio", "otro"];
const ETIQUETA_CATEGORIA: Record<ItemObra["categoria"], string> = {
  equipo_mayor: "Equipo mayor",
  transporte: "Transporte",
  insumo: "Insumo",
  servicio: "Servicio",
  otro: "Otro",
};

const campo =
  "w-full rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-naranjo/50";

function idNuevo(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function EditorObra({
  cotizacion,
  rol,
  catalogoCargos,
}: {
  cotizacion: CotizacionCompleta & { input: ObraInput };
  rol: RolCotizador;
  catalogoCargos: CatalogoCargo[];
}) {
  const [pendiente, iniciarTransicion] = useTransition();
  const puedeEditar = puedeEnCotizador(rol, "editar_cotizacion");
  const { obra, result, update, saveState, disabled } = useEditorObra(cotizacion, puedeEditar);

  const agregarCargo = (plantilla?: CatalogoCargo) => {
    const nuevo: CargoObra = {
      id: idNuevo(),
      cargo: plantilla?.cargo ?? "Nuevo cargo",
      personasPorTurno: 1,
      remuneracion: {
        clasificacion: plantilla?.clasificacion ?? "directo",
        tipoContrato: "plazo_fijo",
        modoSueldo: "base",
        base: plantilla?.baseReferencial ?? 0,
        bonos: plantilla?.bonosDefault ?? [],
        asigMovilizacion: plantilla?.asigMovilizacionReferencial ?? 0,
        asigColacion: plantilla?.asigColacionReferencial ?? 0,
        trabajaFestivos: true,
        pctTrabajoPesado: 0,
      },
    };
    update((o) => ({ ...o, dotacion: [...o.dotacion, nuevo] }));
  };

  return (
    <div className="animar-entrada max-w-[1500px]">
      <Link
        href="/cotizador"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Cotizaciones
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className="etiqueta-seccion">Obra · {cotizacion.rev}</span>
          <h1 className="mt-2 max-w-[28ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
            {cotizacion.nombre}
            <span className="block text-tinta/40">
              {cotizacion.cliente ?? "Sin cliente"}
              {cotizacion.faena ? ` · ${cotizacion.faena}` : ""}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={COLOR_GUARDADO[saveState]}>{ETIQUETA_GUARDADO[saveState]}</span>
          {cotizacion.emitida ? (
            <span className="rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 font-semibold text-teal">
              Emitida
            </span>
          ) : (
            puedeEnCotizador(rol, "marcar_emitida") && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => iniciarTransicion(() => void marcarEmitidaAction(cotizacion.id))}
                className="rounded-lg border border-borde bg-superficie px-3 py-1.5 font-semibold text-tinta/70 transition hover:border-teal/40 hover:text-teal disabled:opacity-50"
              >
                Marcar emitida
              </button>
            )
          )}
          {cotizacion.emitida && puedeEnCotizador(rol, "crear_nueva_version") && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => iniciarTransicion(() => void crearNuevaVersionAction(cotizacion.id))}
              className="rounded-lg border border-borde bg-superficie px-3 py-1.5 font-semibold text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo disabled:opacity-50"
            >
              Nueva revisión
            </button>
          )}
        </div>
      </div>

      {/* ── Cifras, arriba y siempre visibles ───────────────────────────── */}
      <dl className="mt-8 grid grid-cols-1 overflow-hidden rounded-2xl border border-borde sm:grid-cols-4">
        <Cifra
          titulo="Horas-hombre"
          valor={String(result.hhTotal)}
          pie={`${result.personasTotales} personas`}
        />
        <Cifra
          titulo="Costo total"
          valor={money(result.costoTotal)}
          pie="personal + insumos propios"
          tinte="bg-gris/[0.08]"
        />
        <Cifra
          titulo="Total neto"
          valor={money(result.totalNeto)}
          pie={`IVA ${money(result.iva)}`}
          tinte="bg-naranjo/[0.06]"
          color="text-naranjo"
        />
        <Cifra
          titulo="Margen efectivo"
          valor={pct(result.margenEfectivo)}
          pie="sobre el trabajo propio"
          tinte="bg-teal/[0.06]"
          color="text-teal"
          ultimo
        />
      </dl>

      {result.cuadre && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            Math.abs(result.cuadre.diferencia) < 1000
              ? "border-teal/30 bg-teal/[0.06]"
              : "border-naranjo/30 bg-naranjo/[0.06]"
          }`}
        >
          <p className="text-pretty text-tinta">
            Objetivo <strong className="tabular-nums">{money(result.cuadre.objetivo)}</strong> ·{" "}
            {result.cuadre.diferencia === 0 ? (
              <strong className="text-teal">cuadra exacto</strong>
            ) : (
              <>
                diferencia <strong className="tabular-nums">{money(result.cuadre.diferencia)}</strong>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-pretty text-tinta/60">
            {result.cuadre.diferencia === 0 ? "El" : "Para cuadrar con estos ítems, el"} costo por hora-hombre{" "}
            {result.cuadre.diferencia === 0 ? "es" : "tendría que ser"}{" "}
            <strong className="tabular-nums">{money(result.cuadre.costoHoraHombreNecesario)}</strong>. Hoy el
            promedio es{" "}
            <strong className="tabular-nums">
              {money(result.hhTotal > 0 ? Math.round(result.costoPersonal / result.hhTotal) : 0)}
            </strong>
            . Vendida al objetivo, la obra deja {pct(result.cuadre.margenEfectivoObjetivo)} de margen.
          </p>

          {/* La otra forma de cuadrar, sin tocar un solo sueldo: mover el divisor.
              Va como botón y no automático — el divisor es la carga comercial de
              la obra y esa decisión es de quien cotiza, no del modelo. */}
          {/* La condición mira la DIFERENCIA, no el divisor: aplicado el divisor
              exacto la diferencia es cero y esta línea desaparece. Antes miraba el
              divisor y quedaba diciendo "19.36 en vez de 19.36" con la obra ya
              cuadrada. */}
          {result.cuadre.diferencia !== 0 && result.cuadre.divisorNecesario > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tinta/60">
              <span className="text-pretty">
                Con los mismos sueldos cuadra exacto con un divisor HH de{" "}
                <strong className="tabular-nums text-tinta">
                  {result.cuadre.divisorNecesario.toFixed(2)}
                </strong>{" "}
                en vez de {obra.divisorHH.toFixed(2)}: recuperar el costo de un mes en esas horas.
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => update((o) => ({ ...o, divisorHH: result.cuadre!.divisorNecesario }))}
                  className="rounded-md border border-naranjo/40 bg-superficie px-2 py-1 font-semibold text-naranjo transition hover:bg-naranjo/10"
                >
                  Cuadrar
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── Turnos ──────────────────────────────────────────────────────── */}
      <Seccion titulo="Programa">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero
            rotulo="Turnos"
            valor={obra.turnos.cantidad}
            disabled={disabled}
            onChange={(v) => update((o) => ({ ...o, turnos: { ...o.turnos, cantidad: v } }))}
          />
          <Numero
            rotulo="Horas por turno"
            valor={obra.turnos.horas}
            disabled={disabled}
            onChange={(v) => update((o) => ({ ...o, turnos: { ...o.turnos, horas: v } }))}
          />
          <Numero
            rotulo="Divisor HH"
            ayuda="Costo mensual ÷ este número = costo por hora-hombre. 45 es la convención HH25."
            // Cuatro decimales solo para que el campo sea legible: el valor
            // guardado conserva toda la precisión, y es eso lo que hace que el
            // total cuadre al peso.
            valor={Math.round(obra.divisorHH * 1e4) / 1e4}
            disabled={disabled}
            onChange={(v) => update((o) => ({ ...o, divisorHH: v }))}
          />
          <Numero
            rotulo="Precio objetivo"
            ayuda="Opcional. No ajusta nada: informa la brecha y el costo/HH que lo haría cuadrar."
            valor={obra.precioObjetivo ?? 0}
            disabled={disabled}
            onChange={(v) => update((o) => ({ ...o, precioObjetivo: v > 0 ? v : undefined }))}
          />
        </div>
        <p className="mt-3 text-xs text-tinta/50">
          {obra.turnos.cantidad} turnos × {obra.turnos.horas} h ={" "}
          <strong className="tabular-nums text-tinta/70">{obra.turnos.cantidad * obra.turnos.horas} h</strong>{" "}
          de programa.
        </p>
      </Seccion>

      {/* ── Cuadrilla ───────────────────────────────────────────────────── */}
      <Seccion
        titulo="Cuadrilla por turno"
        accion={
          !disabled && (
            <div className="flex items-center gap-2">
              <select
                className={`${campo} w-auto`}
                defaultValue=""
                onChange={(e) => {
                  const plantilla = catalogoCargos.find((c) => c.id === e.target.value);
                  agregarCargo(plantilla);
                  e.currentTarget.value = "";
                }}
              >
                <option value="">Agregar del catálogo…</option>
                {catalogoCargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cargo}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => agregarCargo()}
                className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
              >
                + Cargo
              </button>
            </div>
          )
        }
      >
        {obra.dotacion.length === 0 ? (
          <p className="py-4 text-sm text-tinta/50">
            Sin cuadrilla todavía. La dotación se declara <strong>por turno</strong>: el total sale de
            multiplicar por los turnos que se cubren.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-borde text-[11px] uppercase tracking-wide text-tinta/45">
                <tr>
                  <th className="py-2 font-medium">Cargo</th>
                  <th className="py-2 font-medium">Pers/turno</th>
                  <th className="py-2 font-medium">Sueldo base</th>
                  <th className="py-2 text-right font-medium">HH</th>
                  <th className="py-2 text-right font-medium">Costo/HH</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde/60">
                {obra.dotacion.map((c, i) => {
                  const linea = result.lineasCargo[i];
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-3">
                        <input
                          value={c.cargo}
                          disabled={disabled}
                          className={campo}
                          onChange={(e) =>
                            update((o) => ({
                              ...o,
                              dotacion: o.dotacion.map((x) =>
                                x.id === c.id ? { ...x, cargo: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="w-24 py-2 pr-3">
                        <input
                          type="number"
                          min={0}
                          value={c.personasPorTurno}
                          disabled={disabled}
                          className={campo}
                          onChange={(e) =>
                            update((o) => ({
                              ...o,
                              dotacion: o.dotacion.map((x) =>
                                x.id === c.id ? { ...x, personasPorTurno: Number(e.target.value) || 0 } : x,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="w-36 py-2 pr-3">
                        <input
                          type="number"
                          min={0}
                          value={c.remuneracion.base ?? 0}
                          disabled={disabled}
                          className={campo}
                          onChange={(e) =>
                            update((o) => ({
                              ...o,
                              dotacion: o.dotacion.map((x) =>
                                x.id === c.id
                                  ? {
                                      ...x,
                                      remuneracion: {
                                        ...x.remuneracion,
                                        base: Number(e.target.value) || 0,
                                      },
                                    }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="py-2 text-right tabular-nums text-tinta/70">{linea?.hhTotal ?? 0}</td>
                      <td className="py-2 text-right tabular-nums text-tinta/70">
                        {money(linea?.costoHoraHombre ?? 0)}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-tinta">
                        {money(linea?.costoTotal ?? 0)}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {!disabled && (
                          <button
                            type="button"
                            aria-label={`Quitar ${c.cargo}`}
                            onClick={() =>
                              update((o) => ({
                                ...o,
                                dotacion: o.dotacion.filter((x) => x.id !== c.id),
                                trabajosPrevios: o.trabajosPrevios.filter((p) => p.cargoId !== c.id),
                              }))
                            }
                            className="rounded px-1.5 text-tinta/40 transition hover:text-red-600"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {/* ── Trabajos previos ────────────────────────────────────────────── */}
      <Seccion
        titulo="Trabajos previos a la parada"
        accion={
          !disabled &&
          obra.dotacion.length > 0 && (
            <button
              type="button"
              onClick={() =>
                update((o) => ({
                  ...o,
                  trabajosPrevios: [
                    ...o.trabajosPrevios,
                    { id: idNuevo(), descripcion: "", cargoId: o.dotacion[0].id, hh: 0 },
                  ],
                }))
              }
              className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
            >
              + Trabajo previo
            </button>
          )
        }
      >
        <p className="mb-3 text-xs text-pretty text-tinta/50">
          Se ejecutan antes de la detención y no consumen las horas del programa, así que van en horas-hombre
          aparte.
        </p>
        {obra.trabajosPrevios.length === 0 ? (
          <p className="text-sm text-tinta/50">Ninguno.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {obra.trabajosPrevios.map((p) => (
              <div key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_110px_40px]">
                <input
                  value={p.descripcion}
                  placeholder="Plegado de cinta, empalmes a piso…"
                  disabled={disabled}
                  className={campo}
                  onChange={(e) =>
                    update((o) => ({
                      ...o,
                      trabajosPrevios: o.trabajosPrevios.map((x) =>
                        x.id === p.id ? { ...x, descripcion: e.target.value } : x,
                      ),
                    }))
                  }
                />
                <select
                  value={p.cargoId}
                  disabled={disabled}
                  className={campo}
                  onChange={(e) =>
                    update((o) => ({
                      ...o,
                      trabajosPrevios: o.trabajosPrevios.map((x) =>
                        x.id === p.id ? { ...x, cargoId: e.target.value } : x,
                      ),
                    }))
                  }
                >
                  {obra.dotacion.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cargo}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={p.hh}
                  disabled={disabled}
                  className={campo}
                  onChange={(e) =>
                    update((o) => ({
                      ...o,
                      trabajosPrevios: o.trabajosPrevios.map((x) =>
                        x.id === p.id ? { ...x, hh: Number(e.target.value) || 0 } : x,
                      ),
                    }))
                  }
                />
                {!disabled && (
                  <button
                    type="button"
                    aria-label="Quitar trabajo previo"
                    onClick={() =>
                      update((o) => ({
                        ...o,
                        trabajosPrevios: o.trabajosPrevios.filter((x) => x.id !== p.id),
                      }))
                    }
                    className="rounded text-tinta/40 transition hover:text-red-600"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* ── Ítems ───────────────────────────────────────────────────────── */}
      <Seccion
        titulo="Equipos, transporte e insumos"
        accion={
          !disabled && (
            <button
              type="button"
              onClick={() =>
                update((o) => ({
                  ...o,
                  items: [
                    ...o.items,
                    {
                      id: idNuevo(),
                      descripcion: "",
                      unidad: "dia",
                      cantidad: 1,
                      precioUnitario: 0,
                      categoria: "equipo_mayor",
                      modo: "precio",
                    },
                  ],
                }))
              }
              className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
            >
              + Ítem
            </button>
          )
        }
      >
        <p className="mb-3 text-xs text-pretty text-tinta/50">
          <strong>Costo</strong> es propio y lleva margen encima. <strong>Precio</strong> es lo subcontratado
          que se traspasa tal cual —grúa con operador, enrollador, camas bajas— y va al total sin margen.
        </p>
        {obra.items.length === 0 ? (
          <p className="text-sm text-tinta/50">Sin ítems.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-borde text-[11px] uppercase tracking-wide text-tinta/45">
                <tr>
                  <th className="py-2 font-medium">Descripción</th>
                  <th className="py-2 font-medium">Categoría</th>
                  <th className="py-2 font-medium">Unidad</th>
                  <th className="py-2 font-medium">Cant.</th>
                  <th className="py-2 font-medium">V. unitario</th>
                  <th className="py-2 font-medium">Modo</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde/60">
                {obra.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2 pr-3">
                      <input
                        value={it.descripcion}
                        disabled={disabled}
                        className={campo}
                        onChange={(e) =>
                          update((o) => ({
                            ...o,
                            items: o.items.map((x) =>
                              x.id === it.id ? { ...x, descripcion: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                    </td>
                    <td className="w-36 py-2 pr-3">
                      <select
                        value={it.categoria}
                        disabled={disabled}
                        className={campo}
                        onChange={(e) =>
                          update((o) => ({
                            ...o,
                            items: o.items.map((x) =>
                              x.id === it.id
                                ? { ...x, categoria: e.target.value as ItemObra["categoria"] }
                                : x,
                            ),
                          }))
                        }
                      >
                        {CATEGORIAS.map((c) => (
                          <option key={c} value={c}>
                            {ETIQUETA_CATEGORIA[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-28 py-2 pr-3">
                      <select
                        value={it.unidad}
                        disabled={disabled}
                        className={campo}
                        onChange={(e) =>
                          update((o) => ({
                            ...o,
                            items: o.items.map((x) =>
                              x.id === it.id ? { ...x, unidad: e.target.value as ItemObra["unidad"] } : x,
                            ),
                          }))
                        }
                      >
                        {UNIDADES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-20 py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={it.cantidad}
                        disabled={disabled}
                        className={campo}
                        onChange={(e) =>
                          update((o) => ({
                            ...o,
                            items: o.items.map((x) =>
                              x.id === it.id ? { ...x, cantidad: Number(e.target.value) || 0 } : x,
                            ),
                          }))
                        }
                      />
                    </td>
                    <td className="w-36 py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={it.precioUnitario}
                        disabled={disabled}
                        className={campo}
                        onChange={(e) =>
                          update((o) => ({
                            ...o,
                            items: o.items.map((x) =>
                              x.id === it.id ? { ...x, precioUnitario: Number(e.target.value) || 0 } : x,
                            ),
                          }))
                        }
                      />
                    </td>
                    <td className="w-28 py-2 pr-3">
                      <select
                        value={it.modo}
                        disabled={disabled}
                        className={campo}
                        onChange={(e) =>
                          update((o) => ({
                            ...o,
                            items: o.items.map((x) =>
                              x.id === it.id ? { ...x, modo: e.target.value as ItemObra["modo"] } : x,
                            ),
                          }))
                        }
                      >
                        <option value="costo">Costo</option>
                        <option value="precio">Precio</option>
                      </select>
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-tinta">
                      {money(it.cantidad * it.precioUnitario)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {!disabled && (
                        <button
                          type="button"
                          aria-label="Quitar ítem"
                          onClick={() =>
                            update((o) => ({ ...o, items: o.items.filter((x) => x.id !== it.id) }))
                          }
                          className="rounded px-1.5 text-tinta/40 transition hover:text-red-600"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {/* ── Márgenes y cierre ───────────────────────────────────────────── */}
      <Seccion titulo="Márgenes y total">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ["mobPct", "MOB"],
              ["ggPct", "GG"],
              ["utilidadPct", "Utilidad"],
              ["ggEcoPct", "GG ECO"],
              ["utilidadEcoPct", "Utilidad ECO"],
            ] as const
          ).map(([clave, rotulo]) => (
            <Numero
              key={clave}
              rotulo={`${rotulo} %`}
              valor={Math.round(obra.margenes[clave] * 1e6) / 1e4}
              disabled={disabled}
              onChange={(v) => update((o) => ({ ...o, margenes: { ...o.margenes, [clave]: v / 100 } }))}
            />
          ))}
        </div>

        <dl className="mt-5 flex flex-col gap-1.5 text-sm">
          <Fila rotulo="Costo del personal" monto={result.costoPersonal} />
          <Fila rotulo="Insumos y equipos propios" monto={result.costoItems} />
          <Fila rotulo="Costo total" monto={result.costoTotal} fuerte />
          <Fila rotulo={`MOB ${pct(obra.margenes.mobPct)}`} monto={result.mob} />
          <Fila rotulo={`Gastos generales ${pct(obra.margenes.ggPct)}`} monto={result.gg} />
          <Fila rotulo={`Utilidad ${pct(obra.margenes.utilidadPct)}`} monto={result.utilidad} />
          <Fila rotulo="Costo cargado" monto={result.costoCargado} fuerte />
          <Fila rotulo={`GG ECO ${pct(obra.margenes.ggEcoPct)}`} monto={result.ggEco} />
          <Fila rotulo={`Utilidad ECO ${pct(obra.margenes.utilidadEcoPct)}`} monto={result.utilidadEco} />
          <Fila rotulo="Equipo subcontratado (traspasado)" monto={result.preciosTraspasados} />
          <Fila rotulo="TOTAL NETO" monto={result.totalNeto} fuerte acento />
          <Fila rotulo={`IVA ${pct(obra.margenes.ivaPct)}`} monto={result.iva} />
          <Fila rotulo="TOTAL CON IVA" monto={result.totalConIva} fuerte />
        </dl>
      </Seccion>
    </div>
  );
}

function Seccion({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`mt-6 p-5 ${TARJETA}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-borde pb-3">
        <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Cifra({
  titulo,
  valor,
  pie,
  tinte = "bg-naranjo/[0.06]",
  color = "text-tinta",
  ultimo,
}: {
  titulo: string;
  valor: string;
  pie: string;
  tinte?: string;
  color?: string;
  ultimo?: boolean;
}) {
  return (
    <div className={`border-b border-borde px-5 py-4 sm:border-b-0 ${ultimo ? "" : "sm:border-r"} ${tinte}`}>
      <dt className="text-xs font-medium text-tinta/55">{titulo}</dt>
      <dd
        className={`mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums sm:text-3xl ${color}`}
      >
        {valor}
      </dd>
      <dd className="mt-1.5 text-[11px] text-tinta/45">{pie}</dd>
    </div>
  );
}

function Numero({
  rotulo,
  ayuda,
  valor,
  disabled,
  onChange,
}: {
  rotulo: string;
  ayuda?: string;
  valor: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">{rotulo}</span>
      <input
        type="number"
        min={0}
        step="any"
        value={valor}
        disabled={disabled}
        title={ayuda}
        className={`mt-1 ${campo}`}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {ayuda && <span className="mt-1 block text-[10px] text-pretty text-tinta/40">{ayuda}</span>}
    </label>
  );
}

function Fila({
  rotulo,
  monto,
  fuerte,
  acento,
}: {
  rotulo: string;
  monto: number;
  fuerte?: boolean;
  acento?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        fuerte ? "border-t border-borde pt-1.5 font-semibold" : ""
      }`}
    >
      <dt className={acento ? "text-naranjo" : "text-tinta/60"}>{rotulo}</dt>
      <dd className={`tabular-nums ${acento ? "text-lg text-naranjo" : "text-tinta"}`}>{money(monto)}</dd>
    </div>
  );
}
