import Link from "next/link";
import { IconAlertTriangle, IconChevronRight } from "@tabler/icons-react";
import { ETIQUETA_ESTADO_FONDO, TONO_ESTADO_FONDO, estaVencido, pesos, type Fondo } from "@/lib/rendidor/fondos-modelo";

// Piezas de vista de Fondos que se usan en varias pantallas (sin estado: se renderizan en el servidor).

export function ChipFondo({ estado }: { estado: Fondo["estado"] }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONO_ESTADO_FONDO[estado]}`}>{ETIQUETA_ESTADO_FONDO[estado]}</span>;
}

/** Cuánto del fondo se usó, con el aviso cuando se acerca o pasa el límite. */
export function BarraUso({ f, umbral }: { f: Fondo; umbral: number }) {
  const base = f.transferido || f.montoAutorizado || 0;
  if (!base) return null;
  const usado = base - f.saldo;
  const pct = Math.max(0, Math.round((usado / base) * 100));
  const tono = pct >= 100 ? "bg-rose-500" : pct >= umbral * 100 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-tinta/[0.07]">
        <div className={`h-full rounded-full ${tono}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-1 flex justify-between text-[11px] text-gris">
        <span>{pct}% usado</span>
        <span>{pesos(Math.max(0, usado))} de {pesos(base)}</span>
      </p>
    </div>
  );
}

/** Una fila de fondo: código, persona, estado, saldo y —si vienen— los botones de la bandeja. */
export function FilaFondo({ f, hoy, umbral, children }: { f: Fondo; hoy: string; umbral: number; children?: React.ReactNode }) {
  const vencido = estaVencido(f, hoy);
  const monto = f.estado === "activo" || f.estado === "cerrado_con_saldo" || f.estado === "devolucion_pendiente" ? f.saldo : f.montoAutorizado ?? f.montoSolicitado ?? 0;
  const etiquetaMonto = f.estado === "activo" || f.estado === "cerrado_con_saldo" || f.estado === "devolucion_pendiente" ? "saldo" : f.montoAutorizado ? "autorizado" : "solicitado";
  return (
    <li className={`rounded-xl border bg-superficie p-3.5 ${vencido ? "border-rose-300/70" : "border-borde"}`}>
      <Link href={`/rendir-gastos/fondos/${f.id}`} className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-tinta">{f.codigo}</span>
            <ChipFondo estado={f.estado} />
            {f.esFijo && <span className="rounded-full bg-teal-500/12 px-2 py-0.5 text-[10px] font-bold text-teal-700">Fijo</span>}
            {vencido && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-0.5 text-[10px] font-bold text-rose-600"><IconAlertTriangle size={11} /> Vencido</span>}
          </p>
          <p className="mt-0.5 truncate text-xs text-gris">{f.rendidorNombre}{f.motivo ? ` · ${f.motivo}` : ""}</p>
        </div>
        <div className="text-right">
          <p className={`font-condensed text-xl font-bold tabular-nums ${monto < 0 ? "text-orange-600" : "text-tinta"}`}>{pesos(monto)}</p>
          <p className="text-[10px] uppercase tracking-wide text-gris-suave">{etiquetaMonto}</p>
        </div>
        <IconChevronRight size={16} className="mt-1.5 shrink-0 text-gris-suave" />
      </Link>
      {f.estado === "activo" && <BarraUso f={f} umbral={umbral} />}
      {children && <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-borde pt-3">{children}</div>}
    </li>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed border-borde px-4 py-6 text-center text-sm text-gris">{texto}</p>;
}
