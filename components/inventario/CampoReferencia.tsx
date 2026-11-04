"use client";

import { useState } from "react";
import { IconHistory, IconInfoCircle } from "@tabler/icons-react";
import { CAMPO } from "@/lib/estilos";
import { formatoHistorico, sugerenciasHistoricas } from "@/lib/valorizacion-historica-modelo";

/**
 * Un campo de texto libre con el histórico de compras como REFERENCIA, no como autocompletado:
 * lo que se escribe queda tal cual. Debajo se muestra cómo está escrito lo parecido en el
 * histórico (se puede tocar para usarlo) y, si se escribió lo mismo con otro formato
 * («makita» y allá «Makita»), se avisa. Si no está, se deja lo nuevo y listo.
 */
export default function CampoReferencia({
  name,
  valor,
  alCambiar,
  referencias,
  cargando = false,
  placeholder,
  required = false,
  autoFocus = false,
  maximo = 200,
}: {
  name: string;
  valor: string;
  alCambiar: (v: string) => void;
  referencias: string[];
  cargando?: boolean;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  maximo?: number;
}) {
  const [enfocado, setEnfocado] = useState(false);
  const formato = formatoHistorico(valor, referencias);
  const sugerencias = enfocado && !formato ? sugerenciasHistoricas(valor, referencias, 6) : [];
  const enHistorico = Boolean(valor.trim()) && referencias.includes(valor.trim());

  return (
    <div>
      <input
        name={name}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={maximo}
        placeholder={placeholder}
        className={CAMPO}
      />

      {formato ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg bg-amber-500/[0.08] px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          <IconInfoCircle size={13} className="shrink-0" />
          En el histórico está escrito
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => alCambiar(formato)}
            className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold hover:bg-amber-500/25"
            title="Usar este formato"
          >
            {formato}
          </button>
          <span className="text-amber-700/70 dark:text-amber-300/70">· tócalo para usar el mismo formato</span>
        </p>
      ) : sugerencias.length > 0 ? (
        <div className="mt-1.5 rounded-lg border border-borde bg-tinta/[0.015] px-2.5 py-2">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gris">
            <IconHistory size={12} /> Así está en el histórico
            <span className="font-normal normal-case tracking-normal">· toca uno para usarlo, o deja el tuyo si es nuevo</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                // mousedown sin perder el foco: si no, el blur esconde la lista antes del clic.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => alCambiar(s)}
                className="max-w-full truncate rounded-md border border-borde bg-superficie px-2 py-1 text-left text-[11px] text-tinta transition hover:border-naranjo/50 hover:text-naranjo"
                title={s}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : enfocado && cargando ? (
        <p className="mt-1.5 text-[11px] text-gris">Cargando el histórico…</p>
      ) : enHistorico ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-600">
          <IconHistory size={12} /> Igual que en el histórico
        </p>
      ) : null}
    </div>
  );
}
