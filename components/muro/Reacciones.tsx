"use client";

import { useEffect, useRef, useState } from "react";
import { IconMoodSmile } from "@tabler/icons-react";
import { NOMBRE_REACCION, REACCIONES, type Reaccion, type ReaccionesMuro } from "@/lib/muro-modelo";
import { reaccionarAction } from "@/app/(protegido)/muro/acciones";

// Las reacciones de un mensaje del Muro: las que ya tiene, como fichas con su número (la propia,
// en naranjo), y una carita para elegir entre las cinco. Tocar una ficha la pone o la saca.

export default function Reacciones({
  mensajeId,
  reacciones,
  yo,
  nombreDe,
  alCambiar,
  chico = false,
}: {
  mensajeId: string;
  reacciones: Partial<Record<Reaccion, string[]>>;
  yo: string;
  nombreDe: (correo: string) => string;
  alCambiar: (r: ReaccionesMuro) => void;
  chico?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierta]);

  async function alternar(emoji: Reaccion) {
    setAbierta(false);
    // Al tiro en pantalla; después manda lo que diga el servidor.
    const quienes = reacciones[emoji] ?? [];
    const puse = quienes.includes(yo);
    alCambiar({ [mensajeId]: { ...reacciones, [emoji]: puse ? quienes.filter((c) => c !== yo) : [...quienes, yo] } });
    const r = await reaccionarAction(mensajeId, emoji);
    if (r.ok) {
      // Si el servidor no pudo leerlas de vuelta (null), vale lo que ya se ve en pantalla.
      if (r.reacciones) alCambiar({ [mensajeId]: r.reacciones[mensajeId] ?? {} });
    } else {
      alCambiar({ [mensajeId]: reacciones });
      alert(r.error);
    }
  }

  const puestas = REACCIONES.filter((e) => (reacciones[e]?.length ?? 0) > 0);

  return (
    <div ref={caja} className="relative flex flex-wrap items-center gap-1">
      {puestas.map((e) => {
        const quienes = reacciones[e]!;
        const mia = quienes.includes(yo);
        return (
          <button
            key={e}
            type="button"
            onClick={() => alternar(e)}
            title={`${NOMBRE_REACCION[e]}: ${quienes.map((c) => (c === yo ? "tú" : nombreDe(c))).join(", ")}`}
            className={`inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums transition active:scale-95 ${
              chico ? "h-7 px-2 text-[11px] lg:h-6 lg:px-1.5" : "h-8 px-2.5 text-xs lg:h-7 lg:px-2"
            } ${mia ? "border-naranjo/50 bg-naranjo/10 text-naranjo" : "border-borde bg-superficie text-gris hover:border-naranjo/40"}`}
          >
            <span className={chico ? "text-[13px]" : "text-[15px]"}>{e}</span>
            {quienes.length}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-label="Reaccionar"
        title="Reaccionar"
        className={`grid place-items-center rounded-full text-gris-suave transition hover:bg-naranjo/10 hover:text-naranjo ${chico ? "h-7 w-7 lg:h-6 lg:w-6" : "h-8 w-8 lg:h-7 lg:w-7"} ${abierta ? "bg-naranjo/10 text-naranjo" : ""}`}
      >
        <IconMoodSmile size={chico ? 15 : 17} stroke={1.8} />
      </button>
      {abierta && (
        <div className={`animar-aviso absolute bottom-full z-30 mb-1.5 ${chico ? "left-0" : "right-0"} flex gap-0.5 rounded-full border border-borde bg-superficie p-1 shadow-[0_12px_30px_-10px_rgba(23,20,17,0.35)]`}>
          {REACCIONES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => alternar(e)}
              title={NOMBRE_REACCION[e]}
              aria-label={NOMBRE_REACCION[e]}
              className={`grid h-10 w-10 place-items-center rounded-full text-[22px] transition hover:scale-125 active:scale-110 lg:h-9 lg:w-9 lg:text-xl hover:bg-naranjo/10 ${reacciones[e]?.includes(yo) ? "bg-naranjo/10" : ""}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
