"use client";

import { useState, useTransition } from "react";
import { IconCheck } from "@tabler/icons-react";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import { alternarPrioridadAction } from "@/app/(protegido)/mi-dia/acciones";

/**
 * Una prioridad del día, que se puede dar por hecha.
 *
 * Al tacharla desaparece de las de mañana (ver lib/resumen-diario/prioridades.ts).
 * Por eso NO se va de la pantalla al instante: se queda tachada hasta la próxima
 * carga, para que quede claro qué pasó y se pueda deshacer en el mismo gesto. Si
 * se esfumara, un clic por error no tendría vuelta atrás visible.
 */
export default function PrioridadDelDia({
  texto,
  numero,
}: {
  texto: string;
  numero: number;
}) {
  // Optimista: el tachado se pinta al instante y se revierte si la acción falla.
  // Guardar tarda lo que tarda la red, y una tarjeta que no reacciona al clic se
  // vuelve a clickear.
  const [hecha, setHecha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  function alternar() {
    const siguiente = !hecha;
    setHecha(siguiente);
    setError(null);
    iniciarTransicion(async () => {
      const r = await alternarPrioridadAction(texto, siguiente);
      if (!r.ok) {
        setHecha(!siguiente);
        setError(r.error ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <li
      className={`rounded-xl border border-borde bg-superficie p-5 transition ${SOMBRA_CALIDA} ${
        hecha ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`font-condensed text-2xl font-bold leading-none tabular-nums ${
            hecha ? "text-tinta/30" : "text-naranjo"
          }`}
        >
          {String(numero).padStart(2, "0")}
        </span>

        {/* Un botón de verdad y no un div con onClick: así entra en el orden de
            tabulación y responde al Enter sin que haya que programarlo. */}
        <button
          type="button"
          onClick={alternar}
          disabled={pendiente}
          aria-pressed={hecha}
          aria-label={hecha ? `Marcar "${texto}" como pendiente` : `Dar "${texto}" por hecha`}
          title={hecha ? "Volver a dejarla pendiente" : "Darla por hecha: no vuelve a aparecer"}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition disabled:opacity-40 ${
            hecha
              ? "border-teal bg-teal text-white"
              : "border-borde text-transparent hover:border-teal hover:text-teal/40"
          }`}
        >
          <IconCheck size={14} stroke={2.5} />
        </button>
      </div>

      <p
        className={`mt-4 text-[15px] leading-relaxed text-pretty transition ${
          hecha ? "text-tinta/45 line-through decoration-tinta/30" : "text-tinta"
        }`}
      >
        {texto}
      </p>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
