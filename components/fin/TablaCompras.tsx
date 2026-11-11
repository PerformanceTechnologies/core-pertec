"use client";

import Link from "next/link";
import { useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import { eliminarCompraAction, aprobarComprasAction, aprobarDiferenciaAction, marcarOcEnviadaAction, pagarCompraAction, programarPagosAction, recepcionAction, rechazarCompraAction, registrarFacturaCompraAction, visarComprasAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import { clp, fechaCl } from "@/lib/fin/reglas";
import type { CompraVista } from "@/lib/fin/datos";
import { TODO_PERMITIDO, type PuedeFlujo } from "@/lib/fin/flujos-modelo";
import { Chip, Monto, TD, TH, tonoPaso } from "./piezas";
import { BOTON, BOTON_SEC, BotonAccion, CAMPO, Campo, ConVentana, FormAccion } from "./ui";

export interface HolguraCompra {
  mes: string;
  antes: number;
  despues: number;
}

/**
 * La hoja «Compras y CxP» con el «Siguiente paso» de cada compra y el botón que lo resuelve.
 * Selección múltiple para aprobar, visar o programar pagos de una vez.
 */
export default function TablaCompras({ compras, cuentas, hoy, holguras, modo = "todas", puede = TODO_PERMITIDO, esAdmin = false }: {
  compras: CompraVista[];
  cuentas: { id: string; nombre: string }[];
  hoy: string;
  holguras?: Record<string, HolguraCompra>;
  modo?: "todas" | "aprobar" | "visar";
  /** Qué pasos puede ejecutar quien mira (Permisos de flujos). El servidor lo vuelve a exigir. */
  puede?: PuedeFlujo;
  /** Administrador global: ve «Eliminar» en cada solicitud (la acción lo vuelve a exigir en el servidor). */
  esAdmin?: boolean;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const elegidas = compras.filter((c) => marcados.includes(c.id));
  const [fechaPago, setFechaPago] = useState(hoy);
  const [cuentaPago, setCuentaPago] = useState(cuentas[0]?.id ?? "");
  const listas = (p: string) => elegidas.filter((c) => c.paso === p || (p === "Falta visado de Finanzas" && c.paso === "Factura sin OC: regularizar" && c.aprobadoPor));
  const porAprobar = elegidas.filter((c) => !c.aprobadoPor && !c.fechaAprobacion && !c.anulada);
  const porVisar = listas("Falta visado de Finanzas");
  const porProgramar = elegidas.filter((c) => ["Programar pago", "Vencida: programar pago ya"].includes(c.paso));

  return (
    <div className="space-y-3">
      {elegidas.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-naranjo/40 bg-superficie px-4 py-2.5 shadow-lg">
          <span className="text-sm font-semibold text-tinta">{elegidas.length} compra(s) · {clp(elegidas.reduce((s, c) => s + (c.netoCotizado ?? 0), 0))} neto</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setMarcados([])} className="text-xs font-semibold text-gris hover:text-tinta">Quitar selección</button>
          {porAprobar.length > 0 && puede.compras_aprobador && <BotonAccion accion={() => aprobarComprasAction(porAprobar.map((c) => c.id))} className={BOTON}>Aprobar {porAprobar.length}</BotonAccion>}
          {porVisar.length > 0 && puede.compras_visador && <BotonAccion accion={() => visarComprasAction(porVisar.map((c) => c.id))} className={BOTON} confirmar={`Visar ${porVisar.length} compra(s): Finanzas confirma que hay caja y se emiten sus OC.`}>Visar {porVisar.length} y emitir OC</BotonAccion>}
          {porProgramar.length > 0 && puede.compras_pagador && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className="rounded-lg border border-borde bg-superficie px-2 py-1.5 text-xs" />
              <select value={cuentaPago} onChange={(e) => setCuentaPago(e.target.value)} className="rounded-lg border border-borde bg-superficie px-2 py-1.5 text-xs">{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
              <BotonAccion accion={() => programarPagosAction(porProgramar.map((c) => c.id), fechaPago, cuentaPago || null)} className={BOTON}>Programar {porProgramar.length} pago(s)</BotonAccion>
            </span>
          )}
        </div>
      )}

      {/* Celular, vista «Todas»: una tarjeta por compra con su paso y su acción. */}
      {modo === "todas" && (
        <ul className="space-y-2.5 lg:hidden">
          {compras.map((c) => (
            <li key={c.id} className={`rounded-xl border bg-superficie p-3.5 ${marcados.includes(c.id) ? "border-naranjo/50 bg-naranjo/[0.04]" : "border-borde"} ${c.anulada ? "opacity-50" : ""}`}>
              <div className="flex items-start gap-3">
                {!c.anulada && c.paso !== "Pagada" && <input type="checkbox" checked={marcados.includes(c.id)} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-naranjo)]" aria-label={`Elegir ${c.codigo}`} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-semibold text-tinta"><Link href={`/finanzas/compras/${c.id}`} className="hover:text-naranjo hover:underline" title="Ver historial">{c.codigo}</Link> · {c.descripcion}</p>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-tinta"><Monto valor={c.netoCotizado} /></span>
                  </div>
                  <p className="truncate text-[11px] text-gris">{c.proveedorNombre ?? "Sin proveedor"} · {c.proyectoNombre ?? "General"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Chip texto={c.estadoOverride ? (c.estadoOverride === "rechazada" ? "Rechazada" : "Anulada") : c.paso} tono={tonoPaso(c.paso)} />
                    {c.facturaFolio && <span className="text-[11px] text-gris">Factura N° {c.facturaFolio} · vence {fechaCl(c.facturaVence)}</span>}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-borde pt-2.5 text-xs">
                    <span className="text-gris">{c.montoFlujo ? <>Por pagar <strong className="text-tinta">{clp(c.montoFlujo)}</strong></> : "Nada por pagar"}</span>
                    <><AccionCompra c={c} cuentas={cuentas} hoy={hoy} puede={puede} />{esAdmin && <EliminarCompra id={c.id} codigo={c.codigo} />}</>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={modo === "todas" ? "hidden overflow-x-auto rounded-xl border border-borde bg-superficie lg:block" : "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {modo === "todas" ? (
          <table className="w-full min-w-[72rem] text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className="w-8 px-3" />
                <th className={TH}>Compra</th>
                <th className={TH}>Siguiente paso</th>
                <th className={TH}>Proveedor</th>
                <th className={`${TH} text-right`}>Neto OC</th>
                <th className={TH}>OC / recepción</th>
                <th className={TH}>Factura</th>
                <th className={`${TH} text-right`}>Por pagar</th>
                {/* Fija al borde derecho: la acción siempre se ve aunque la tabla se desplace. */}
                <th className={`${TH} sticky right-0 bg-superficie shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]`}>Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {compras.map((c) => (
                <tr key={c.id} className={`${marcados.includes(c.id) ? "bg-naranjo/[0.05]" : ""} ${c.anulada ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2.5 align-top">
                    {!c.anulada && c.paso !== "Pagada" && <input type="checkbox" checked={marcados.includes(c.id)} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))} className="mt-1 accent-[var(--color-naranjo)]" aria-label={`Elegir ${c.codigo}`} />}
                  </td>
                  <td className={`${TD} max-w-[16rem]`}>
                    <Link href={`/finanzas/compras/${c.id}`} className="font-semibold text-tinta hover:text-naranjo hover:underline" title="Ver historial">{c.codigo}</Link> · <span className="text-tinta">{c.descripcion}</span>
                    <span className="block truncate text-[11px] text-gris">{c.proyectoNombre ?? "General"}{c.fechaRequerida ? ` · para el ${fechaCl(c.fechaRequerida)}` : ""}</span>
                  </td>
                  <td className={TD}><Chip texto={c.estadoOverride ? (c.estadoOverride === "rechazada" ? "Rechazada" : "Anulada") : c.paso} tono={tonoPaso(c.paso)} />{c.motivo && <span className="block text-[10px] text-gris">{c.motivo}</span>}</td>
                  <td className={`${TD} max-w-[12rem] truncate`}>{c.proveedorNombre ?? "—"}</td>
                  <td className={`${TD} text-right`}><Monto valor={c.netoCotizado} /></td>
                  <td className={`${TD} whitespace-nowrap text-xs`}>{c.ocNumero ?? "—"}{c.recepcion && <span className="block text-[10px] text-gris">Recepción {c.recepcion === "si" ? "conforme" : c.recepcion}</span>}</td>
                  <td className={`${TD} whitespace-nowrap text-xs`}>{c.facturaFolio ? <>N° {c.facturaFolio}<span className="block text-[10px] text-gris">{clp(c.facturaTotal ?? 0)} · vence {fechaCl(c.facturaVence)}</span>{c.diferenciaVsOc ? <span className={`block text-[10px] ${Math.abs(c.diferenciaVsOc) > 1000 && !c.diferenciaAprobada ? "font-semibold text-alerta" : "text-gris"}`}>dif. OC {clp(c.diferenciaVsOc)}</span> : null}</> : "—"}</td>
                  <td className={`${TD} text-right`}>{c.montoFlujo ? <Monto valor={c.montoFlujo} /> : <span className="text-gris-suave">—</span>}{c.fechaFlujo && <span className="block text-[10px] text-gris">{fechaCl(c.fechaFlujo)}</span>}</td>
                  <td className={`${TD} sticky right-0 whitespace-nowrap bg-superficie shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]`}><><AccionCompra c={c} cuentas={cuentas} hoy={hoy} puede={puede} />{esAdmin && <EliminarCompra id={c.id} codigo={c.codigo} />}</></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          compras.map((c) => {
            const h = holguras?.[c.id];
            return (
              <article key={c.id} className={`rounded-2xl border bg-superficie p-4 shadow-sm ${marcados.includes(c.id) ? "border-naranjo" : "border-borde"}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={marcados.includes(c.id)} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))} className="mt-1 accent-[var(--color-naranjo)]" aria-label={`Elegir ${c.codigo}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gris"><Link href={`/finanzas/compras/${c.id}`} className="hover:text-naranjo hover:underline">{c.codigo}</Link> · {c.proyectoNombre ?? "General"}</p>
                    <p className="font-bold text-tinta">{c.descripcion}</p>
                    <p className="text-xs text-gris">{c.proveedorNombre ?? "Sin proveedor"} · pidió {c.solicitante?.split("@")[0] ?? "—"}</p>
                  </div>
                  <p className="font-condensed text-xl font-bold tabular-nums text-tinta">{clp(c.netoCotizado ?? 0)}</p>
                </div>
                {h && (
                  <div className={`mt-3 rounded-xl px-3 py-2 text-xs ${h.despues < 0 ? "bg-rose-500/[0.08] text-alerta" : "bg-emerald-500/[0.08] text-ok"}`}>
                    {h.antes === h.despues
                      ? <>Holgura de {h.mes}: <strong>{clp(h.antes)}</strong> · la factura ya está contada en el flujo</>
                      : <>Holgura de {h.mes}: {clp(h.antes)} → <strong>{clp(h.despues)}</strong> con esta compra {h.despues < 0 ? "· ¡falta caja!" : ""}</>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {(puede.compras_aprobador || puede.compras_visador) && <BotonAccion accion={rechazarCompraAction.bind(null, c.id)} motivo={`¿Por qué se rechaza ${c.codigo}?`}>Rechazar</BotonAccion>}
                  {modo === "aprobar" ? (puede.compras_aprobador ? (
                    <BotonAccion accion={() => aprobarComprasAction([c.id])} className={BOTON}>Aprobar</BotonAccion>
                  ) : <span className="text-xs text-gris">Lo aprueba otra persona</span>) : (puede.compras_visador ? (
                    <BotonAccion accion={() => visarComprasAction([c.id])} className={BOTON}>Visar y emitir OC</BotonAccion>
                  ) : <span className="text-xs text-gris">Lo visa otra persona</span>)}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

/** El botón que resuelve el siguiente paso de una compra. */
function AccionCompra({ c, cuentas, hoy, puede }: { c: CompraVista; cuentas: { id: string; nombre: string }[]; hoy: string; puede: PuedeFlujo }) {
  if (c.anulada || c.paso === "Pagada") return null;
  const otra = (quien: string) => <span className="text-xs text-gris" title="Está asignado a otras personas en «Permisos de flujos»">{quien}</span>;
  const factura = (
    <ConVentana boton="Registrar factura" titulo={`Factura del proveedor · ${c.codigo}`} className={BOTON_SEC}>
      {(cerrar) => (
        <FormAccion accion={registrarFacturaCompraAction} textoBoton="Registrar factura" alOk={cerrar}>
          <input type="hidden" name="compraId" value={c.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Tipo"><select name="tipoDte" className={CAMPO}><option value="33">33 · Factura</option><option value="34">34 · Exenta</option><option value="46">46 · Factura de compra</option></select></Campo>
            <Campo etiqueta="Folio *"><input name="folio" required className={CAMPO} /></Campo>
            <Campo etiqueta="Emisión *"><input name="fechaEmision" type="date" required defaultValue={hoy} className={CAMPO} /></Campo>
            <Campo etiqueta="Neto"><input name="neto" defaultValue={c.netoCotizado ?? ""} className={CAMPO} /></Campo>
            <Campo etiqueta="IVA" ayuda="Vacío = se calcula"><input name="iva" className={CAMPO} /></Campo>
            <Campo etiqueta="Recepción en el SII"><input name="fechaRecepcion" type="date" defaultValue={hoy} className={CAMPO} /></Campo>
          </div>
          <p className="text-[11px] text-gris">El vencimiento se calcula con la condición de pago del proveedor. Diferencias con la OC sobre la tolerancia quedan para revisar.</p>
        </FormAccion>
      )}
    </ConVentana>
  );
  switch (c.paso) {
    case "Falta aprobación JP o gerente":
      if (!puede.compras_aprobador) return otra("Lo aprueba otra persona");
      return <BotonAccion accion={() => aprobarComprasAction([c.id])}>Aprobar</BotonAccion>;
    case "Falta visado de Finanzas":
      if (!puede.compras_visador) return otra("Lo visa otra persona");
      return <BotonAccion accion={() => visarComprasAction([c.id])}>Visar</BotonAccion>;
    case "Factura sin OC: regularizar":
      if (c.aprobadoPor ? !puede.compras_visador : !puede.compras_aprobador) return otra(c.aprobadoPor ? "Lo visa otra persona" : "Lo aprueba otra persona");
      return c.aprobadoPor ? <BotonAccion accion={() => visarComprasAction([c.id])} titulo="Regularizar: visar y emitir la OC">Visar (regularizar)</BotonAccion> : <BotonAccion accion={() => aprobarComprasAction([c.id])} titulo="Regularizar: aprobar y luego visar">Aprobar (regularizar)</BotonAccion>;
    case "Emitir OC al proveedor":
      if (!puede.compras_visador) return otra("Lo gestiona quien visa");
      return <BotonAccion accion={() => marcarOcEnviadaAction(c.id)}>OC enviada</BotonAccion>;
    case "Esperar recepción conforme":
      return (
        <span className="inline-flex gap-1">
          {!c.ocEnviadaFecha && puede.compras_visador && <BotonAccion accion={() => marcarOcEnviadaAction(c.id)} titulo="Marcar la OC como enviada al proveedor">OC enviada</BotonAccion>}
          {puede.compras_recepcion ? <ConVentana boton="Recepción" titulo={`Recepción · ${c.codigo}`} className={BOTON_SEC}>
            {(cerrar) => (
              <FormAccion accion={recepcionAction.bind(null, c.id)} textoBoton="Guardar recepción" alOk={cerrar}>
                <div className="flex gap-4 text-sm">{[["si", "Sí, conforme"], ["parcial", "Parcial"], ["no", "No llegó / no conforme"]].map(([v, t]) => <label key={v} className="inline-flex items-center gap-2"><input type="radio" name="resultado" value={v} defaultChecked={v === "si"} /> {t}</label>)}</div>
                <Campo etiqueta="Fecha"><input name="fecha" type="date" defaultValue={hoy} className={CAMPO} /></Campo>
                <Campo etiqueta="Observación"><input name="observacion" className={CAMPO} placeholder="Guía del proveedor, faltantes…" /></Campo>
              </FormAccion>
            )}
          </ConVentana> : otra("Lo recibe otra persona")}
        </span>
      );
    case "Esperar factura del proveedor":
      return factura;
    case "Revisar diferencia con la OC":
      if (!puede.compras_recepcion) return otra("Lo revisa otra persona");
      return <BotonAccion accion={aprobarDiferenciaAction.bind(null, c.id)} motivo={`¿Por qué se acepta la diferencia de ${clp(c.diferenciaVsOc ?? 0)} con la OC?`}>Aceptar diferencia</BotonAccion>;
    case "Programar pago":
    case "Vencida: programar pago ya":
    case "Pago programado":
      if (!puede.compras_pagador) return otra("Lo paga otra persona");
      return (
        <ConVentana boton={c.paso === "Pago programado" ? "Pagar" : "Pagar ahora"} titulo={`Pagar · ${c.codigo}`} className={c.paso.startsWith("Vencida") ? BOTON : BOTON_SEC}>
          {(cerrar) => (
            <FormAccion accion={pagarCompraAction.bind(null, c.id)} textoBoton={`Registrar pago ${clp(c.montoFlujo)}`} alOk={cerrar}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Fecha del pago"><input name="fecha" type="date" defaultValue={hoy} className={CAMPO} /></Campo>
                <Campo etiqueta="Cuenta"><select name="cuentaId" className={CAMPO}>{cuentas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
                <Campo etiqueta="Medio"><select name="medio" className={CAMPO}>{["transferencia", "nómina banco", "cheque", "tarjeta"].map((m) => <option key={m}>{m}</option>)}</select></Campo>
                <Campo etiqueta="Referencia"><input name="referencia" className={CAMPO} /></Campo>
              </div>
              <p className="text-[11px] text-gris">Lo ideal es marcarlo desde el Banco diario al aparecer el cargo: queda conciliado. Para programar varios pagos, márcalos en la tabla.</p>
            </FormAccion>
          )}
        </ConVentana>
      );
    default:
      return null;
  }
}

/** Solo para el administrador global: elimina una solicitud (p. ej. de prueba) con motivo, y queda en la auditoría. */
function EliminarCompra({ id, codigo }: { id: string; codigo: string }) {
  return (
    <BotonAccion
      accion={eliminarCompraAction.bind(null, id)}
      motivo={`¿Por qué se elimina ${codigo}?`}
      titulo="Eliminar (solo administrador)"
      className="ml-1 inline-flex items-center rounded-lg border border-rose-500/40 bg-rose-500/[0.06] p-1.5 text-alerta transition hover:bg-rose-500/[0.12] disabled:opacity-50"
    >
      <IconTrash size={14} />
    </BotonAccion>
  );
}
