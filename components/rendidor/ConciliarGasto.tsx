"use client";

import { useState, useTransition } from "react";
import { IconCircleCheck, IconLoader2, IconScale } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { CAMPO } from "@/lib/estilos";
import { conciliarGastoAction, facturasCandidatasAction } from "@/app/(protegido)/rendir-gastos/acciones-fondos";
import { esFactura } from "@/lib/rendidor/mis-gastos-modelo";
import type { FacturaCandidata } from "@/lib/rendidor/proveedores";
import type { GastoRendicion } from "@/lib/rendidor/tipos";

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/**
 * La conciliación de un gasto validado. Una factura se liga a la factura recibida de Finanzas
 * (se sugieren las del mismo proveedor y folio); si no está registrada, se deja escrito por qué.
 * Lo demás (boletas, peajes, pasajes…) se concilia con un clic. Solo lo ve quien puede conciliar.
 */
export default function ConciliarGasto({
  informeId,
  gasto,
  puedeConciliar,
  alCambiar,
  compacto = false,
}: {
  informeId: string;
  gasto: GastoRendicion;
  puedeConciliar: boolean;
  alCambiar: (c: GastoRendicion["conciliacion"]) => void;
  /** En una fila de lista: solo el estado y el botón, sin el recuadro. */
  compacto?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const [facturas, setFacturas] = useState<FacturaCandidata[] | null>(null);
  const [documentoId, setDocumentoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const factura = esFactura(gasto.tipoDocumento);
  const c = gasto.conciliacion;

  const abrir = () => {
    setAbierta(true);
    setError(null);
    if (factura && !facturas) {
      iniciar(async () => {
        const r = await facturasCandidatasAction(informeId, gasto.id);
        if (!r.ok) return setError(r.error);
        setFacturas(r.facturas);
        setDocumentoId(r.facturas.find((f) => f.coincide)?.id ?? null);
      });
    }
  };

  const conciliar = (deshacer: boolean) =>
    iniciar(async () => {
      setError(null);
      const r = await conciliarGastoAction(informeId, gasto.id, { documentoId, nota, deshacer });
      if (!r.ok) return setError(r.error);
      const doc = facturas?.find((f) => f.id === documentoId);
      alCambiar(deshacer ? null : { por: "", en: new Date().toISOString(), documentoId, documentoRef: doc ? `Factura ${doc.folio}${doc.razonSocial ? ` · ${doc.razonSocial}` : ""}` : null, nota: nota.trim() || null });
      setAbierta(false);
    });

  return (
    <div className={compacto ? "inline-flex items-center gap-1.5 text-[11px]" : "mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs"}>
      {!compacto && <IconScale size={15} className="shrink-0 text-gris" />}
      {c ? (
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-emerald-700">
          <IconCircleCheck size={14} /> Conciliado
          {(c.documentoRef || c.nota) && <span className="truncate font-normal text-gris">· {c.documentoRef ?? c.nota}</span>}
        </span>
      ) : (
        <span className="min-w-0 flex-1 font-semibold text-gris">Por conciliar{factura ? " · factura" : ""}</span>
      )}
      {puedeConciliar && (
        <button type="button" onClick={c ? () => conciliar(true) : abrir} disabled={pendiente} className="font-semibold text-naranjo underline underline-offset-2 disabled:opacity-40">
          {c ? "Deshacer" : "Conciliar"}
        </button>
      )}
      {abierta && (
        <VentanaModal abierta alCerrar={() => setAbierta(false)} titulo="Conciliar gasto" descripcion={`${gasto.proveedor || "Gasto"} · ${pesos(gasto.total)}`} ancho="max-w-lg">
          <div className="space-y-3">
            {factura && (
              <div>
                <p className="mb-1 text-xs font-semibold text-gris">Factura recibida en Finanzas</p>
                {!facturas ? (
                  <p className="flex items-center gap-2 text-sm text-gris"><IconLoader2 size={14} className="animate-spin" /> Buscando…</p>
                ) : facturas.length === 0 ? (
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800">No hay una factura de este proveedor registrada en Finanzas. Escribe abajo por qué se concilia igual.</p>
                ) : (
                  <ul className="max-h-56 divide-y divide-borde overflow-auto rounded-xl border border-borde">
                    {facturas.map((f) => (
                      <li key={f.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                          <input type="radio" name="factura" checked={documentoId === f.id} onChange={() => setDocumentoId(f.id)} className="accent-[var(--color-naranjo)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-tinta">Factura {f.folio} {f.coincide && <span className="ml-1 rounded bg-emerald-500/12 px-1.5 text-[10px] text-emerald-700">Coincide</span>}</span>
                            <span className="block truncate text-[11px] text-gris">{f.razonSocial ?? f.rut} · {f.fecha}</span>
                          </span>
                          <span className="font-condensed text-base font-bold tabular-nums">{pesos(f.total)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gris">Nota{factura && !documentoId ? " *" : " (opcional)"}</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} className={CAMPO} />
            </label>
            {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierta(false)} className="inline-flex min-h-10 items-center rounded-lg border border-borde px-4 text-sm font-semibold text-gris">Cancelar</button>
              <button type="button" disabled={pendiente} onClick={() => conciliar(false)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-naranjo px-5 text-sm font-bold text-white disabled:opacity-40">
                {pendiente && <IconLoader2 size={16} className="animate-spin" />} Conciliar
              </button>
            </div>
          </div>
        </VentanaModal>
      )}
    </div>
  );
}
