"use client";

import { useState } from "react";
import type { GastoItem } from "@/lib/proyectos";
import { fmtCLP } from "@/lib/proyectos-utilidades";

export default function PopoverAdjuntosGasto({
  titulo,
  gastos,
  onClose,
}: {
  titulo: string;
  gastos: GastoItem[];
  onClose: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const totalAdjuntos = gastos.reduce((s, g) => s + (g.archivos?.length ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-borde bg-white shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-borde px-5 py-3.5">
          <div>
            <span className="etiqueta-seccion">Adjuntos</span>
            <h3 className="mt-1 font-condensed text-lg font-bold text-tinta">{titulo}</h3>
          </div>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta" aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {totalAdjuntos === 0 ? (
            <p className="text-sm text-tinta/50">Esta partida no tiene documentos ni fotos adjuntos.</p>
          ) : (
            gastos.map((g, gi) => {
              const archivos = g.archivos ?? [];
              if (archivos.length === 0) return null;
              return (
                <div key={gi}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-tinta/60">{[g.tag, g.label].filter(Boolean).join(" · ") || "Sin detalle"}</span>
                    <span className="font-semibold text-tinta">{fmtCLP(g.monto)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {archivos.map((a, i) =>
                      a.tipo.startsWith("image/") ? (
                        <img
                          key={i}
                          src={a.url}
                          alt={a.nombre}
                          className="h-16 w-16 cursor-pointer rounded-md border border-borde object-cover"
                          onClick={() => setLightbox(a.url)}
                        />
                      ) : (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-borde bg-crema/60 p-1 text-center text-tinta/60 hover:text-naranjo"
                        >
                          <span className="text-lg">📄</span>
                          <span className="line-clamp-2 break-all text-[8px] leading-tight">{a.nombre}</span>
                        </a>
                      ),
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Adjunto" className="max-h-[85vh] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
