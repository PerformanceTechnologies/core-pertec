"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { leerRespuesta } from "@/lib/subidas";

/**
 * Saca del inventario una imagen que se subió a mano.
 *
 * Solo esas: las que trajo el borrador son el registro de lo que contenía el
 * archivo original, y para que no salgan en el documento ya está "No usar". Una
 * subida por error, en cambio, no es rastro de nada y quedaría estorbando para
 * siempre en la pantalla.
 */
export default function QuitarImagen({ ofertaId, indice }: { ofertaId: string; indice: number }) {
  const router = useRouter();
  const [quitando, setQuitando] = useState(false);

  const quitar = async () => {
    if (!window.confirm("¿Quitar esta imagen de la oferta? No se puede deshacer.")) return;
    setQuitando(true);
    try {
      const respuesta = await fetch(`/api/ofertas/${ofertaId}/imagenes?indice=${indice}`, {
        method: "DELETE",
      });
      await leerRespuesta(respuesta);
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo quitar la imagen.");
    } finally {
      setQuitando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={quitar}
      disabled={quitando}
      title="Quitar esta imagen de la oferta"
      className="text-[10px] font-medium text-tinta/40 transition-colors hover:text-red-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
    >
      {quitando ? "Quitando…" : "Quitar"}
    </button>
  );
}
