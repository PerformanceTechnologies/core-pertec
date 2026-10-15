"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconUpload, IconX } from "@tabler/icons-react";
import SubidorDeArchivos from "./SubidorDeArchivos";

/**
 * Subir a una carpeta sin entrar en ella.
 *
 * Una carpeta de requisitos tiene doce o quince subcarpetas y cada una espera un
 * documento. Obligar a entrar, subir y volver por cada una son tres pasos por
 * documento: con quince, cuarenta y cinco navegaciones para una tarea que es
 * "subir quince archivos".
 *
 * El diálogo monta el mismo subidor de siempre, apuntado a la carpeta de esa
 * fila, así que el comentario y el paso a "subido" funcionan igual que adentro.
 */
export default function SubidaEnLinea({
  seccion,
  nombre,
  ruta,
  itemId,
  prepararSubida,
  registrarSubida,
  refrescar,
}: {
  seccion: string;
  nombre: string;
  ruta: string;
  itemId: string;
  prepararSubida: (seccion: string, rutaCarpeta: string, nombre: string) => Promise<{ url: string }>;
  registrarSubida: (datos: {
    seccion: string;
    itemIdArchivo: string;
    rutaArchivo: string;
    comentario: string;
    itemIdCarpeta: string | null;
    rutaCarpeta: string;
  }) => Promise<void>;
  refrescar: (seccion: string, rutaCarpeta: string) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto]);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        title={`Subir a ${nombre}`}
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris-suave transition hover:text-azul"
      >
        <IconUpload size={14} />
        Subir
      </button>

      {abierto &&
        createPortal(
          // En <body> con un portal: el contenedor de la página lleva
          // .animar-entrada, y una animación de opacidad rellenando crea un
          // contexto de apilamiento donde el z-50 del diálogo deja de ganarle a
          // la barra lateral. Misma razón que en VisorDeDocumento.
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/60 p-4 sm:p-8"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`Subir a ${nombre}`}
          >
            <div className="w-full max-w-2xl rounded-xl bg-superficie shadow-2xl">
              <div className="flex items-center gap-3 border-b border-borde px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gris">Subir a</p>
                  <h2 className="truncate text-sm font-bold text-tinta">{nombre}</h2>
                </div>
                <button
                  ref={cerrarRef}
                  onClick={() => setAbierto(false)}
                  className="rounded-lg p-1.5 text-gris transition hover:bg-borde/60 hover:text-tinta"
                  aria-label="Cerrar"
                >
                  <IconX size={18} />
                </button>
              </div>

              <div className="p-5">
                <SubidorDeArchivos
                  seccion={seccion}
                  rutaCarpeta={ruta}
                  itemIdCarpeta={itemId}
                  prepararSubida={prepararSubida}
                  registrarSubida={registrarSubida}
                  refrescar={refrescar}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
