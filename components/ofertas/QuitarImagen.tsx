"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { quitarImagenDeOferta } from "@/lib/ofertas/subir-imagenes";

/**
 * Saca del inventario una imagen que se subió a mano.
 *
 * Vale para cualquiera. Antes solo para las subidas a mano —las del borrador son el
 * registro de lo que contenía el archivo original— pero el panel muestra las dos
 * clases y la mayoría son del borrador: un botón que funciona en una de cada diez
 * fotos se lee como un botón roto. Lo que protege es la confirmación, que dice qué
 * se pierde según de dónde vino la foto.
 */
export default function QuitarImagen({
  ofertaId,
  indice,
  delBorrador = false,
}: {
  ofertaId: string;
  indice: number;
  /** Cambia el aviso: una del borrador solo vuelve subiendo el archivo original. */
  delBorrador?: boolean;
}) {
  const router = useRouter();
  const [quitando, setQuitando] = useState(false);

  const quitar = async () => {
    if (!window.confirm(avisoDeQuitar(delBorrador))) return;
    setQuitando(true);
    try {
      await quitarImagenDeOferta(ofertaId, indice);
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

/** Lo que se pierde al quitar una foto, según de dónde vino. */
export function avisoDeQuitar(delBorrador: boolean): string {
  return delBorrador
    ? "Esta foto venía del borrador. Si la quitás, para recuperarla hay que volver a subir el archivo original. ¿Quitarla de la oferta?"
    : "¿Quitar esta foto de la oferta? No se puede deshacer.";
}
