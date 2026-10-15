"use client";

import { useState } from "react";
import { IconUser } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import type { Responsables } from "@/lib/contratos/responsables";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { usePuede } from "./PermisosDelUsuario";

/**
 * Quién responde por este requisito.
 *
 * Un desplegable y no botones —al revés que el estado— porque las opciones son
 * tantas como gente haya en el core: con tres botones se ven todas, con quince
 * no cabrían ni se podrían leer.
 *
 * Se guarda al elegir, sin botón de confirmar: es reversible y no destruye nada.
 * Si el servidor falla, vuelve al valor anterior y lo dice, porque dejar el
 * nombre puesto en pantalla cuando no se guardó es peor que no haberlo puesto.
 */
export default function SelectorDeResponsable({
  seccion,
  itemId,
  ruta,
  responsableInicial,
  responsables,
  asignar,
  compacto = false,
}: {
  seccion: string;
  itemId: string;
  ruta: string;
  responsableInicial: string | null;
  responsables: Responsables;
  asignar: (
    seccion: string,
    itemId: string,
    ruta: string,
    responsableId: string | null,
  ) => Promise<void>;
  /** En las tarjetas, donde el espacio es poco. */
  compacto?: boolean;
}) {
  const puedeEditar = usePuede("editar");
  const [valor, setValor] = useState(responsableInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(nuevo: string) {
    const anterior = valor;
    setValor(nuevo);
    setGuardando(true);
    setError(null);

    try {
      await asignar(seccion, itemId, ruta, nuevo || null);
    } catch (e) {
      setValor(anterior);
      setError(mensajeDeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={compacto ? "" : "min-w-[14rem]"}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gris-suave">
          {guardando ? <RuedaCarga className="h-3.5 w-3.5" /> : <IconUser size={14} />}
        </span>
        <select
          value={valor}
          disabled={guardando || !puedeEditar}
          onChange={(e) => void elegir(e.target.value)}
          aria-label="Responsable"
          className={`w-full appearance-none rounded-lg border border-borde bg-superficie py-1.5 pl-7 pr-7 font-semibold text-tinta transition pointer-coarse:min-h-11 hover:border-cian focus:border-cian focus:outline-none disabled:opacity-60 ${
            compacto ? "text-[11px]" : "text-xs"
          } ${valor ? "" : "text-gris-suave"}`}
        >
          <option value="">Sin responsable</option>
          {/* Una sola lista: para quien asigna es la misma pregunta —de quién
              depende esto— y partirla en dos obliga a decidir antes de elegir.
              Por dentro sí se guardan distinto: lo asignado a una contraparte no
              es trabajo pendiente de nadie del equipo. */}
          {[...responsables.internos, ...responsables.externos].map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gris-suave">
          ▼
        </span>
      </div>
      {error && <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
