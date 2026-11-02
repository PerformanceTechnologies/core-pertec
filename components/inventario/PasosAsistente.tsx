"use client";

import { IconCheck } from "@tabler/icons-react";

type Paso = { n: number; t: string; d: string };

/**
 * La banda de los asistentes del Inventario (operación, ajuste): título arriba y los
 * pasos numerados. Pasado el primer paso se achica a solo los pasos, y los ya hechos
 * se pueden tocar para volver.
 */
export default function PasosAsistente({
  etiqueta,
  titulo,
  bajada,
  pasos,
  actual,
  compacto,
  alVolver,
}: {
  etiqueta: string;
  titulo: string;
  bajada: string;
  pasos: Paso[];
  actual: number;
  compacto: boolean;
  alVolver: (n: number) => void;
}) {
  return (
    <header className={`banda-contraste overflow-hidden rounded-2xl px-6 sm:px-8 ${compacto ? "py-4" : "py-7"}`}>
      {!compacto && (
        <>
          <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
            <span className="h-px w-6 bg-naranjo" /> {etiqueta}
          </span>
          <h2 className="texto-banda mt-3 font-condensed text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">{titulo}</h2>
          <p className="texto-banda-65 mt-2 max-w-2xl text-sm">{bajada}</p>
        </>
      )}
      <ol className={`grid gap-2 ${pasos.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"} ${compacto ? "" : "mt-6"}`}>
        {pasos.map((p) => {
          const hecho = actual > p.n;
          const esActual = actual === p.n;
          return (
            <li key={p.n}>
              <button
                type="button"
                disabled={!hecho}
                onClick={() => alVolver(p.n)}
                title={hecho ? "Volver a este paso" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  esActual ? "border-naranjo bg-naranjo/15" : "borde-banda"
                } ${hecho ? "cursor-pointer hover:border-naranjo/60" : "cursor-default"}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    hecho ? "bg-emerald-500 text-white" : esActual ? "bg-naranjo text-white" : "texto-banda-45 border borde-banda"
                  }`}
                >
                  {hecho ? <IconCheck size={15} /> : p.n}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${esActual || hecho ? "texto-banda" : "texto-banda-65"}`}>{p.t}</span>
                  <span className="texto-banda-45 block text-[11px]">{p.d}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </header>
  );
}
