"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";

export interface OpcionConBuscador {
  valor: string;
  /** Una línea chica bajo el nombre. También se busca por ella. */
  detalle?: string;
}

/** Sin mayúsculas ni tildes: «banmedica» encuentra «Banmédica». */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Un desplegable con un buscador arriba, para listas donde hay que encontrar un nombre.
 *
 * Un `<select>` nativo no deja escribir para filtrar, y un `<datalist>` se ve distinto en cada
 * navegador y en iOS casi no se nota. Este sigue el patrón combobox de WAI-ARIA: el foco queda en
 * el buscador, las flechas recorren la lista, Enter elige y Escape cierra.
 *
 * Con `permiteOtro`, si lo escrito no está en la lista se ofrece usarlo tal cual: la lista no
 * tiene por qué conocer todos los casos del mundo real.
 *
 * No envía nada por sí mismo: quien lo usa pone el `<input type="hidden">` con el valor. Así
 * puede decidir qué se guarda (en la previsión, el sistema o la isapre).
 */
export default function SelectorConBuscador({
  opciones,
  valor,
  alCambiar,
  etiquetaId,
  marcador = "Selecciona…",
  permiteOtro = false,
}: {
  opciones: readonly OpcionConBuscador[];
  valor: string;
  alCambiar: (valor: string) => void;
  /** El id del texto que hace de etiqueta: el control no va dentro de un <label>. */
  etiquetaId: string;
  marcador?: string;
  permiteOtro?: boolean;
}) {
  const id = useId();
  const listaId = `${id}-lista`;
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [activa, setActiva] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const consulta = normalizar(busqueda);
  const filtradas = consulta
    ? opciones.filter((o) => normalizar(`${o.valor} ${o.detalle ?? ""}`).includes(consulta))
    : opciones;
  const escritoEsNuevo =
    permiteOtro && busqueda.trim() !== "" && !opciones.some((o) => normalizar(o.valor) === consulta);
  // Lo que se puede elegir con el teclado: las filtradas y, al final, «usar lo escrito».
  const total = filtradas.length + (escritoEsNuevo ? 1 : 0);

  // Al abrir, el foco va al buscador y la fila activa es la elegida (o la primera).
  useEffect(() => {
    if (!abierto) return;
    buscadorRef.current?.focus();
  }, [abierto]);

  // Un clic fuera cierra, como cualquier desplegable.
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", alPresionar);
    return () => document.removeEventListener("mousedown", alPresionar);
  }, [abierto]);

  // La fila activa siempre a la vista al recorrer con las flechas.
  useEffect(() => {
    if (!abierto) return;
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa, abierto]);

  function abrir() {
    setBusqueda("");
    const elegida = opciones.findIndex((o) => o.valor === valor);
    setActiva(elegida >= 0 ? elegida : 0);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    botonRef.current?.focus();
  }

  function elegir(indice: number) {
    if (indice < filtradas.length) alCambiar(filtradas[indice].valor);
    else if (escritoEsNuevo) alCambiar(busqueda.trim());
    cerrar();
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiva((a) => (total === 0 ? 0 : (a + 1) % total));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((a) => (total === 0 ? 0 : (a - 1 + total) % total));
    } else if (e.key === "Enter") {
      // Sin esto, Enter dentro del buscador enviaría el formulario entero.
      e.preventDefault();
      if (total > 0) elegir(Math.min(activa, total - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
    } else if (e.key === "Tab") {
      setAbierto(false);
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        ref={botonRef}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !abierto) {
            e.preventDefault();
            abrir();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-labelledby={etiquetaId}
        className={`${CAMPO_COMPACTO} flex items-center justify-between gap-2 text-left ${
          abierto ? "border-cian ring-2 ring-cian/30" : ""
        }`}
      >
        <span className={`truncate ${valor ? "text-tinta" : "text-gris-suave"}`}>{valor || marcador}</span>
        <IconChevronDown
          size={16}
          className={`shrink-0 text-gris transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {abierto && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-borde bg-superficie shadow-[var(--sombra-tarjeta-alta)]">
          <div className="relative border-b border-borde p-2">
            <IconSearch
              size={15}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gris-suave"
              aria-hidden
            />
            <input
              ref={buscadorRef}
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setActiva(0);
              }}
              onKeyDown={alTeclear}
              role="combobox"
              aria-expanded
              aria-controls={listaId}
              aria-autocomplete="list"
              aria-activedescendant={total > 0 ? `${id}-op-${Math.min(activa, total - 1)}` : undefined}
              aria-labelledby={etiquetaId}
              placeholder="Buscar…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-borde bg-fondo py-1.5 pl-8 pr-2 text-sm text-tinta placeholder:text-gris-suave focus:border-cian focus:outline-none"
            />
          </div>

          <ul ref={listaRef} id={listaId} role="listbox" aria-labelledby={etiquetaId} className="max-h-60 overflow-y-auto py-1">
            {filtradas.map((o, i) => {
              const elegida = o.valor === valor;
              return (
                <li
                  key={o.valor}
                  id={`${id}-op-${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={elegida}
                  // mousedown y no click: el click llega después de que el buscador pierde el foco.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(i);
                  }}
                  onMouseEnter={() => setActiva(i)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm pointer-coarse:py-3 ${
                    i === activa ? "bg-cian-lavado" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${elegida ? "font-bold text-azul" : "text-tinta"}`}>{o.valor}</span>
                    {o.detalle && <span className="block truncate text-[11px] text-gris">{o.detalle}</span>}
                  </span>
                  {elegida && <IconCheck size={15} className="shrink-0 text-cian" aria-hidden />}
                </li>
              );
            })}

            {escritoEsNuevo && (
              <li
                id={`${id}-op-${filtradas.length}`}
                data-indice={filtradas.length}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(filtradas.length);
                }}
                onMouseEnter={() => setActiva(filtradas.length)}
                className={`cursor-pointer border-t border-borde px-3 py-2 text-sm text-azul pointer-coarse:py-3 ${
                  activa === filtradas.length ? "bg-cian-lavado" : ""
                }`}
              >
                Usar «{busqueda.trim()}»
              </li>
            )}

            {total === 0 && <li className="px-3 py-3 text-center text-xs text-gris">Sin resultados</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
