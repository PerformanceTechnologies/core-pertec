"use client";

import { useEffect, useState } from "react";
import { IconArrowLeft, IconCopy, IconLoader2 } from "@tabler/icons-react";
import VentanaModal from "@/components/contratos/VentanaModal";
import { historialProveedorAction, detalleOcHistoricaAction, type DetalleOcHistorica, type OcHistorica } from "@/app/(protegido)/gestion-financiera/acciones-historial";
import { formatoMonto, netoLineaOc } from "@/lib/fin/oc-modelo";
import { BOTON } from "./estilos";

/** Las OC anteriores de un proveedor: se elige una, se ve y se copia al formulario. */
export default function HistorialProveedor({ proveedor, alCerrar, alCopiar }: {
  proveedor: { id: string; nombre: string } | null;
  alCerrar: () => void;
  alCopiar: (d: DetalleOcHistorica) => void;
}) {
  const [ocs, setOcs] = useState<OcHistorica[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<OcHistorica | null>(null);
  const [detalle, setDetalle] = useState<DetalleOcHistorica | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setOcs(null); setError(null); setElegida(null); setDetalle(null);
    if (!proveedor) return;
    let vivo = true;
    historialProveedorAction(proveedor.id).then((r) => {
      if (!vivo) return;
      if (r.ok) setOcs(r.ocs); else setError(r.error);
    });
    return () => { vivo = false; };
  }, [proveedor]);

  async function abrir(oc: OcHistorica) {
    setElegida(oc); setDetalle(null); setCargando(true);
    const r = await detalleOcHistoricaAction(oc.id);
    setCargando(false);
    if (r.ok) setDetalle(r.detalle); else setError(r.error);
  }

  return (
    <VentanaModal abierta={Boolean(proveedor)} alCerrar={alCerrar} titulo={elegida ? elegida.codigo : `Historial · ${proveedor?.nombre ?? ""}`} descripcion={elegida ? elegida.titulo : "Las órdenes de compra hechas a este proveedor. Elige una para verla y copiarla."} ancho="max-w-3xl">
      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!elegida && (
        ocs === null && !error ? (
          <p className="flex items-center gap-2 py-6 text-sm text-gris"><IconLoader2 size={16} className="animate-spin" /> Buscando sus OC…</p>
        ) : ocs && ocs.length === 0 ? (
          <p className="py-6 text-center text-sm text-gris">Todavía no hay órdenes de compra para este proveedor.</p>
        ) : (
          <ul className="divide-y divide-borde/60">
            {ocs?.map((oc) => (
              <li key={oc.id}>
                <button type="button" onClick={() => abrir(oc)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-naranjo/[0.06]">
                  <span className="w-20 shrink-0 font-mono text-xs font-semibold text-tinta">{oc.codigo}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-tinta">{oc.titulo || "Sin título"}</span>
                    <span className="text-[11px] text-gris">{oc.fecha ?? "—"}{oc.anulada ? " · anulada" : ""}</span>
                  </span>
                  {oc.neto !== null && <span className="shrink-0 text-sm font-semibold tabular-nums text-tinta">{formatoMonto(oc.neto, oc.moneda)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      {elegida && (
        <div className="space-y-3">
          <button type="button" onClick={() => { setElegida(null); setDetalle(null); }} className="inline-flex items-center gap-1 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Volver al historial</button>
          {cargando || !detalle ? (
            <p className="flex items-center gap-2 py-6 text-sm text-gris"><IconLoader2 size={16} className="animate-spin" /> Cargando la OC…</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-borde/60">
                <table className="w-full text-sm">
                  <thead className="bg-tinta/[0.03] text-[11px] uppercase tracking-wide text-gris">
                    <tr><th className="px-3 py-2 text-left">Descripción</th><th className="px-2 py-2 text-right">Cant.</th><th className="px-2 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Neto</th></tr>
                  </thead>
                  <tbody className="divide-y divide-borde/50">
                    {detalle.lineas.map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-tinta">{l.descripcion}{l.nota && <span className="block text-[11px] text-gris">{l.nota}</span>}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{l.cantidad} {l.unidad ?? ""}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatoMonto(l.precioUnitario, detalle.moneda)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatoMonto(netoLineaOc(l, detalle.moneda), detalle.moneda)}</td>
                      </tr>
                    ))}
                    {detalle.lineas.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-gris">Esta OC no tiene ítems.</td></tr>}
                  </tbody>
                </table>
              </div>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-gris sm:grid-cols-2">
                {detalle.formaPago && <div><dt className="inline font-semibold">Pago: </dt><dd className="inline">{detalle.formaPago}{detalle.condicionPagoDias ? ` a ${detalle.condicionPagoDias} días` : ""}</dd></div>}
                {detalle.entregaPlazo && <div><dt className="inline font-semibold">Plazo: </dt><dd className="inline">{detalle.entregaPlazo}</dd></div>}
                {detalle.entregaLugar && <div><dt className="inline font-semibold">Entrega: </dt><dd className="inline">{detalle.entregaLugar}</dd></div>}
                {detalle.atencion && <div><dt className="inline font-semibold">Atención: </dt><dd className="inline">{detalle.atencion}</dd></div>}
              </dl>
              <div className="flex justify-end">
                <button type="button" onClick={() => alCopiar(detalle)} className={BOTON}><IconCopy size={15} /> Copiar esta OC</button>
              </div>
            </>
          )}
        </div>
      )}
    </VentanaModal>
  );
}
