"use client";

import { useState } from "react";
import { IconPackage } from "@tabler/icons-react";

/** Un producto o servicio del inventario, con el valor a proponer (costo en compras, precio en cotizaciones). */
export type ProductoBuscable = { id: string; nombre: string; sku: string | null; tipo?: string; unidad: string | null; valor: number };

/**
 * Envuelve la descripción del ítem: mientras escribes, sugiere productos y servicios del inventario.
 * Al elegir uno se completan la descripción, la unidad y el precio (su costo). Igual se puede escribir libre.
 */
export default function BuscadorProducto({ catalogo, valor, alElegir, children }: { catalogo: ProductoBuscable[]; valor: string; alElegir: (p: ProductoBuscable) => void; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const texto = valor.trim().toLowerCase();
  const sugerencias = !catalogo.length ? [] : catalogo.filter((p) => !texto || p.nombre.toLowerCase().includes(texto) || (p.sku ?? "").toLowerCase().includes(texto)).filter((p) => p.nombre.toLowerCase() !== texto && `[${p.sku}] ${p.nombre}`.toLowerCase() !== texto).slice(0, 50);
  const ver = abierto && sugerencias.length > 0;
  const elegir = (p: ProductoBuscable) => { alElegir(p); setAbierto(false); setActivo(-1); };
  return (
    <div
      className="relative min-w-0 flex-1"
      onFocus={() => setAbierto(true)}
      onClick={() => setAbierto(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setAbierto(false)}
      onInput={() => { setAbierto(true); setActivo(-1); }}
      onKeyDown={(e) => {
        if (!ver) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, sugerencias.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, -1)); }
        // Enter elige solo si marcaste una con las flechas: si no, sigue escribiendo libre.
        else if (e.key === "Enter" && activo >= 0) { e.preventDefault(); elegir(sugerencias[activo] ?? sugerencias[0]); }
        else if (e.key === "Escape") setAbierto(false);
      }}
    >
      {children}
      {ver && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-xl border border-borde bg-fondo p-1 shadow-lg">
          <li className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-gris-suave">Del inventario</li>
          {sugerencias.map((p, j) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={j === activo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(p)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${j === activo ? "bg-naranjo/[0.08]" : "hover:bg-tinta/5"}`}
              >
                <IconPackage size={15} className="shrink-0 text-naranjo" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-tinta">{p.sku && <span className="font-normal text-gris">[{p.sku}] </span>}{p.nombre}</span>
                  <span className="block truncate text-[11px] text-gris">{[p.tipo === "servicio" ? "Servicio" : null, p.unidad].filter(Boolean).join(" · ") || "Producto"}</span>
                </span>
                {p.valor > 0 && <span className="shrink-0 text-xs tabular-nums text-gris">${Math.round(p.valor).toLocaleString("es-CL")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

