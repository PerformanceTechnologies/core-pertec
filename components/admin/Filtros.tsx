import Link from "next/link";
import { IconSearch, IconX } from "@tabler/icons-react";

/** Una cifra de la fila de arriba. Tocarla filtra la lista por ella; la activa queda marcada. */
export interface CifraDeFiltro {
  clave: string;
  etiqueta: string;
  valor: number;
  href: string;
  activa: boolean;
  /** Para que un número que pide mirar no se lea igual que uno normal. El color nunca va solo. */
  tono?: "neutro" | "aviso";
}

/**
 * La fila de cifras que además filtra: «12 activas» es, a la vez, el dato y el botón para verlas.
 * Son enlaces (la dirección guarda el filtro), no botones de JavaScript.
 */
export function CifrasQueFiltran({ cifras, etiqueta }: { cifras: CifraDeFiltro[]; etiqueta: string }) {
  return (
    <nav aria-label={etiqueta}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cifras.map((c) => (
          <li key={c.clave}>
            <Link
              href={c.href}
              aria-current={c.activa ? "true" : undefined}
              className={`block h-full min-h-[84px] rounded-xl border p-3.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo ${
                c.activa
                  ? "border-naranjo bg-naranjo/[0.07]"
                  : "border-borde bg-superficie hover:border-naranjo/40 hover:bg-naranjo/[0.03]"
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-tinta/65">
                {c.etiqueta}
              </span>
              <span
                className={`mt-1.5 block font-condensed text-3xl font-bold leading-none tabular-nums ${
                  c.tono === "aviso" && c.valor > 0 ? "tono-aviso" : "text-tinta"
                }`}
              >
                {c.valor.toLocaleString("es-CL")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * El buscador: un formulario GET que conserva el resto de los filtros (van como campos ocultos).
 * Sin JavaScript: se envía con Enter, y la dirección queda con el texto buscado.
 */
export function Buscador({
  accion,
  placeholder,
  valor,
  conservar,
}: {
  accion: string;
  placeholder: string;
  valor: string;
  /** Los demás parámetros de la dirección (estado, rol…), para que buscar no los borre. */
  conservar: Record<string, string>;
}) {
  return (
    <form role="search" action={accion} method="get" className="relative min-w-0 flex-1 sm:max-w-sm">
      {Object.entries(conservar).map(([clave, v]) => (
        <input key={clave} type="hidden" name={clave} value={v} />
      ))}
      <label htmlFor="buscar" className="sr-only">
        {placeholder}
      </label>
      <IconSearch
        size={16}
        stroke={1.9}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta/45"
      />
      <input
        id="buscar"
        type="search"
        name="q"
        defaultValue={valor}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-11 w-full rounded-lg border border-borde bg-superficie py-2 pl-9 pr-3 text-sm text-tinta placeholder:text-tinta/45 focus:border-cian focus:outline-none focus:ring-2 focus:ring-cian/30"
      />
    </form>
  );
}

/** «Mostrando 3 de 14» y, si hay filtros, la salida para quitarlos. */
export function ResultadoDeFiltros({
  mostrados,
  total,
  unidad,
  limpiarHref,
}: {
  mostrados: number;
  total: number;
  unidad: string;
  limpiarHref: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta/65" role="status">
      <span>
        Mostrando <strong className="font-semibold text-tinta">{mostrados.toLocaleString("es-CL")}</strong> de{" "}
        {total.toLocaleString("es-CL")} {unidad}
      </span>
      {limpiarHref && (
        <Link
          href={limpiarHref}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-semibold text-naranjo transition hover:bg-naranjo/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
        >
          <IconX size={13} stroke={2.2} aria-hidden /> Quitar filtros
        </Link>
      )}
    </div>
  );
}

/** Cuando ningún resultado calza con los filtros: dice qué pasó y ofrece la salida. */
export function SinResultados({ texto, limpiarHref }: { texto: string; limpiarHref: string | null }) {
  return (
    <div className="rounded-xl border border-dashed border-borde px-6 py-12 text-center">
      <p className="text-sm font-semibold text-tinta">{texto}</p>
      {limpiarHref && (
        <Link
          href={limpiarHref}
          className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-borde px-4 text-xs font-semibold text-tinta/75 transition hover:border-naranjo/40 hover:text-naranjo"
        >
          Quitar filtros
        </Link>
      )}
    </div>
  );
}
