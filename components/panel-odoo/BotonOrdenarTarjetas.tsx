"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";

// Mismo patron de modal que ModalExpandirTarjeta (hoja anclada abajo en
// mobile, dialogo centrado desde sm:), pero disparado por un boton propio en
// vez de vivir como una caja suelta en la pagina -- eso se veia mal y quedaba
// desconectado del resto de los controles de admin (junto a "Actualizar
// ahora" es donde un admin ya espera encontrar acciones de esta pagina).
// El contenido (la lista de modulos con los botones subir/bajar) sigue
// siendo un Server Component: se pasa como children desde page.tsx en vez de
// vivir aca, porque ese contenido usa Server Actions con formularios planos
// y no necesita ser cliente.
export default function BotonOrdenarTarjetas({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
      >
        ⇅ Ordenar tarjetas
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-white shadow-xl sm:max-w-md sm:rounded-2xl"
            onClick={(evento) => evento.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-borde bg-white px-5 py-4">
              <p className="font-condensed text-lg font-bold uppercase text-tinta">Ordenar tarjetas</p>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="shrink-0 rounded-lg p-1.5 text-tinta/50 transition hover:bg-crema hover:text-tinta"
              >
                <IconX size={20} stroke={1.75} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
