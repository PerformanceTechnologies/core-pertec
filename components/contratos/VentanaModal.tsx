"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";

/**
 * Una ventana emergente: título, cuerpo con su propio desplazamiento y cierre con Escape,
 * con la X o haciendo clic fuera.
 *
 * Existe para que lo que se hace de vez en cuando —agregar un cargo, corregir un
 * documento— no ocupe la página todo el tiempo. En la configuración, cada formulario
 * abierto empujaba al resto hacia abajo y la hoja era un solo pergamino.
 *
 * Detalles que no se ven:
 *  · Va en un portal sobre <body>. El contenedor de la página lleva .animar-entrada, y una
 *    animación de opacidad rellenando crea un contexto de apilamiento donde el z-50 del
 *    diálogo deja de ganarle a la barra lateral (mismo motivo que VisorDeDocumento).
 *  · El fondo no se desplaza mientras está abierta, y se devuelve el foco a quien la abrió.
 *  · El clic fuera cierra solo si EMPEZÓ fuera (onMouseDown): seleccionar texto de un campo y
 *    soltar el botón sobre el fondo no debe cerrar una ventana con un formulario a medias.
 *  · El cuerpo se renderiza solo mientras está abierta: al cerrar, los formularios se
 *    desmontan y la próxima vez nacen con sus valores iniciales, sin arrastrar lo tipeado.
 */
export default function VentanaModal({
  abierta,
  alCerrar,
  titulo,
  descripcion,
  ancho = "max-w-2xl",
  children,
}: {
  abierta: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: string;
  /** Una clase `max-w-*` de Tailwind. */
  ancho?: string;
  children: React.ReactNode;
}) {
  const cerrar = useRef<HTMLButtonElement>(null);
  const alCerrarRef = useRef(alCerrar);
  useEffect(() => {
    alCerrarRef.current = alCerrar;
  });

  useEffect(() => {
    if (!abierta) return;

    const quienAbrio = document.activeElement as HTMLElement | null;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrarRef.current();
    };
    document.addEventListener("keydown", alTeclear);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrar.current?.focus();

    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
      quienAbrio?.focus?.();
    };
  }, [abierta]);

  if (!abierta) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/60 p-3 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div className={`my-auto w-full ${ancho} rounded-2xl bg-superficie shadow-2xl`}>
        <div className="flex items-start gap-3 border-b border-borde px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="titular text-base text-azul">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-xs text-gris">{descripcion}</p>}
          </div>
          <button
            ref={cerrar}
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gris transition hover:bg-borde/60 hover:text-tinta"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
