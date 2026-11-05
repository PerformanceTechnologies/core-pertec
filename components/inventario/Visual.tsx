import {
  IconAdjustmentsHorizontal,
  IconArrowsExchange,
  IconPackageExport,
  IconPackageImport,
  type Icon,
} from "@tabler/icons-react";
import { ETIQUETA_CLASE, ETIQUETA_ESTADO, ETIQUETA_ESTADO_OPERATIVO, type ClaseOperacion, type EstadoOperativo, type EstadoTransferencia } from "@/lib/inventario-modelo";

// El vocabulario visual del Inventario: un ícono y un color por clase de operación, y el
// chip de estado. Vive aparte para que el tablero, la lista y el detalle se vean igual.

export const ESTILO_CLASE: Record<ClaseOperacion, { Icono: Icon; tono: string }> = {
  recepcion: { Icono: IconPackageImport, tono: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  entrega: { Icono: IconPackageExport, tono: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  interna: { Icono: IconArrowsExchange, tono: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  ajuste: { Icono: IconAdjustmentsHorizontal, tono: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

export function IconoClase({ clase, chico = false }: { clase: ClaseOperacion; chico?: boolean }) {
  const { Icono, tono } = ESTILO_CLASE[clase];
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${tono} ${chico ? "h-8 w-8" : "h-10 w-10"}`} title={ETIQUETA_CLASE[clase]}>
      <Icono size={chico ? 16 : 19} stroke={1.75} />
    </span>
  );
}

const PUNTO_ESTADO: Record<EstadoTransferencia, string> = {
  borrador: "bg-slate-400",
  listo: "bg-amber-500",
  hecho: "bg-emerald-500",
  cancelado: "bg-rose-500",
};

export function ChipEstado({ estado }: { estado: EstadoTransferencia }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-borde bg-superficie px-2.5 py-1 text-[11px] font-semibold text-tinta">
      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_ESTADO[estado]}`} />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

export const ESTILO_ESTADO_OPERATIVO: Record<EstadoOperativo, string> = {
  operativo: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  no_operativo: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

/** Operativo / No operativo, con su punto de color. */
export function ChipEstadoOperativo({ estado }: { estado: EstadoOperativo }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTILO_ESTADO_OPERATIVO[estado]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${estado === "operativo" ? "bg-emerald-500" : "bg-rose-500"}`} />
      {ETIQUETA_ESTADO_OPERATIVO[estado]}
    </span>
  );
}

// Colores de categoría: siempre el mismo para el mismo nombre.
const TONOS = [
  "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
  "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  "bg-lime-500/12 text-lime-700 dark:text-lime-300",
];

export function tonoDeTexto(texto: string): string {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length];
}

/** La «foto» de un producto: sus iniciales en el color de su categoría. */
/** La casilla del producto en las listas: su foto (chica y apagada) o, sin foto, sus iniciales. */
export function FichaProducto({ nombre, categoria, foto }: { nombre: string; categoria: string | null; foto?: string | null }) {
  if (foto) {
    return (
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-tinta/[0.04] ring-1 ring-borde">
        {/* eslint-disable-next-line @next/next/no-img-element -- viene del Core firmada, sin optimizador */}
        <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 saturate-[.85]" />
      </span>
    );
  }
  const iniciales = nombre
    .split(/\s+/)
    .filter((p) => /[a-záéíóúñ0-9]/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${tonoDeTexto(categoria ?? "—")}`}>
      {iniciales || "?"}
    </span>
  );
}
