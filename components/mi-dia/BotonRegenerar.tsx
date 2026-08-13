"use client";

import { useFormStatus } from "react-dom";
import RuedaCarga from "@/components/RuedaCarga";
import { regenerarResumenAction } from "@/app/(protegido)/mi-dia/acciones";

/**
 * Regenerar el resumen del día a mano.
 *
 * El botón de "actualizar" que había antes se sacó por una razón que sigue en
 * pie: estaba arriba, junto al título, y era lo primero que uno apretaba, cuando
 * lo normal es que el resumen del día ya esté bien. Cada regeneración es una
 * llamada al modelo sobre el buzón completo.
 *
 * Este es distinto: vive en el pie, al lado del "generado a las", que es
 * justamente donde uno mira cuando sospecha que el resumen quedó viejo.
 */
export default function BotonRegenerar() {
  return (
    <form action={regenerarResumenAction} className="contents">
      <BotonInterno />
    </form>
  );
}

/**
 * En su propio componente porque `useFormStatus` solo reporta el estado del
 * <form> que tiene ARRIBA en el árbol: llamándolo en el mismo componente que
 * renderiza el <form>, `pending` nunca se pone en true.
 */
function BotonInterno() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-tinta/45 transition hover:bg-crema hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-naranjo disabled:cursor-wait disabled:hover:bg-transparent"
    >
      {pending ? (
        <>
          <RuedaCarga />
          Rearmando el resumen…
        </>
      ) : (
        <>
          <span aria-hidden>↻</span>
          Regenerar ahora
        </>
      )}
    </button>
  );
}
