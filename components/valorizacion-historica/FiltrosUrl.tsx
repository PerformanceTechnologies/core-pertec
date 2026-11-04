"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconLoader2, IconSearch, IconX } from "@tabler/icons-react";

export interface FiltroSelect {
  clave: string;
  etiqueta: string;
  /** El texto de la opción vacía: «Todas las categorías». */
  todas: string;
  opciones: { valor: string; texto: string }[];
}

/**
 * La barra de búsqueda de las listas: lo que se escribe y se elige queda en la URL (se puede
 * compartir o volver atrás) y la lista se actualiza sola mientras se escribe, como el Buscador
 * del Excel. Cualquier cambio vuelve a la primera página.
 */
export default function FiltrosUrl({
  placeholder,
  filtros = [],
  extra,
  autoFocus = false,
  grande = false,
}: {
  placeholder: string;
  filtros?: FiltroSelect[];
  /** Interruptores u otros controles a la derecha. */
  extra?: { clave: string; etiqueta: string }[];
  autoFocus?: boolean;
  grande?: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ir = (cambios: Record<string, string | null>) => {
    const nuevo = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) nuevo.set(k, v);
      else nuevo.delete(k);
    }
    nuevo.delete("pagina");
    const s = nuevo.toString();
    iniciar(() => router.replace(s ? `${ruta}?${s}` : ruta, { scroll: false }));
  };

  // Si la URL cambia por otro lado (un atajo «Prueba con», el botón atrás), el campo la sigue.
  // Pero NUNCA mientras la persona está escribiendo: la respuesta de una búsqueda llega con el
  // texto que se buscó, que ya quedó viejo si siguió tecleando, y pisarlo le borraba letras.
  // Se ajusta al dibujar y no en un efecto, como recomienda React para estado que deriva de una prop.
  const qUrl = params.get("q") ?? "";
  const [qUrlPrevio, setQUrlPrevio] = useState(qUrl);
  const [escribiendo, setEscribiendo] = useState(false);
  if (qUrl !== qUrlPrevio) {
    setQUrlPrevio(qUrl);
    if (!escribiendo && q.trim() !== qUrl.trim()) setQ(qUrl);
  }
  useEffect(() => () => {
    if (reloj.current) clearTimeout(reloj.current);
  }, []);

  const escribir = (v: string) => {
    setQ(v);
    if (reloj.current) clearTimeout(reloj.current);
    // Se busca cuando la persona hace una pausa, no en cada tecla.
    reloj.current = setTimeout(() => {
      if (v.trim() !== qUrl.trim()) ir({ q: v.trim() || null });
    }, 450);
  };

  const hayFiltros = q || filtros.some((f) => params.get(f.clave)) || extra?.some((e) => params.get(e.clave));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={`relative min-w-[16rem] flex-1 ${grande ? "basis-full" : ""}`}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris">
          {pendiente ? <IconLoader2 size={grande ? 20 : 17} className="animate-spin text-naranjo" /> : <IconSearch size={grande ? 20 : 17} />}
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => escribir(e.target.value)}
          onFocus={() => setEscribiendo(true)}
          onBlur={() => setEscribiendo(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (reloj.current) clearTimeout(reloj.current);
              ir({ q: q.trim() || null });
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full rounded-xl border border-borde bg-superficie pr-9 text-tinta [&::-webkit-search-cancel-button]:appearance-none shadow-[0_1px_2px_rgba(23,20,17,0.04)] outline-none transition placeholder:text-gris-suave focus:border-naranjo/60 focus:ring-4 focus:ring-naranjo/10 ${
            grande ? "py-3.5 pl-11 text-base" : "py-2.5 pl-10 text-sm"
          }`}
        />
        {q && (
          <button type="button" onClick={() => escribir("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gris hover:bg-tinta/[0.05] hover:text-tinta" aria-label="Borrar búsqueda">
            <IconX size={15} />
          </button>
        )}
      </label>
      {filtros.map((f) => (
        <select
          key={f.clave}
          aria-label={f.etiqueta}
          value={params.get(f.clave) ?? ""}
          onChange={(e) => ir({ [f.clave]: e.target.value || null })}
          className={`min-w-[9rem] flex-1 rounded-xl border bg-superficie sm:max-w-[15rem] sm:flex-none px-3 py-2.5 text-sm outline-none transition focus:border-naranjo/60 ${params.get(f.clave) ? "border-naranjo/50 font-semibold text-tinta" : "border-borde text-gris"}`}
        >
          <option value="">{f.todas}</option>
          {f.opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
      ))}
      {extra?.map((e) => {
        const on = params.get(e.clave) === "1";
        return (
          <button
            key={e.clave}
            type="button"
            onClick={() => ir({ [e.clave]: on ? null : "1" })}
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${on ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-borde bg-superficie text-gris hover:text-tinta"}`}
          >
            {e.etiqueta}
          </button>
        );
      })}
      {hayFiltros && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            iniciar(() => router.replace(ruta, { scroll: false }));
          }}
          className="rounded-xl px-2.5 py-2.5 text-xs font-semibold text-gris hover:text-naranjo"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
