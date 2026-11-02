"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconClockCheck, IconX } from "@tabler/icons-react";
import { cancelarAction, reservarAction, validarAction } from "@/app/(protegido)/inventario/acciones";
import { CAMPO } from "@/lib/estilos";
import type { EstadoTransferencia } from "@/lib/inventario-modelo";

type LineaPendiente = { id: string; nombre: string; cantidad: number };

export default function AccionesTransferencia({
  id,
  estado,
  lineas = [],
}: {
  id: string;
  estado: EstadoTransferencia;
  lineas?: LineaPendiente[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [parcial, setParcial] = useState(false);
  const [hechas, setHechas] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function correr(fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, irABackorder = false) {
    setError(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "No se pudo completar la acción.");
      if (irABackorder && r.id) router.push(`/inventario/operaciones/${r.id}`);
      else router.refresh();
    });
  }

  function validar() {
    if (!parcial) return correr(() => validarAction(id));
    const mapa: Record<string, number> = {};
    for (const l of lineas) {
      const v = hechas[l.id];
      mapa[l.id] = v === undefined || v === "" ? l.cantidad : Number(v);
    }
    correr(() => validarAction(id, mapa), true);
  }

  if (estado === "hecho" || estado === "cancelado") {
    return <p className="text-sm text-gris">Esta operación está {estado === "hecho" ? "validada" : "cancelada"}; no admite más cambios.</p>;
  }

  const btn = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition disabled:opacity-60";

  return (
    <div className="space-y-3">
      {lineas.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-gris">
          <input type="checkbox" checked={parcial} onChange={(e) => setParcial(e.target.checked)} />
          Entrega parcial (lo que falte queda en un backorder)
        </label>
      )}
      {parcial && (
        <div className="space-y-2">
          {lineas.map((l) => (
            <label key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-tinta">{l.nombre}</span>
              <input
                type="number" min="0" max={l.cantidad} step="0.001"
                value={hechas[l.id] ?? String(l.cantidad)}
                onChange={(e) => setHechas((h) => ({ ...h, [l.id]: e.target.value }))}
                className={`${CAMPO} w-24 text-right`}
                aria-label={`Cantidad hecha de ${l.nombre}`}
              />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {estado === "borrador" && (
          <button onClick={() => correr(() => reservarAction(id))} disabled={pendiente} className={`${btn} border border-borde text-azul hover:border-cian`}>
            <IconClockCheck size={16} /> Confirmar y reservar
          </button>
        )}
        <button onClick={validar} disabled={pendiente} className={`${btn} bg-azul text-white hover:bg-azul-suave`}>
          <IconCheck size={16} /> Validar
        </button>
        <button onClick={() => correr(() => cancelarAction(id))} disabled={pendiente} className={`${btn} text-rose-600 hover:bg-rose-50`}>
          <IconX size={16} /> Cancelar
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
