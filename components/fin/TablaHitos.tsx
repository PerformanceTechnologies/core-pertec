"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconFileInvoice } from "@tabler/icons-react";
import { actualizarCampoHitoAction, registrarFacturaVentaAction } from "@/app/(protegido)/gestion-financiera/acciones-ventas";
import { ACCION_ETAPA, clp, fechaCl, peso, type EtapaHito } from "@/lib/fin/reglas";
import type { HitoVista } from "@/lib/fin/datos";
import { Chip, Deshabilitado, Monto, TONO_ETAPA, TD, TH } from "./piezas";
import { BOTON, BOTON_SEC, CAMPO, Campo, CampoEnLinea, ConVentana, FormAccion } from "./ui";

const TRABAJO = [
  { valor: "pendiente", texto: "Pendiente" },
  { valor: "en_curso", texto: "En curso" },
  { valor: "terminado", texto: "Terminado" },
];

/**
 * La hoja «Ventas y CxC»: una fila por hito. Los campos MANUAL se editan en la misma fila y la
 * etapa se recalcula sola. Se marcan hitos del mismo cliente para registrar su factura.
 */
export default function TablaHitos({ hitos, tasaIva, hoy }: { hitos: HitoVista[]; tasaIva: number; hoy: string }) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const elegidos = useMemo(() => hitos.filter((h) => marcados.includes(h.id)), [hitos, marcados]);
  const unCliente = new Set(elegidos.map((h) => h.clienteId)).size <= 1;
  const facturables = elegidos.length > 0 && unCliente && elegidos.every((h) => !h.factura && h.fechaAceptacion);
  const neto = elegidos.reduce((s, h) => s + h.neto, 0);
  const exentoElegidos = elegidos.reduce((s, h) => s + (h.exento ?? 0), 0);
  const guardar = (id: string, campo: string) => (v: string) => actualizarCampoHitoAction(id, campo, v);

  return (
    <div className="space-y-3">
      {elegidos.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-naranjo/40 bg-superficie px-4 py-2.5 shadow-lg">
          <span className="text-sm font-semibold text-tinta">{elegidos.length} hito(s) · neto {clp(neto)}</span>
          {!unCliente && <span className="text-xs text-alerta">Una factura es de un solo cliente.</span>}
          {elegidos.some((h) => h.factura) && <span className="text-xs text-alerta">Alguno ya está facturado.</span>}
          <span className="flex-1" />
          <button type="button" onClick={() => setMarcados([])} className="text-xs font-semibold text-gris hover:text-tinta">Quitar selección</button>
          {facturables && <Deshabilitado motivo="Disponible al integrar facturación electrónica" clase={BOTON_SEC}>Emitir factura electrónica</Deshabilitado>}
          {facturables && (
            <ConVentana boton={<><IconFileInvoice size={15} /> Registrar factura</>} titulo="Registrar factura de venta" descripcion={`${elegidos[0].clienteNombre ?? "Cliente"} · ${elegidos.map((h) => h.codigo).join(", ")}`} className={BOTON}>
              {(cerrar) => (
                <FormAccion accion={registrarFacturaVentaAction} textoBoton="Registrar factura" alOk={() => (setMarcados([]), cerrar())}>
                  {elegidos.map((h) => <input key={h.id} type="hidden" name="hitoIds" value={h.id} />)}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo etiqueta="Tipo">
                      <select name="tipoDte" className={CAMPO} defaultValue="33"><option value="33">33 · Factura afecta</option><option value="34">34 · Factura exenta</option></select>
                    </Campo>
                    <Campo etiqueta="Folio *"><input name="folio" required className={CAMPO} /></Campo>
                    <Campo etiqueta="Fecha de emisión *"><input name="fechaEmision" type="date" required defaultValue={hoy} className={CAMPO} /></Campo>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo etiqueta="Neto" ayuda="Precargado desde los hitos"><input name="neto" defaultValue={neto - exentoElegidos} className={CAMPO} /></Campo>
                    <Campo etiqueta="IVA"><input name="iva" defaultValue={peso((neto - exentoElegidos) * tasaIva)} className={CAMPO} /></Campo>
                    <Campo etiqueta="Exento"><input name="exento" defaultValue={exentoElegidos} className={CAMPO} /></Campo>
                  </div>
                  <Campo etiqueta="Referencias" ayuda="OC, HES, DEM u otra que exija el cliente">
                    <input name="referencias" defaultValue={[...new Set(elegidos.map((h) => [h.ocClienteNumero && `OC ${h.ocClienteNumero}`, h.hesNumero && `HES ${h.hesNumero}`].filter(Boolean).join(" · ")))].filter(Boolean).join(" · ")} className={CAMPO} />
                  </Campo>
                  <p className="text-[11px] text-gris">Emitir la factura electrónica desde el Core estará disponible al integrar la facturación electrónica. Hoy se registra la que emitiste en el SII; el PDF/XML se adjunta en la factura.</p>
                </FormAccion>
              )}
            </ConVentana>
          )}
        </div>
      )}

      {/* Celular: una tarjeta por hito con lo esencial; el detalle completo se abre tocándolo. */}
      <ul className="space-y-2.5 lg:hidden">
        {hitos.map((h) => (
          <li key={h.id} className={`rounded-xl border bg-superficie p-3.5 ${marcados.includes(h.id) ? "border-naranjo/50 bg-naranjo/[0.04]" : "border-borde"} ${h.anulado ? "opacity-50" : ""}`}>
            <div className="flex items-start gap-3">
              {!h.factura && !h.anulado && (
                <input type="checkbox" checked={marcados.includes(h.id)} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, h.id] : m.filter((x) => x !== h.id)))} aria-label={`Elegir ${h.codigo}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-naranjo)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/finanzas/ventas/hito/${h.id}`} className="min-w-0 font-semibold text-tinta hover:text-naranjo">{h.codigo} · {h.periodo ?? h.descripcion}</Link>
                  <span className="shrink-0 text-right text-sm font-bold tabular-nums text-tinta"><Monto valor={h.neto} /></span>
                </div>
                <span className="block truncate text-[11px] text-gris">{h.clienteNombre ?? "Sin cliente"} · {h.proyectoNombre ?? "Sin proyecto"}</span>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Chip texto={h.anulado ? "Anulado" : h.etapa} tono={TONO_ETAPA[h.etapa as EtapaHito]} />
                  {!h.anulado && h.etapa !== "Cobrada" && <span className="text-[11px] text-gris">{ACCION_ETAPA[h.etapa]}{h.diasVencida ? ` · ${h.diasVencida} días` : ""}</span>}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-2.5 text-xs">
                  <CampoEnLinea tipo="select" valor={h.estadoTrabajo} opciones={TRABAJO} guardar={guardar(h.id, "estado_trabajo")} ancho="w-32" />
                  <span className="text-right">
                    {h.factura ? <span className="font-semibold text-tinta">Factura N° {h.factura.folio}</span> : <span className="text-gris-suave">Sin factura</span>}
                    <span className="block text-[11px] text-gris">{h.saldo === null ? `${clp(h.totalConIva)} c/IVA` : `Saldo ${clp(h.saldo)}`}</span>
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-borde bg-superficie lg:block">
        <table className="w-full min-w-[78rem] text-sm">
          <thead>
            <tr className="border-b border-borde">
              <th className="w-8 px-3" />
              <th className={TH}>Hito</th>
              <th className={TH}>Etapa / qué falta</th>
              <th className={`${TH} text-right`}>Neto</th>
              <th className={TH}>Trabajo</th>
              <th className={TH}>OC cliente</th>
              <th className={TH}>EDP aprobado</th>
              <th className={TH}>HES</th>
              <th className={TH}>Factura</th>
              <th className={TH}>Fecha estimada</th>
              <th className={`${TH} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {hitos.map((h) => (
              <tr key={h.id} className={`transition hover:bg-tinta/[0.02] ${marcados.includes(h.id) ? "bg-naranjo/[0.05]" : ""} ${h.anulado ? "opacity-50" : ""}`}>
                <td className="px-3 py-2.5 align-top">
                  {!h.factura && !h.anulado && (
                    <input type="checkbox" checked={marcados.includes(h.id)} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, h.id] : m.filter((x) => x !== h.id)))} aria-label={`Elegir ${h.codigo}`} className="mt-1 accent-[var(--color-naranjo)]" />
                  )}
                </td>
                <td className={`${TD} max-w-[18rem]`}>
                  <Link href={`/finanzas/ventas/hito/${h.id}`} className="font-semibold text-tinta hover:text-naranjo">{h.codigo} · {h.periodo ?? h.descripcion}</Link>
                  <span className="block truncate text-[11px] text-gris" title={`${h.clienteNombre ?? ""} · ${h.proyectoNombre ?? ""}`}>{h.clienteNombre ?? "Sin cliente"} · {h.proyectoNombre ?? "Sin proyecto"}</span>
                </td>
                <td className={TD}>
                  <Chip texto={h.anulado ? "Anulado" : h.etapa} tono={TONO_ETAPA[h.etapa as EtapaHito]} />
                  {!h.anulado && h.etapa !== "Cobrada" && <span className="mt-0.5 block text-[10px] text-gris">{ACCION_ETAPA[h.etapa]}{h.diasVencida ? ` · ${h.diasVencida} días` : ""}</span>}
                </td>
                <td className={`${TD} text-right font-semibold`}><Monto valor={h.neto} /></td>
                <td className={TD}><CampoEnLinea tipo="select" valor={h.estadoTrabajo} opciones={TRABAJO} guardar={guardar(h.id, "estado_trabajo")} ancho="w-28" /></td>
                <td className={TD}><CampoEnLinea valor={h.ocClienteNumero} guardar={guardar(h.id, "oc_cliente_numero")} placeholder="Pendiente" /></td>
                <td className={TD}>{h.requiereEdp ? <CampoEnLinea tipo="date" valor={h.edpFechaAprobacion} guardar={guardar(h.id, "edp_fecha_aprobacion")} ancho="w-32" /> : <span className="text-[11px] text-gris-suave">No requiere</span>}</td>
                <td className={TD}>{h.requiereHes ? <CampoEnLinea valor={h.hesNumero} guardar={guardar(h.id, "hes_numero")} placeholder="Pendiente" ancho="w-24" /> : <span className="text-[11px] text-gris-suave">No requiere</span>}</td>
                <td className={`${TD} whitespace-nowrap text-xs`}>
                  {h.factura ? (
                    <>
                      <span className="font-semibold text-tinta">N° {h.factura.folio}</span>
                      <span className="block text-[10px] text-gris">{fechaCl(h.factura.fechaEmision)} · vence {fechaCl(h.vence)}{h.factura.cedida ? " · cedida" : ""}</span>
                    </>
                  ) : (
                    <span className="text-gris-suave">—</span>
                  )}
                </td>
                <td className={TD}><CampoEnLinea tipo="date" valor={h.fechaEstimadaPago} guardar={guardar(h.id, "fecha_estimada_pago")} ancho="w-32" /></td>
                <td className={`${TD} text-right font-semibold`}>{h.saldo === null ? <span className="text-[11px] text-gris">{clp(h.totalConIva)} c/IVA</span> : <Monto valor={h.saldo} tono={h.etapa === "Vencida" ? "text-alerta" : ""} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
