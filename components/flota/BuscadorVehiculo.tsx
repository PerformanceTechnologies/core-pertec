"use client";

import { useId, useState } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { Patente } from "@/components/flota/Visual";
import { normalizarPatente } from "@/lib/flota-modelo";

type VehiculoMin = { id: string; patente: string; nombre: string };

const limpio = (t: string) => t.toLowerCase().replace(/[\s·.-]/g, "");
// Sin marca ni modelo, el «nombre» es la patente: no se repite.
const detalle = (v: VehiculoMin) => (normalizarPatente(v.nombre) === normalizarPatente(v.patente) ? "Sin modelo" : v.nombre);

/** Buscar un vehículo por patente o modelo y elegirlo de la lista que aparece mientras se escribe. */
export default function BuscadorVehiculo({
  vehiculos,
  elegido,
  alElegir,
}: {
  vehiculos: VehiculoMin[];
  elegido: VehiculoMin | undefined;
  alElegir: (id: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const lista = useId();

  const q = limpio(texto);
  const resultados = (q ? vehiculos.filter((v) => limpio(`${v.patente}${v.nombre}`).includes(q)) : vehiculos).slice(0, 8);

  function elegir(v: VehiculoMin) {
    alElegir(v.id);
    setTexto("");
    setAbierto(false);
  }

  if (elegido)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-naranjo/40 bg-naranjo/[0.04] px-3 py-2.5">
        <Patente patente={elegido.patente} chica />
        <span className="min-w-0 flex-1 truncate text-sm text-tinta">{detalle(elegido)}</span>
        <button type="button" onClick={() => alElegir("")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gris hover:text-tinta">
          <IconX size={14} /> Cambiar
        </button>
      </div>
    );

  return (
    <div className="relative">
      <IconSearch size={16} className="pointer-events-none absolute left-3 top-[1.4rem] -translate-y-1/2 text-gris" />
      <input
        role="combobox"
        aria-expanded={abierto}
        aria-controls={lista}
        aria-autocomplete="list"
        value={texto}
        autoFocus
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, resultados.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && resultados[activo]) { e.preventDefault(); elegir(resultados[activo]); }
          else if (e.key === "Escape") setAbierto(false);
        }}
        placeholder="Escribe la patente o el modelo…"
        className={`${CAMPO} pl-9`}
      />
      {abierto && (
        <ul id={lista} role="listbox" className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-borde bg-superficie py-1 shadow-lg">
          {resultados.map((v, i) => (
            <li
              key={v.id}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => { e.preventDefault(); elegir(v); }}
              onMouseEnter={() => setActivo(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === activo ? "bg-naranjo/[0.07]" : ""}`}
            >
              <Patente patente={v.patente} chica />
              <span className="truncate text-sm text-tinta">{detalle(v)}</span>
            </li>
          ))}
          {resultados.length === 0 && <li className="px-3 py-3 text-sm text-gris">Ningún vehículo coincide con «{texto}».</li>}
        </ul>
      )}
    </div>
  );
}
