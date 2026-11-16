"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import CodigoProyecto from "@/components/fin/CodigoProyecto";
import type { InfoProyecto } from "@/lib/fin/info-proyecto";

export type OpcionProyectoCodigo = { id: string; codigo: string; info?: InfoProyecto };

/** Lista de proyectos que muestra solo su código; al pasar el mouse por un código se ven todos sus datos. */
export default function SelectorProyectoCodigo({
  valor,
  opciones,
  alCambiar,
  deshabilitado = false,
  textoVacio = "— sin proyecto —",
}: {
  valor: string | null;
  opciones: OpcionProyectoCodigo[];
  alCambiar: (id: string | null) => void;
  deshabilitado?: boolean;
  textoVacio?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => caja.current && !caja.current.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);
  const elegido = opciones.find((o) => o.id === valor);
  const pastilla = (o: OpcionProyectoCodigo) =>
    o.info ? <CodigoProyecto info={o.info} /> : <span className="rounded-lg border border-borde/70 bg-tinta/[0.03] px-2 py-1 font-mono text-[11px] font-bold tracking-wide text-tinta">{o.codigo}</span>;

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => setAbierto((x) => !x)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-left text-sm transition hover:border-naranjo/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">{elegido ? pastilla(elegido) : <span className="text-gris">{textoVacio}</span>}</span>
        <IconChevronDown size={16} className={`shrink-0 text-gris transition ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <ul role="listbox" className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-xl border border-borde/70 bg-superficie p-1 shadow-lg">
          {[{ id: "", codigo: textoVacio } as OpcionProyectoCodigo, ...opciones].map((o) => {
            const sel = (valor ?? "") === o.id;
            return (
              <li key={o.id || "vacio"} role="option" aria-selected={sel}>
                <div
                  onClick={() => {
                    alCambiar(o.id || null);
                    setAbierto(false);
                  }}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition hover:bg-naranjo/[0.06] ${sel ? "bg-naranjo/[0.05]" : ""}`}
                >
                  <span className="min-w-0 flex-1">{o.id ? pastilla(o) : <span className="text-sm text-gris">{o.codigo}</span>}</span>
                  {sel && <IconCheck size={15} className="shrink-0 text-naranjo" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
