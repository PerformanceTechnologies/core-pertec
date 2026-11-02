"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconLock, IconLockOpen, IconTrash } from "@tabler/icons-react";
import { cambiarEstadoServicioAction, cerrarContratoAction, eliminarServicioAction } from "@/app/(protegido)/flota/acciones";
import type { EstadoServicio } from "@/lib/flota-modelo";

const BOTON = "grid h-8 w-8 place-items-center rounded-lg text-gris-suave transition disabled:opacity-50";

/** Marcar hecho o borrar un servicio, desde su fila. */
export function AccionesServicio({ id, vehiculoId, estado }: { id: string; vehiculoId: string; estado: EstadoServicio }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const correr = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    iniciar(async () => {
      const r = await f();
      if (r.ok) router.refresh();
      else alert(r.error);
    });

  return (
    <span className="inline-flex items-center gap-0.5">
      {(estado === "programado" || estado === "en_curso") && (
        <button title="Marcar como hecho" disabled={pendiente} onClick={() => correr(() => cambiarEstadoServicioAction(id, "hecho", vehiculoId))} className={`${BOTON} hover:text-emerald-600`}>
          <IconCheck size={16} />
        </button>
      )}
      <button
        title="Eliminar"
        disabled={pendiente}
        onClick={() => confirm("¿Eliminar este servicio?") && correr(() => eliminarServicioAction(id, vehiculoId))}
        className={`${BOTON} hover:text-rose-500`}
      >
        <IconTrash size={16} />
      </button>
    </span>
  );
}

/** Cerrar o reabrir un contrato (uno cerrado ya no avisa ni suma costos futuros en el tablero). */
export function AccionesContrato({ id, vehiculoId, cerrado }: { id: string; vehiculoId: string; cerrado: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <button
      title={cerrado ? "Reabrir" : "Cerrar contrato"}
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await cerrarContratoAction(id, !cerrado, vehiculoId);
          if (r.ok) router.refresh();
          else alert(r.error);
        })
      }
      className={`${BOTON} hover:text-tinta`}
    >
      {cerrado ? <IconLockOpen size={16} /> : <IconLock size={16} />}
    </button>
  );
}

