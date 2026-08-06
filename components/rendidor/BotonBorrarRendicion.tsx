"use client";

import { useState, useTransition } from "react";
import type { ResultadoBorrado } from "@/app/(protegido)/rendir-gastos/acciones";

/**
 * Borra una rendición en borrador, con confirmación en dos pasos.
 *
 * No usa `confirm()` del navegador: en algunos navegadores queda bloqueado y el
 * botón simplemente no haría nada. El segundo clic dentro del propio componente
 * es explícito y no depende de nada externo.
 *
 * El borrado no se deshace, así que el paso intermedio no es negociable —
 * la lista es una fila de tarjetas parecidas y el clic equivocado es fácil.
 */
export default function BotonBorrarRendicion({
  id,
  titulo,
  borrar,
}: {
  id: string;
  titulo: string;
  // La Server Action se recibe como prop desde el server component: así este
  // componente no importa nada del servidor.
  borrar: (id: string) => Promise<ResultadoBorrado>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();

  if (error) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="max-w-xs text-right text-[10px] text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirmando(false);
          }}
          className="text-[10px] font-semibold uppercase tracking-wide text-tinta/50 underline hover:text-tinta"
        >
          Entendido
        </button>
      </div>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        aria-label={`Borrar la rendición ${titulo}`}
        className="shrink-0 rounded-md border border-borde px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-tinta/50 transition hover:border-red-600/40 hover:text-red-600"
      >
        Borrar
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-[10px] text-tinta/60">¿Borrar?</span>
      <button
        type="button"
        disabled={enCurso}
        onClick={() =>
          iniciar(async () => {
            const r = await borrar(id);
            // En el caso exitoso no hay nada que hacer: revalidatePath saca la
            // tarjeta de la lista y este componente se desmonta.
            if (!r.ok) setError(r.error);
          })
        }
        className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-red-700 disabled:opacity-50"
      >
        {enCurso ? "Borrando..." : "Sí, borrar"}
      </button>
      <button
        type="button"
        disabled={enCurso}
        onClick={() => setConfirmando(false)}
        className="text-[10px] font-semibold uppercase tracking-wide text-tinta/50 underline hover:text-tinta disabled:opacity-50"
      >
        Cancelar
      </button>
    </div>
  );
}
