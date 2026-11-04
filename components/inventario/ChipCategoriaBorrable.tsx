"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconX } from "@tabler/icons-react";
import { eliminarCategoriaAction } from "@/app/(protegido)/inventario/acciones";

/**
 * Una categoría de la configuración con su botón para borrarla. Pide confirmar y, si hay
 * productos que la usan, dice cuántos: no se borran, quedan «sin categoría».
 */
export default function ChipCategoriaBorrable({ id, nombre, productos }: { id: string; nombre: string; productos: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const borrar = () => {
    const aviso = productos > 0
      ? `¿Eliminar la categoría «${nombre}»?\n\n${productos} ${productos === 1 ? "producto la usa y quedará" : "productos la usan y quedarán"} sin categoría (los productos no se borran).`
      : `¿Eliminar la categoría «${nombre}»?`;
    if (!confirm(aviso)) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarCategoriaAction(id);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <span className={`group inline-flex items-center gap-1 rounded-full bg-borde/60 py-1 pl-3 pr-1 text-sm text-tinta transition ${pendiente ? "opacity-50" : ""}`} title={error ?? undefined}>
      {nombre}
      {productos > 0 && <span className="text-xs text-gris">({productos})</span>}
      <button
        type="button"
        onClick={borrar}
        disabled={pendiente}
        aria-label={`Eliminar la categoría ${nombre}`}
        title="Eliminar categoría"
        className={`grid h-5 w-5 place-items-center rounded-full transition hover:bg-rose-500/15 hover:text-rose-600 ${error ? "text-rose-600" : "text-gris"}`}
      >
        {pendiente ? <IconLoader2 size={12} className="animate-spin" /> : <IconX size={12} stroke={2.5} />}
      </button>
    </span>
  );
}
