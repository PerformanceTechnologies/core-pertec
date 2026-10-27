"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { crearLoteAction } from "@/app/(protegido)/inventario/acciones";
import type { Seguimiento } from "@/lib/inventario-modelo";

export default function FormularioLote({ productoId, seguimiento }: { productoId: string; seguimiento: Seguimiento }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const esSerie = seguimiento === "serie";

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = await crearLoteAction(productoId, fd);
      if (r.ok) {
        router.refresh();
        (document.getElementById(`form-lote-${productoId}`) as HTMLFormElement | null)?.reset();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form id={`form-lote-${productoId}`} action={enviar} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-xs font-semibold text-gris">{esSerie ? "Número de serie" : "Nombre del lote"}</span>
          <input name="nombre" required className={CAMPO} placeholder={esSerie ? "SN-00123" : "L-2026-01"} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-gris">Vencimiento (opcional)</span>
          <input name="fechaVencimiento" type="date" className={CAMPO} />
        </label>
        <button
          type="submit"
          disabled={pendiente}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian disabled:opacity-60"
        >
          <IconPlus size={16} /> Agregar
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
