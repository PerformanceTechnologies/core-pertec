"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconBolt, IconCamera, IconShoppingCart, IconWallet } from "@tabler/icons-react";

const ATAJOS = [
  { href: "/rendir-gastos/gastos?escanear=1", texto: "Escanear gasto", detalle: "Saca una foto a la boleta y se lee sola", Icono: IconCamera, tono: "bg-sky-500/12 text-sky-700" },
  { href: "/rendir-gastos?solicitar=1", texto: "Solicitar fondo", detalle: "Pide dinero para tus gastos", Icono: IconWallet, tono: "bg-emerald-500/12 text-emerald-700" },
  { href: "/finanzas/compras/nueva", texto: "Solicitar compra", detalle: "Nueva solicitud de orden de compra", Icono: IconShoppingCart, tono: "bg-naranjo/12 text-naranjo" },
];

/** Atajos rápidos, al lado de la campana (web y celular). */
export default function Atajos() {
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

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Atajos"
        aria-label="Atajos"
        className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-borde bg-superficie text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
      >
        <IconBolt size={18} stroke={1.75} />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 z-50 mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-borde bg-fondo p-1.5 shadow-lg">
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-tinta/40">Atajos</p>
          {ATAJOS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              role="menuitem"
              onClick={() => setAbierto(false)}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition hover:bg-tinta/5"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${a.tono}`}><a.Icono size={18} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-tinta">{a.texto}</span>
                <span className="block text-xs text-gris">{a.detalle}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
