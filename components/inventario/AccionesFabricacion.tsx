"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArchive, IconArrowBackUp, IconCircleCheck, IconCopy, IconFileDescription, IconLoader2, IconRefresh } from "@tabler/icons-react";
import {
  actualizarCostosAction,
  archivarFabricacionAction,
  cambiarEstadoFabricacionAction,
  duplicarFabricacionAction,
  restaurarFabricacionAction,
} from "@/app/(protegido)/inventario/fabricacion/acciones";
import type { EstadoFabricacion } from "@/lib/fabricacion-modelo";

const BOTON = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-borde px-3 text-[13px] font-semibold transition disabled:opacity-50";

/**
 * Los botones de la ficha: activar, actualizar costos, duplicar, archivar y restaurar. Las pantallas
 * solo dibujan archivar/restaurar si la persona puede, pero eso es comodidad: la Server Action
 * vuelve a comprobar el permiso y, si no corresponde, responde con el motivo y se muestra aquí.
 */
export default function AccionesFabricacion({
  id,
  nombre,
  estado,
  hayEnlazados,
  puedeAdministrar,
}: {
  id: string;
  nombre: string;
  estado: EstadoFabricacion;
  /** Si algún ítem está enlazado al catálogo (si no, «Actualizar costos» no tendría qué hacer). */
  hayEnlazados: boolean;
  puedeAdministrar: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cual, setCual] = useState<string | null>(null);

  function correr(clave: string, tarea: () => Promise<{ ok: true; id?: string; mensaje?: string } | { ok: false; error: string }>, despues?: (id?: string) => void) {
    setAviso(null);
    setCual(clave);
    iniciar(async () => {
      const r = await tarea();
      if (!r.ok) return setAviso({ ok: false, texto: r.error });
      if (r.mensaje) setAviso({ ok: true, texto: r.mensaje });
      if (despues) despues(r.id);
      else router.refresh();
    });
  }

  const girando = (clave: string, Icono: typeof IconRefresh) => (pendiente && cual === clave ? <IconLoader2 size={15} className="animate-spin" /> : <Icono size={15} />);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {estado === "borrador" && (
          <button type="button" disabled={pendiente} onClick={() => correr("activar", () => cambiarEstadoFabricacionAction(id, "activo"))} className={`${BOTON} border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300`}>
            {girando("activar", IconCircleCheck)} Activar ficha
          </button>
        )}
        {estado === "activo" && (
          <button type="button" disabled={pendiente} onClick={() => correr("borrador", () => cambiarEstadoFabricacionAction(id, "borrador"))} className={`${BOTON} text-gris hover:border-naranjo/50 hover:text-tinta`}>
            {girando("borrador", IconFileDescription)} Volver a borrador
          </button>
        )}
        {estado !== "archivado" && hayEnlazados && (
          <button type="button" disabled={pendiente} onClick={() => correr("costos", () => actualizarCostosAction(id))} className={`${BOTON} text-azul hover:border-cian`} title="Trae el costo actual del catálogo a los materiales enlazados">
            {girando("costos", IconRefresh)} Actualizar costos
          </button>
        )}
        <button type="button" disabled={pendiente} onClick={() => correr("duplicar", () => duplicarFabricacionAction(id), (nuevo) => nuevo && router.push(`/inventario/fabricacion/${nuevo}`))} className={`${BOTON} text-azul hover:border-cian`} title="Crea una copia como borrador, útil para variantes">
          {girando("duplicar", IconCopy)} Duplicar
        </button>
        {puedeAdministrar && estado !== "archivado" && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              if (!confirm(`¿Archivar «${nombre}»?\n\nDeja de aparecer en la lista y no se puede modificar. No se borra nada: lo puedes restaurar desde Archivados.`)) return;
              correr("archivar", () => archivarFabricacionAction(id), () => router.push("/inventario/fabricacion"));
            }}
            className={`${BOTON} text-gris hover:border-amber-500/60 hover:text-amber-700`}
          >
            {girando("archivar", IconArchive)} Archivar
          </button>
        )}
        {puedeAdministrar && estado === "archivado" && (
          <button type="button" disabled={pendiente} onClick={() => correr("restaurar", () => restaurarFabricacionAction(id))} className={`${BOTON} text-azul hover:border-cian`}>
            {girando("restaurar", IconArrowBackUp)} Restaurar
          </button>
        )}
      </div>
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-600"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
