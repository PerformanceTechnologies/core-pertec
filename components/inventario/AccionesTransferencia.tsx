"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconClockCheck, IconX } from "@tabler/icons-react";
import { cancelarAction, reservarAction, validarAction } from "@/app/(protegido)/inventario/acciones";
import type { EstadoTransferencia } from "@/lib/inventario-modelo";

export default function AccionesTransferencia({ id, estado }: { id: string; estado: EstadoTransferencia }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function correr(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    iniciar(async () => {
      const r = await fn(id);
      if (r.ok) router.refresh();
      else setError(r.error ?? "No se pudo completar la acción.");
    });
  }

  if (estado === "hecho" || estado === "cancelado") {
    return <p className="text-sm text-gris">Esta operación está {estado === "hecho" ? "validada" : "cancelada"}; no admite más cambios.</p>;
  }

  const btn = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition disabled:opacity-60";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {estado === "borrador" && (
          <button onClick={() => correr(reservarAction)} disabled={pendiente} className={`${btn} border border-borde text-azul hover:border-cian`}>
            <IconClockCheck size={16} /> Confirmar y reservar
          </button>
        )}
        <button onClick={() => correr(validarAction)} disabled={pendiente} className={`${btn} bg-azul text-white hover:bg-azul-suave`}>
          <IconCheck size={16} /> Validar
        </button>
        <button onClick={() => correr(cancelarAction)} disabled={pendiente} className={`${btn} text-rose-600 hover:bg-rose-50`}>
          <IconX size={16} /> Cancelar
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
