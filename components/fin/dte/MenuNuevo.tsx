"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconFileInvoice, IconPlus, IconTruckDelivery } from "@tabler/icons-react";

/** «Nueva factura» como botón principal y, en el menú, la factura exenta y la guía de despacho. */
export default function MenuNuevo({ ruta }: { ruta: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  const item = "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-tinta hover:bg-tinta/[0.05]";
  return (
    <div ref={caja} className="relative inline-flex">
      <Link href={`${ruta}/nuevo?tipo=33`} className="inline-flex h-9 items-center gap-1.5 rounded-l-lg bg-naranjo px-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave">
        <IconFileInvoice size={15} /> Nueva factura
      </Link>
      <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} aria-label="Otros documentos" className="inline-flex h-9 items-center rounded-r-lg border-l border-white/30 bg-naranjo px-2 text-white transition hover:bg-naranjo-suave">
        <IconChevronDown size={14} className={abierto ? "rotate-180" : ""} />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-borde bg-superficie p-1 shadow-lg">
          <Link href={`${ruta}/nuevo?tipo=34`} className={item} onClick={() => setAbierto(false)}><IconPlus size={15} /> Factura exenta</Link>
          <Link href={`${ruta}/nuevo?tipo=52`} className={item} onClick={() => setAbierto(false)}><IconTruckDelivery size={15} /> Guía de despacho</Link>
        </div>
      )}
    </div>
  );
}
