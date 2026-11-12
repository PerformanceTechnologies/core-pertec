import Link from "next/link";
import { IconAlertTriangle, IconChevronRight } from "@tabler/icons-react";
import { ETIQUETA_ESTADO_RENDICION } from "@/lib/permisos-rendidor";
import { estaVencido, pesos, type Fondo } from "@/lib/rendidor/fondos-modelo";
import type { ResumenRendicion } from "@/lib/rendidor/tipos";
import { ChipFondo } from "./Vistas";

const COLS = "md:grid-cols-[6.5rem_minmax(0,1.3fr)_9.5rem_minmax(0,1.2fr)_6rem_minmax(7.5rem,1fr)_6rem_auto]";
// Informes que todavía no pasaron a los libros: su total aún no descuenta del fondo.
const SIN_APROBAR = ["borrador", "enviada", "rechazada"];

/**
 * Los fondos en una tabla compacta: una línea por fondo con su estado, los informes que ya tiene asignados y lo USADO
 * de verdad (lo aprobado del libro más lo que ya cargaron en informes sin aprobar). Cada fila abre el fondo.
 */
export default function TablaFondos({
  fondos,
  informes,
  hoy,
  acciones,
}: {
  fondos: Fondo[];
  informes: ResumenRendicion[];
  hoy: string;
  /** Los botones de cada fila (archivar, desarchivar…). */
  acciones?: (f: Fondo) => React.ReactNode;
}) {
  const porFondo = new Map<string, ResumenRendicion[]>();
  for (const i of informes) if (i.fondoId) porFondo.set(i.fondoId, [...(porFondo.get(i.fondoId) ?? []), i]);

  return (
    <div className="overflow-hidden rounded-lg border border-borde bg-superficie">
      <div className={`hidden ${COLS} items-center gap-2.5 border-b border-borde bg-tinta/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gris md:grid`}>
        <span>Fondo</span><span>Persona</span><span>Estado</span><span>Informes</span><span className="text-right">Monto</span><span>Usado</span><span className="text-right">Disponible</span><span />
      </div>
      <ul className="divide-y divide-borde">
        {fondos.map((f) => {
          const infs = porFondo.get(f.id) ?? [];
          const porAprobar = infs.filter((i) => SIN_APROBAR.includes(i.estado)).reduce((s, i) => s + i.totalGastos, 0);
          const base = (f.esFijo ? f.montoFijo : null) || f.transferido || f.montoAutorizado || f.montoSolicitado || 0;
          const usado = Math.max(0, f.gastado) + porAprobar;
          const pct = base > 0 ? Math.round((usado / base) * 100) : 0;
          const disponible = f.saldo - porAprobar;
          const conSaldo = f.estado === "activo" || f.estado === "cerrado_con_saldo" || f.estado === "devolucion_pendiente";
          const vencido = estaVencido(f, hoy);
          const conteo = new Map<string, number>();
          for (const i of infs) conteo.set(i.estado, (conteo.get(i.estado) ?? 0) + 1);
          return (
            <li key={f.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 px-3 py-1.5 text-[13px] leading-tight ${COLS} ${vencido ? "bg-rose-500/[0.03]" : ""}`}>
              <Link href={`/rendir-gastos/fondos/${f.id}`} className="flex items-center gap-1.5 font-bold text-tinta hover:text-naranjo">
                {f.codigo}
                {f.esFijo && <span className="rounded bg-teal-500/12 px-1 text-[9px] font-bold text-teal-700">Fijo</span>}
                {vencido && <IconAlertTriangle size={12} className="text-rose-500" aria-label="Vencido" />}
              </Link>
              <span className="min-w-0 truncate text-xs text-gris md:text-tinta">
                {f.rendidorNombre}
                <span className="text-gris"> · {f.motivo || "sin motivo"}</span>
              </span>
              <span className="col-start-1 md:col-start-auto"><ChipFondo estado={f.estado} /></span>
              <span className="min-w-0 text-xs">
                {infs.length === 0 ? (
                  <span className="text-gris-suave">Sin informe</span>
                ) : (
                  <span className="text-tinta">
                    <b>{infs.length}</b> {infs.length === 1 ? "informe" : "informes"}
                    <span className="text-gris"> · {[...conteo].map(([e, n]) => `${n} ${ETIQUETA_ESTADO_RENDICION[e as keyof typeof ETIQUETA_ESTADO_RENDICION]?.toLowerCase() ?? e}`).join(", ")}</span>
                  </span>
                )}
              </span>
              <span className="hidden text-right font-semibold tabular-nums text-tinta md:block">{base ? pesos(base) : "—"}</span>
              <span className="hidden md:block" title={`Aprobado ${pesos(Math.max(0, f.gastado))} · en informes sin aprobar ${pesos(porAprobar)}`}>
                {base > 0 && f.estado !== "en_validacion" && f.estado !== "validado" && f.estado !== "rechazado" && f.estado !== "anulado" ? (
                  <>
                    <span className="flex items-baseline justify-between gap-1">
                      <b className="tabular-nums text-tinta">{pesos(usado)}</b>
                      <span className="text-[10px] tabular-nums text-gris">{pct}%</span>
                    </span>
                    <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-tinta/[0.07]">
                      <span className={`block h-full rounded-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </span>
                  </>
                ) : (
                  <span className="text-gris-suave">—</span>
                )}
              </span>
              <span className={`hidden text-right font-semibold tabular-nums md:block ${disponible < 0 ? "text-orange-600" : "text-tinta"}`}>{conSaldo ? pesos(disponible) : "—"}</span>
              <span className="flex items-center justify-end gap-1.5">
                {acciones?.(f)}
                <Link href={`/rendir-gastos/fondos/${f.id}`} aria-label="Abrir fondo" className="text-gris-suave hover:text-naranjo"><IconChevronRight size={16} /></Link>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
