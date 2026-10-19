"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconConfetti } from "@tabler/icons-react";
import { SOMBRA_CALIDA } from "@/lib/estilos";

export default function PrioridadesDelDia({
  prioridades,
  usuarioId,
  fecha,
}: {
  prioridades: string[];
  usuarioId: string;
  fecha: string;
}) {
  const prefijo = `mi-dia:${usuarioId}:`;
  const clave = `${prefijo}${fecha}`;
  const [hechas, setHechas] = useState<boolean[]>(() => prioridades.map(() => false));
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    try {
      const guardado = JSON.parse(localStorage.getItem(clave) ?? "null");
      if (Array.isArray(guardado) && guardado.length === prioridades.length) {
        setHechas(guardado.map(Boolean));
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefijo) && k !== clave) localStorage.removeItem(k);
      }
    } catch {
      // Sin almacenamiento disponible
    }
  }, [clave, prefijo, prioridades.length]);

  function alternar(i: number) {
    setHechas((antes) => {
      const despues = antes.map((v, j) => (j === i ? !v : v));
      try {
        localStorage.setItem(clave, JSON.stringify(despues));
      } catch {}
      return despues;
    });
  }

  const listas = hechas.filter(Boolean).length;
  const todas = listas === prioridades.length && prioridades.length > 0;

  return (
    <section className="mt-10 first:mt-0">
      <div className="flex items-center gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta/50">
          Prioridades del día
        </h2>
        <span className="h-px flex-1 bg-borde" />
        <span className="text-[11px] font-semibold tabular-nums text-tinta/30">
          {montado && listas > 0 ? `${listas} de ${prioridades.length} hechas` : String(prioridades.length).padStart(2, "0")}
        </span>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {prioridades.map((prioridad, i) => {
          const hecha = hechas[i] ?? false;
          return (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={hecha}
                onClick={() => alternar(i)}
                className={`group flex h-full w-full flex-col justify-between rounded-xl border p-5 text-left transition ${SOMBRA_CALIDA} cursor-pointer select-none ${
                  hecha
                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                    : "border-borde bg-superficie hover:border-naranjo/60"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-condensed text-2xl font-bold leading-none tabular-nums transition ${
                        hecha ? "text-emerald-600" : "text-naranjo"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                        hecha
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "text-tinta/30 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {hecha ? (
                        <>
                          <IconCheck size={12} stroke={3} />
                          Hecha
                        </>
                      ) : (
                        "Tachar"
                      )}
                    </span>
                  </div>

                  <p
                    className={`mt-4 text-[15px] leading-relaxed text-pretty transition ${
                      hecha
                        ? "text-tinta/45 line-through decoration-emerald-500/60"
                        : "text-tinta"
                    }`}
                  >
                    {prioridad}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {todas && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <IconConfetti size={16} />
          Listo: hiciste lo más importante del día.
        </p>
      )}
    </section>
  );
}
