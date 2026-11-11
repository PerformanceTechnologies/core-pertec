"use client";

import { useState } from "react";
import { IconDownload, IconEye, IconFileTypePdf, IconPackageImport } from "@tabler/icons-react";
import { anularCompraAction, reabrirRespuestaOcAction, reactivarCompraAction, responderOcAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import type { CompraVista } from "@/lib/fin/datos";
import type { PuedeFlujo } from "@/lib/fin/flujos-modelo";
import type { ResumenCompra } from "@/lib/fin/oc-resumen";
import { fechaCl } from "@/lib/fin/reglas";
import { Chip, TD, TH } from "./piezas";
import { BotonEnviarOc } from "./EnviarOc";
import ResumenOc from "./ResumenOc";
import { BOTON, BOTON_SEC, BotonAccion, ConVentana } from "./ui";

type Estado = "esperando" | "aceptada" | "rechazada" | "anulada";

const ETIQUETA: Record<Estado, string> = { esperando: "Esperando respuesta", aceptada: "Aceptada", rechazada: "Rechazada por el proveedor", anulada: "Anulada" };
const TONO: Record<Estado, string> = {
  esperando: "bg-sky-500/10 text-info dark:text-sky-300",
  aceptada: "bg-emerald-500/12 text-ok dark:text-emerald-300",
  rechazada: "bg-rose-500/12 text-alerta dark:text-rose-300",
  anulada: "bg-slate-500/10 text-slate-500",
};

/** En qué punto va la OC que se mandó al proveedor. */
function estadoDe(c: CompraVista): Estado {
  if (c.estadoOverride) return "anulada";
  if (c.ocRespuesta === "aceptada") return "aceptada";
  if (c.ocRespuesta === "rechazada") return "rechazada";
  return "esperando";
}

const FILTROS: { clave: string; etiqueta: string; incluye: (e: Estado) => boolean }[] = [
  { clave: "pendientes", etiqueta: "Por resolver", incluye: (e) => e === "esperando" || e === "rechazada" },
  { clave: "aceptadas", etiqueta: "Aceptadas", incluye: (e) => e === "aceptada" },
  { clave: "anuladas", etiqueta: "Anuladas", incluye: (e) => e === "anulada" },
  { clave: "todas", etiqueta: "Todas", incluye: () => true },
];

/**
 * Recepción: las OC que ya salieron al proveedor, en lista. Aquí se marca si el proveedor las aceptó (pasan a facturas
 * recibidas) o las rechazó (se reenvían corregidas o se anulan, quedando en el registro), y se ven, descargan y reenvían.
 * Los permisos son solo para mostrar los botones: cada acción los exige en el servidor.
 */
export default function ListaRecepcion({
  compras,
  resumenes,
  totales,
  puede,
  esAdmin,
}: {
  compras: CompraVista[];
  resumenes: Record<string, ResumenCompra>;
  /** El total con IVA de cada OC, ya formateado en su moneda. */
  totales: Record<string, string>;
  puede: PuedeFlujo;
  esAdmin: boolean;
}) {
  const [filtro, setFiltro] = useState("pendientes");
  const filas = compras.map((c) => ({ c, e: estadoDe(c) }));
  const cuenta = (clave: string) => filas.filter((f) => FILTROS.find((x) => x.clave === clave)!.incluye(f.e)).length;
  const vistas = filas.filter((f) => FILTROS.find((x) => x.clave === filtro)!.incluye(f.e));
  const vacio = filtro === "pendientes" ? "No hay OC esperando respuesta. ✓" : "Nada por aquí todavía.";

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Estado de la respuesta" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-borde bg-superficie p-1">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            type="button"
            role="tab"
            aria-selected={filtro === f.clave}
            onClick={() => setFiltro(f.clave)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filtro === f.clave ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}
          >
            {f.etiqueta} <span className="tabular-nums opacity-70">{cuenta(f.clave)}</span>
          </button>
        ))}
      </div>

      {vistas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde px-4 py-10 text-center text-sm text-gris">
          <IconPackageImport size={26} stroke={1.5} className="mx-auto mb-2 text-gris-suave" />
          {vacio}
          {compras.length === 0 && <p className="mx-auto mt-1 max-w-sm text-xs">Cuando envíes una OC al proveedor, aparece aquí para marcar si la aceptó o la rechazó.</p>}
        </div>
      ) : (
        <>
          {/* Celular: una tarjeta por OC. */}
          <ul className="space-y-2 lg:hidden">
            {vistas.map(({ c, e }) => (
              <li key={c.id} className="rounded-2xl border border-borde bg-superficie p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gris">{c.ocNumero ?? c.codigo} · {c.codigo}</p>
                    <p className="font-semibold text-tinta [overflow-wrap:anywhere]">{c.descripcion}</p>
                    <p className="text-xs text-gris">{c.proveedorNombre ?? "Sin proveedor"}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-tinta">{totales[c.id]}</span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gris">
                  <Chip texto={ETIQUETA[e]} tono={TONO[e]} />
                  {c.ocEnviadaFecha && <span>Enviada el {fechaCl(c.ocEnviadaFecha)}{c.ocEnviadaA ? ` a ${c.ocEnviadaA}` : ""}</span>}
                </p>
                {(c.ocRespuestaObs || (e === "anulada" && c.motivo)) && <p className="mt-1 text-xs text-gris">«{c.ocRespuestaObs ?? c.motivo}»</p>}
                <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
                  <Acciones c={c} e={e} resumen={resumenes[c.id]} puede={puede} esAdmin={esAdmin} />
                </div>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla. */}
          <div className="hidden overflow-x-auto rounded-xl border border-borde bg-superficie lg:block">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <th className={TH}>OC</th><th className={TH}>Proveedor</th><th className={TH}>Enviada</th><th className={`${TH} text-right`}>Total</th><th className={TH}>Respuesta</th><th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {vistas.map(({ c, e }) => (
                  <tr key={c.id} className={e === "anulada" ? "opacity-60" : ""}>
                    <td className={`${TD} max-w-[18rem]`}>
                      <span className="font-semibold text-tinta">{c.ocNumero ?? c.codigo}</span> <span className="text-[11px] text-gris">{c.codigo}</span>
                      <span className="block truncate text-xs text-gris" title={c.descripcion}>{c.descripcion}</span>
                    </td>
                    <td className={`${TD} max-w-[14rem] truncate`}>{c.proveedorNombre ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap text-xs text-gris`}>{c.ocEnviadaFecha ? fechaCl(c.ocEnviadaFecha) : "—"}{c.ocEnviadaA && <span className="block max-w-[12rem] truncate" title={c.ocEnviadaA}>{c.ocEnviadaA}</span>}</td>
                    <td className={`${TD} whitespace-nowrap text-right font-semibold tabular-nums`}>{totales[c.id]}</td>
                    <td className={TD}>
                      <Chip texto={ETIQUETA[e]} tono={TONO[e]} />
                      {c.ocRespuestaFecha && e !== "esperando" && e !== "anulada" && <span className="block text-[10px] text-gris">{fechaCl(c.ocRespuestaFecha)}{c.ocRespuestaPor ? ` · ${c.ocRespuestaPor}` : ""}</span>}
                      {(c.ocRespuestaObs || (e === "anulada" && c.motivo)) && <span className="block max-w-[14rem] truncate text-[10px] text-gris" title={c.ocRespuestaObs ?? c.motivo ?? ""}>«{c.ocRespuestaObs ?? c.motivo}»</span>}
                    </td>
                    <td className={`${TD} text-right`}><span className="inline-flex flex-wrap items-center justify-end gap-1"><Acciones c={c} e={e} resumen={resumenes[c.id]} puede={puede} esAdmin={esAdmin} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** Los botones de una OC: decidir (aceptó / rechazó), ver, descargar, reenviar, anular o reactivar. */
function Acciones({ c, e, resumen, puede, esAdmin }: { c: CompraVista; e: Estado; resumen?: ResumenCompra; puede: PuedeFlujo; esAdmin: boolean }) {
  return (
    <>
      {e === "esperando" && puede.compras_recepcion && (
        <>
          <BotonAccion accion={() => responderOcAction(c.id, "aceptada", "")} className={BOTON} confirmar={`¿El proveedor aceptó la ${c.ocNumero ?? "OC"}? Pasa a facturas recibidas.`}>Aceptó</BotonAccion>
          <BotonAccion accion={(m) => responderOcAction(c.id, "rechazada", m)} motivo="¿Por qué la rechazó el proveedor?">Rechazó</BotonAccion>
        </>
      )}
      {(e === "esperando" || e === "rechazada") && puede.compras_visador && <BotonEnviarOc id={c.id} texto="Reenviar" secundario />}
      {e === "rechazada" && <BotonAccion accion={anularCompraAction.bind(null, c.id)} motivo={`¿Anular ${c.codigo}? Queda en el registro y un administrador puede reactivarla.`}>Anular solicitud</BotonAccion>}
      {resumen && (
        <ConVentana boton={<><IconEye size={14} /> Resumen</>} titulo={`Solicitud ${c.codigo}`} ancho="max-w-3xl" className={BOTON_SEC}>
          <ResumenOc r={resumen} />
        </ConVentana>
      )}
      <a href={`/api/finanzas/compras/${c.id}/oc-pdf`} target="_blank" rel="noopener" className={BOTON_SEC} title="Ver la OC en PDF"><IconFileTypePdf size={14} /> Ver OC</a>
      <a href={`/api/finanzas/compras/${c.id}/oc-pdf?descargar=1`} className={BOTON_SEC} title="Descargar la OC en PDF"><IconDownload size={14} /> Descargar</a>
      {esAdmin && e === "anulada" && <BotonAccion accion={reactivarCompraAction.bind(null, c.id)} confirmar={`¿Reactivar ${c.codigo}? Vuelve al flujo donde estaba.`}>Reactivar</BotonAccion>}
      {esAdmin && (e === "aceptada" || e === "rechazada") && <BotonAccion accion={reabrirRespuestaOcAction.bind(null, c.id)} confirmar="¿Reabrir la respuesta? La OC vuelve a esperar la respuesta del proveedor." titulo="Deshacer la respuesta (solo administrador)">Reabrir</BotonAccion>}
    </>
  );
}
