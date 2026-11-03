import Link from "next/link";
import { IconDatabaseOff, IconFileTypePdf, IconTableImport } from "@tabler/icons-react";
import { TARJETA } from "@/lib/estilos";
import { RUTA_VH } from "@/lib/valorizacion-historica-modelo";
import { tonoDeTexto } from "@/components/inventario/Visual";

// Las piezas que se repiten en las pantallas de la Valorización histórica. Sin estado: sirven en
// servidor y en cliente.

/** Un color fijo por categoría (en el orden del resumen) para barras y puntos. */
export const COLORES = ["#c85217", "#0f766e", "#b08419", "#4f46e5", "#0284c7", "#be185d", "#475569", "#65a30d", "#9333ea", "#0891b2", "#ca8a04", "#dc2626", "#16a34a", "#7c3aed", "#57534e"];

export function Seccion({ titulo, icono, accion, children, id }: { titulo: string; icono?: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/60">
          {icono} {titulo}
        </h2>
        <span className="h-px flex-1 bg-borde" />
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Una cifra dentro de la banda oscura. */
export function CifraBanda({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="min-w-0">
      <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className="texto-banda mt-1 truncate font-condensed text-2xl font-bold tabular-nums">{valor}</dd>
      {detalle && <dd className="texto-banda-45 truncate text-[11px]">{detalle}</dd>}
    </div>
  );
}

/** Una cifra en tarjeta clara. */
export function Cifra({ etiqueta, valor, detalle, tono = "text-tinta" }: { etiqueta: string; valor: string; detalle?: string; tono?: string }) {
  return (
    <div className={`${TARJETA} min-w-0 px-4 py-3`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gris">{etiqueta}</p>
      <p className={`mt-1 truncate font-condensed text-2xl font-bold tabular-nums ${tono}`}>{valor}</p>
      {detalle && <p className="truncate text-[11px] text-gris">{detalle}</p>}
    </div>
  );
}

export function ChipCategoria({ nombre, chico = false }: { nombre: string; chico?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-full font-semibold ${tonoDeTexto(nombre)} ${chico ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`} title={nombre}>
      {nombre}
    </span>
  );
}

/** El tipo de documento como pastilla: las notas de crédito restan y se ven distintas. */
export function ChipTipoDoc({ tipo }: { tipo: string }) {
  const nc = /cr[eé]dito/i.test(tipo), nd = /d[eé]bito/i.test(tipo);
  const tono = nc ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : nd ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-tinta/[0.05] text-tinta/70";
  const corto = nc ? "NC" : nd ? "ND" : /exenta/i.test(tipo) ? "FE" : "FAC";
  return (
    <span className={`inline-grid h-5 min-w-[2.1rem] place-items-center rounded px-1 text-[10px] font-bold ${tono}`} title={tipo}>
      {corto}
    </span>
  );
}

/** Barra horizontal con su etiqueta y monto: el gráfico de barras de la planilla, legible en celular. */
export function Barra({ etiqueta, valor, maximo, color, derecha, href }: { etiqueta: string; valor: number; maximo: number; color: string; derecha: React.ReactNode; href?: string }) {
  const contenido = (
    <>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="h-2.5 w-2.5 shrink-0 self-center rounded-sm" style={{ background: color }} />
        <span className={`min-w-0 flex-1 truncate font-semibold text-tinta ${href ? "group-hover:text-naranjo" : ""}`}>{etiqueta}</span>
        {derecha}
      </div>
      <div className="ml-[18px] mt-1.5 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${maximo > 0 ? Math.max((valor / maximo) * 100, 0.6) : 0}%`, background: color }} />
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="group block">
      {contenido}
    </Link>
  ) : (
    <div>{contenido}</div>
  );
}

/** Enlace al PDF del documento en la carpeta DTE_SII de SharePoint. */
export function EnlacePdf({ doc, linea, texto = "PDF" }: { doc?: number; linea?: number; texto?: string }) {
  const q = doc ? `doc=${doc}` : `linea=${linea}`;
  return (
    <a
      href={`/api/valorizacion-historica/pdf?${q}`}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 rounded-md border border-borde px-2 py-1 text-[11px] font-semibold text-tinta transition hover:border-rose-400/60 hover:text-rose-600"
      title="Abrir el PDF del documento (carpeta DTE_SII)"
    >
      <IconFileTypePdf size={14} className="text-rose-500" /> {texto}
    </a>
  );
}

/** Cuando todavía no se sube el Excel. */
export function SinRegistro({ esAdmin }: { esAdmin: boolean }) {
  return (
    <div className={`${TARJETA} grid place-items-center gap-3 p-14 text-center`}>
      <IconDatabaseOff size={40} stroke={1.4} className="text-gris-suave" />
      <p className="text-sm font-semibold text-tinta">Todavía no se carga el registro de compras</p>
      <p className="max-w-md text-xs text-gris">
        {esAdmin
          ? "Sube el Excel «Registro Maestro de Compras» y el Core arma el buscador, el catálogo con sus costos, los documentos y los proveedores."
          : "Cuando el administrador suba el Excel del Registro Maestro de Compras, aquí vas a poder buscar y valorizar todo lo comprado."}
      </p>
      {esAdmin && (
        <Link href={`${RUTA_VH}/importar`} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-naranjo px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-naranjo-suave">
          <IconTableImport size={16} /> Cargar el Excel
        </Link>
      )}
    </div>
  );
}

/** «Página 2 de 14 · anterior · siguiente», conservando los demás filtros de la URL. */
export function Paginacion({ pagina, paginas, total, porPagina, enlace }: { pagina: number; paginas: number; total: number; porPagina: number; enlace: (p: number) => string }) {
  if (paginas <= 1) return null;
  const desde = (pagina - 1) * porPagina + 1, hasta = Math.min(pagina * porPagina, total);
  const boton = (activo: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${activo ? "border-borde bg-superficie text-tinta hover:border-naranjo/50" : "pointer-events-none border-borde/60 text-gris-suave"}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3 text-xs text-gris">
      <span className="tabular-nums">
        {desde.toLocaleString("es-CL")}–{hasta.toLocaleString("es-CL")} de {total.toLocaleString("es-CL")}
      </span>
      <div className="flex items-center gap-1.5">
        <Link href={enlace(pagina - 1)} scroll={false} className={boton(pagina > 1)} aria-disabled={pagina <= 1}>
          ← Anterior
        </Link>
        <span className="px-2 tabular-nums">
          {pagina} / {paginas}
        </span>
        <Link href={enlace(pagina + 1)} scroll={false} className={boton(pagina < paginas)} aria-disabled={pagina >= paginas}>
          Siguiente →
        </Link>
      </div>
    </div>
  );
}

/** Arma un enlace con los parámetros actuales cambiando algunos (null borra). */
export function conParametros(base: string, actuales: Record<string, string | undefined>, cambios: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...actuales, ...cambios })) {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Celda de encabezado de tabla que ordena al tocarla. */
export function Orden({ etiqueta, campo, actual, enlace, derecha = false }: { etiqueta: string; campo: string; actual: string; enlace: (orden: string) => string; derecha?: boolean }) {
  const activo = actual === campo || actual === `-${campo}`;
  const asc = actual === campo;
  // Los montos y conteos se quieren primero de mayor a menor: el primer toque ordena descendente.
  const siguiente = activo ? (asc ? `-${campo}` : campo) : `-${campo}`;
  return (
    <Link href={enlace(siguiente)} scroll={false} className={`inline-flex items-center gap-1 hover:text-tinta ${derecha ? "flex-row-reverse" : ""} ${activo ? "text-tinta" : ""}`}>
      {etiqueta}
      <span className={`text-[9px] ${activo ? "opacity-100" : "opacity-0"}`}>{asc ? "▲" : "▼"}</span>
    </Link>
  );
}
