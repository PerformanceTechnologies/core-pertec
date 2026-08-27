import type { ReactNode } from "react";

/**
 * Una sección que se pliega y dice su estado cerrada.
 *
 * Nace de una pantalla que se había vuelto una pared: la oferta abría con los dos
 * logos, nueve miniaturas con su desplegable y el selector de formato, y el
 * documento —que es a lo que se entra— quedaba abajo de todo eso. Alguien que
 * llegaba por primera vez no tenía forma de saber por dónde empezar.
 *
 * La clave está en `estado`: plegar algo para "ordenar" y que cerrado no diga nada
 * es peor que dejarlo abierto, porque obliga a abrir las tres cosas para saber cuál
 * necesita atención. Cerrada, la sección tiene que contestar sola la única pregunta
 * que importa —"¿tengo que entrar acá?"— y por eso el resumen va en el título.
 *
 * Es `<details>` y no estado de React: el navegador ya sabe hacer esto, funciona sin
 * JavaScript y no re-renderiza lo que tiene adentro al abrirse.
 */
export default function Plegable({
  titulo,
  estado,
  alerta = false,
  abierto = false,
  children,
}: {
  titulo: string;
  /** Lo que se ve con la sección cerrada: "9 del borrador · 7 en el documento". */
  estado: string;
  /** Pinta el estado en naranjo: algo falta y conviene entrar. */
  alerta?: boolean;
  abierto?: boolean;
  children: ReactNode;
}) {
  return (
    // Sin la sombra de las tarjetas del core, y a propósito: esto no es una pieza de
    // contenido sino un ajuste que casi siempre está cerrado. Con sombra, tres de
    // estos apilados pesaban igual que el documento y la pantalla se leía como una
    // pila de cosas sin jerarquía.
    <details open={abierto} className="group overflow-hidden rounded-xl border border-borde bg-superficie">
      {/* El estado va PEGADO al título y no al otro extremo de la fila: alineado a
          la derecha, en una pantalla ancha queda a diez centímetros del nombre de la
          sección y se lee como un dato suelto de otra cosa. */}
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-crema/40 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <svg
            viewBox="0 0 16 16"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="shrink-0 self-center text-tinta/35 transition-transform group-open:rotate-90"
          >
            <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
            {titulo}
          </span>
          <span className={`truncate text-[11px] ${alerta ? "font-medium text-naranjo" : "text-tinta/45"}`}>
            {estado}
          </span>
        </span>
      </summary>
      <div className="border-t border-borde px-4 py-4">{children}</div>
    </details>
  );
}
