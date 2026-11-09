"use client";

import { useEffect, useRef } from "react";

/**
 * Para una fila de pestañas que se desliza de lado en el celular: al cambiar de página, deja la
 * pestaña activa (aria-current="page") a la vista, en vez de que quede escondida a la derecha.
 */
export function usePestanaALaVista<T extends HTMLElement>(ruta: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const caja = ref.current;
    const activa = caja?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!caja || !activa) return;
    const izquierda = activa.offsetLeft - (caja.clientWidth - activa.offsetWidth) / 2;
    caja.scrollTo({ left: Math.max(0, izquierda), behavior: "instant" as ScrollBehavior });
  }, [ruta]);
  return ref;
}
