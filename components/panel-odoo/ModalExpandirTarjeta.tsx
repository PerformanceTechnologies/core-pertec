"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";

// Hoja anclada abajo en mobile (items-end + solo esquinas de arriba
// redondeadas), diálogo centrado desde sm: en adelante -- mismo patrón que
// el resto de los modales de detalle de Panel Odoo, pero más ancho porque
// acá va contenido de verdad (tabla completa, gráfico grande), no una ficha.
export default function ModalExpandirTarjeta({
  titulo,
  icono,
  onCerrar,
  children,
}: {
  titulo: string;
  icono: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const Icono = obtenerIcono(icono);

  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-borde bg-white px-5 py-4">
          <p className="flex min-w-0 items-center gap-2 truncate font-condensed text-lg font-bold uppercase text-tinta">
            {/* eslint-disable-next-line react-hooks/static-components --
                obtenerIcono() busca en un Map de lib/iconos.tsx: misma clave
                siempre da la misma referencia, no hay remount real (ver
                mismo comentario en TarjetaBase.tsx). */}
            <Icono size={20} stroke={1.75} className="shrink-0" aria-hidden />
            <span className="truncate">{titulo}</span>
          </p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1.5 text-tinta/50 transition hover:bg-crema hover:text-tinta"
          >
            <IconX size={20} stroke={1.75} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
