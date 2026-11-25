import Link from "next/link";
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { TH } from "./piezas";

// -----------------------------------------------------------------------------
//  Tablas largas de Finanzas: orden por cualquier columna (clic en el encabezado: primero de mayor a menor, otro clic
//  de menor a mayor) y páginas de 100 filas. Todo va en la dirección (?orden=&dir=&pag=), así que se puede volver,
//  compartir el enlace y funciona sin JavaScript. Componentes de servidor.
// -----------------------------------------------------------------------------

export const POR_PAGINA = 100;

export type Dir = "asc" | "desc";

export interface EstadoTabla {
  orden: string;
  dir: Dir;
  pag: number;
}

/** Lee orden, dirección y página de la URL (con valores por omisión y solo columnas válidas). */
export function leerEstado(sp: { orden?: string; dir?: string; pag?: string }, columnas: readonly string[], porOmision: { orden: string; dir: Dir }): EstadoTabla {
  const orden = sp.orden && columnas.includes(sp.orden) ? sp.orden : porOmision.orden;
  const dir: Dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : porOmision.dir;
  const pag = Math.max(1, Math.floor(Number(sp.pag)) || 1);
  return { orden, dir, pag };
}

/** Ordena con la clave de la columna (números, textos o fechas; vacíos siempre al final) y corta la página. */
export function ordenarYPaginar<T>(filas: T[], clave: (f: T) => number | string | null | undefined, e: EstadoTabla): { pagina: T[]; total: number; paginas: number; pag: number } {
  const signo = e.dir === "asc" ? 1 : -1;
  const ordenadas = [...filas].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    const vx = x === null || x === undefined || x === "";
    const vy = y === null || y === undefined || y === "";
    if (vx || vy) return vx === vy ? 0 : vx ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * signo;
    return String(x).localeCompare(String(y), "es", { numeric: true, sensitivity: "base" }) * signo;
  });
  const paginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
  const pag = Math.min(e.pag, paginas);
  return { pagina: ordenadas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA), total: ordenadas.length, paginas, pag };
}

/** Une la dirección base con parámetros nuevos (los vacíos se quitan). */
export function conParametros(base: string, cambios: Record<string, string | number | null | undefined>): string {
  const [ruta, q = ""] = base.split("?");
  const p = new URLSearchParams(q);
  for (const [k, v] of Object.entries(cambios)) {
    if (v === null || v === undefined || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${ruta}?${s}` : ruta;
}

/** Encabezado que ordena: el primer clic de mayor a menor; sobre la columna activa, invierte. Vuelve a la página 1. */
export function ThOrden({ base, columna, e, children, alinear = "left", className = "" }: { base: string; columna: string; e: EstadoTabla; children: React.ReactNode; alinear?: "left" | "right"; className?: string }) {
  const activa = e.orden === columna;
  const siguiente: Dir = activa ? (e.dir === "desc" ? "asc" : "desc") : "desc";
  const Icono = !activa ? IconArrowsSort : e.dir === "desc" ? IconArrowDown : IconArrowUp;
  return (
    <th className={`${TH} ${alinear === "right" ? "text-right" : ""} ${className}`} aria-sort={activa ? (e.dir === "desc" ? "descending" : "ascending") : "none"}>
      <Link
        href={conParametros(base, { orden: columna, dir: siguiente, pag: null })}
        scroll={false}
        className={`inline-flex items-center gap-1 hover:text-naranjo ${activa ? "text-tinta" : ""} ${alinear === "right" ? "flex-row-reverse" : ""}`}
        title={activa ? (e.dir === "desc" ? "De mayor a menor (clic: de menor a mayor)" : "De menor a mayor (clic: de mayor a menor)") : "Ordenar de mayor a menor"}
      >
        {children}
        <Icono size={12} className={activa ? "text-naranjo" : "opacity-40"} />
      </Link>
    </th>
  );
}

/** «Mostrando 101–200 de 4.970» y la navegación entre páginas (primera, vecinas, última). */
export function Paginador({ base, pag, paginas, total }: { base: string; pag: number; paginas: number; total: number }) {
  if (total === 0) return null;
  const desde = (pag - 1) * POR_PAGINA + 1;
  const hasta = Math.min(pag * POR_PAGINA, total);
  const numeros = [...new Set([1, pag - 2, pag - 1, pag, pag + 1, pag + 2, paginas])].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b);
  const enlace = (n: number) => conParametros(base, { pag: n === 1 ? null : n });
  const caja = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-semibold";
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-gris" aria-label="Páginas">
      <span>
        Mostrando <strong className="text-tinta">{desde.toLocaleString("es-CL")}–{hasta.toLocaleString("es-CL")}</strong> de {total.toLocaleString("es-CL")}
      </span>
      {paginas > 1 && (
        <span className="flex items-center gap-1">
          {pag > 1 ? <Link href={enlace(pag - 1)} className={`${caja} bg-tinta/[0.05] hover:bg-tinta/[0.1]`} aria-label="Página anterior"><IconChevronLeft size={15} /></Link> : <span className={`${caja} opacity-30`}><IconChevronLeft size={15} /></span>}
          {numeros.map((n, i) => (
            <span key={n} className="flex items-center gap-1">
              {i > 0 && n - numeros[i - 1] > 1 && <span className="px-0.5">…</span>}
              {n === pag ? <span className={`${caja} bg-tinta text-white`} aria-current="page">{n}</span> : <Link href={enlace(n)} className={`${caja} bg-tinta/[0.05] text-tinta hover:bg-tinta/[0.1]`}>{n}</Link>}
            </span>
          ))}
          {pag < paginas ? <Link href={enlace(pag + 1)} className={`${caja} bg-tinta/[0.05] hover:bg-tinta/[0.1]`} aria-label="Página siguiente"><IconChevronRight size={15} /></Link> : <span className={`${caja} opacity-30`}><IconChevronRight size={15} /></span>}
        </span>
      )}
    </nav>
  );
}
