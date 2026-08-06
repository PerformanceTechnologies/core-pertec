"use client";

import { useState, useTransition } from "react";
import type { ResultadoBorrado } from "@/app/(protegido)/rendir-gastos/acciones";

/**
 * Borra una rendición, con confirmación en dos pasos.
 *
 * No usa `confirm()` del navegador: en algunos navegadores queda bloqueado y el
 * botón simplemente no haría nada. El segundo clic dentro del propio componente
 * es explícito y no depende de nada externo.
 *
 * Para una rendición YA CARGADA la confirmación es distinta y más explícita,
 * porque lo que la gente espera no es lo que pasa: los gastos NO se borran de
 * Odoo (el wrapper del core es create-only), y con la rendición se va la única
 * traza local de cuáles fueron. Por eso se muestran los ids: son lo que hay que
 * anotar para poder limpiarlos a mano allá.
 */
export default function BotonBorrarRendicion({
  id,
  titulo,
  cargada,
  idsOdoo,
  borrar,
}: {
  id: string;
  titulo: string;
  cargada: boolean;
  idsOdoo: number[];
  // La Server Action se recibe como prop desde el server component: así este
  // componente no importa nada del servidor.
  borrar: (id: string) => Promise<ResultadoBorrado>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();

  if (error) {
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-right text-[10px] text-red-600">{error}</p>
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
        className="rounded-md border border-borde px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-tinta/50 transition hover:border-red-600/40 hover:text-red-600"
      >
        Borrar
      </button>
    );
  }

  return (
    // Sin shrink-0 ni max-w-*: esto vive dentro de una celda de ancho fijo
    // (table-fixed), donde un hijo más ancho que su columna no la ensancha, se
    // desborda por el costado y se lo come el overflow del contenedor. El bloque
    // se ajusta al ancho de la celda y el texto largo baja de línea.
    <div className="flex flex-col items-end gap-1">
      {cargada ? (
        <p className="text-right text-[10px] leading-tight text-naranjo">
          Los gastos{" "}
          <span className="font-semibold">{idsOdoo.length > 0 ? idsOdoo.join(", ") : "creados"}</span> NO se
          borran de Odoo. Anotalos si los vas a limpiar allá: al borrar esto se pierde el registro de cuáles
          fueron.
        </p>
      ) : (
        <span className="text-[10px] text-tinta/60">¿Borrar?</span>
      )}
      {/* flex-wrap para que en la columna angosta el "Cancelar" caiga debajo en
          vez de salirse. */}
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <button
          type="button"
          disabled={enCurso}
          onClick={() =>
            iniciar(async () => {
              const r = await borrar(id);
              // En el caso exitoso no hay nada que hacer: revalidatePath saca la
              // fila de la lista y este componente se desmonta.
              if (!r.ok) setError(r.error);
            })
          }
          className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {enCurso ? "Borrando..." : cargada ? "Borrar igual" : "Sí, borrar"}
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
    </div>
  );
}
