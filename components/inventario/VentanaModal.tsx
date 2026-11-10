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
  variante = "estandar",
  icono,
  completaEnMovil = false,
  children,
}: {
  abierta: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: string;
  /** Una clase `max-w-*` de Tailwind. */
  ancho?: string;
  /**
   * «hoja»: más redondeada y compacta, con el fondo desenfocado (la usa Contactos). La estándar
   * es la de siempre: el resto del Core no cambia.
   */
  variante?: "estandar" | "hoja";
  /** Un ícono a la izquierda del título (solo en la variante «hoja»). */
  icono?: React.ReactNode;
  /** En el celular ocupa toda la pantalla (como una app), con el título fijo arriba. */
  completaEnMovil?: boolean;
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
  const hoja = variante === "hoja";

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-3 sm:p-6 ${completaEnMovil ? "max-lg:!p-0" : ""} ${hoja ? "animar-fondo-ventana bg-tinta/35 backdrop-blur-sm" : "bg-tinta/60 sm:p-8"}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div className={`my-auto w-full ${ancho} bg-superficie ${completaEnMovil ? "max-lg:!my-0 max-lg:min-h-full max-lg:!max-w-none max-lg:!rounded-none" : ""} ${hoja ? "animar-ventana rounded-[28px] border border-borde/60 shadow-[0_24px_64px_-12px_rgba(23,20,17,0.35)]" : "rounded-2xl shadow-2xl"}`}>
        <div className={`flex items-start gap-3 ${hoja ? "px-5 pb-1 pt-4" : "border-b border-borde px-5 py-4"} ${completaEnMovil ? "max-lg:sticky max-lg:top-0 max-lg:z-20 max-lg:bg-superficie" : ""}`}>
          {hoja && icono}
          <div className={`min-w-0 flex-1 ${hoja && icono ? "self-center" : ""}`}>
            <h2 className={hoja ? "text-[17px] font-bold tracking-tight text-tinta" : "titular text-base text-azul"}>{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-xs text-gris">{descripcion}</p>}
          </div>
          <button
            ref={cerrar}
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className={
              hoja
                ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tinta/[0.06] text-gris transition hover:bg-tinta/[0.12] hover:text-tinta"
                : "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gris transition hover:bg-borde/60 hover:text-tinta"
            }
          >
            <IconX size={hoja ? 16 : 18} />
          </button>
        </div>

        <div className={hoja ? "px-5 pb-5 pt-3" : "p-5"}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
