"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArchive, IconArrowBackUp, IconLoader2 } from "@tabler/icons-react";
import { archivarProductoAction, restaurarProductoAction } from "@/app/(protegido)/inventario/acciones";

// Los botones de archivar y restaurar. Las pantallas solo los dibujan si la persona puede (ver
// puedeArchivar en lib/inventario-archivado.ts), pero eso es comodidad: quien de verdad decide es la
// Server Action, que vuelve a comprobar el permiso. Si alguien los llegara a ver sin poder, la acción
// responde con el motivo y se muestra aquí.

/** «Archivar», con confirmación. Al terminar vuelve al catálogo, de donde el producto ya salió. */
export function BotonArchivar({ productoId, nombre }: { productoId: string; nombre: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const archivar = () => {
    const aviso =
      `¿Archivar «${nombre}»?\n\n` +
      "Dejará de aparecer en el catálogo, en las operaciones nuevas y en la valorización. " +
      "No se borra nada: su historial se conserva y lo puedes restaurar desde Productos › Archivados.";
    if (!confirm(aviso)) return;
    setError(null);
    iniciar(async () => {
      const r = await archivarProductoAction(productoId);
      if (r.ok) router.push("/inventario/productos");
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={archivar}
        disabled={pendiente}
        className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-gris transition hover:border-amber-500/60 hover:text-amber-700 disabled:opacity-50"
      >
        {pendiente ? <IconLoader2 size={16} className="animate-spin" /> : <IconArchive size={16} />}
        Archivar
      </button>
      {error && <p role="alert" className="max-w-xs text-right text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/** «Restaurar»: el producto vuelve al catálogo tal como estaba. Sin confirmación: no destruye nada. */
export function BotonRestaurar({ productoId, nombre, chico = false }: { productoId: string; nombre: string; chico?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const restaurar = () => {
    setError(null);
    iniciar(async () => {
      const r = await restaurarProductoAction(productoId);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={restaurar}
        disabled={pendiente}
        aria-label={`Restaurar ${nombre}`}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-borde font-semibold text-azul transition hover:border-cian disabled:opacity-50 ${chico ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
      >
        {pendiente ? <IconLoader2 size={16} className="animate-spin" /> : <IconArrowBackUp size={16} />}
        Restaurar
      </button>
      {error && <p role="alert" className="max-w-xs text-right text-xs text-rose-600">{error}</p>}
    </div>
  );
}
