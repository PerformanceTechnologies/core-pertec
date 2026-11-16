"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InfoProyecto } from "@/lib/fin/info-proyecto";

/**
 * El código del proyecto en una pastilla; al pasar el mouse (o enfocarlo) muestra todos sus datos.
 * La tarjeta va en un portal con posición fija, para que no la corte una tabla con scroll.
 */
export default function CodigoProyecto({ info, className = "" }: { info: InfoProyecto; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arriba: boolean } | null>(null);
  const ANCHO = 288;

  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const arriba = window.innerHeight - r.bottom < 230;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ANCHO - 8));
    setPos({ top: arriba ? r.top - 6 : r.bottom + 6, left, arriba });
  };
  const ocultar = () => setPos(null);

  return (
    <span
      ref={ref}
      tabIndex={0}
      onMouseEnter={mostrar}
      onMouseLeave={ocultar}
      onFocus={mostrar}
      onBlur={ocultar}
      className={`inline-block cursor-help whitespace-nowrap rounded-lg border bg-tinta/[0.03] px-2 py-1 font-mono text-[11px] font-bold normal-case tracking-wide text-tinta outline-none transition ${pos ? "border-naranjo/50" : "border-borde/70"} ${className}`}
    >
      {info.codigo}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: ANCHO, transform: pos.arriba ? "translateY(-100%)" : undefined }}
            className="pointer-events-none z-[100] block rounded-xl border border-borde/70 bg-superficie p-3 text-left font-sans shadow-[0_12px_32px_-8px_rgba(23,20,17,0.3)]"
          >
            <span className="mb-2 block font-mono text-xs font-bold tracking-wide text-naranjo">{info.codigo}</span>
            <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-normal normal-case tracking-normal">
              {info.datos.map((d) => (
                <span key={d.etiqueta} className="contents">
                  <span className="font-medium text-gris">{d.etiqueta}</span>
                  <span className="min-w-0 whitespace-normal break-words font-semibold text-tinta">{d.valor}</span>
                </span>
              ))}
            </span>
          </span>,
          document.body,
        )}
    </span>
  );
}
