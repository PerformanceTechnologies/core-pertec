import { ETIQUETA_ESTADO_RENDICION } from "@/lib/permisos-rendidor";
import type { EstadoRendicion } from "@/lib/rendidor/tipos";

// El vocabulario visual de Rendir Gastos: un color por estado, igual en la lista y en la ficha.

export const ESTILO_ESTADO_RENDICION: Record<EstadoRendicion, { punto: string; fondo: string; barra: string }> = {
  borrador: { punto: "bg-slate-400", fondo: "bg-slate-500/10 text-slate-700 dark:text-slate-300", barra: "#94a3b8" },
  enviada: { punto: "bg-sky-500", fondo: "bg-sky-500/10 text-sky-700 dark:text-sky-300", barra: "#0ea5e9" },
  rechazada: { punto: "bg-rose-500", fondo: "bg-rose-500/10 text-rose-700 dark:text-rose-300", barra: "#f43f5e" },
  aprobada: { punto: "bg-amber-500", fondo: "bg-amber-500/12 text-amber-700 dark:text-amber-300", barra: "#f59e0b" },
  pagada: { punto: "bg-emerald-500", fondo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", barra: "#10b981" },
  cargada_odoo: { punto: "bg-violet-400", fondo: "bg-violet-500/10 text-violet-700 dark:text-violet-300", barra: "#a78bfa" },
  reembolso_pendiente: { punto: "bg-orange-500", fondo: "bg-orange-500/12 text-orange-700 dark:text-orange-300", barra: "#f97316" },
  reembolsada: { punto: "bg-emerald-500", fondo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", barra: "#10b981" },
  cerrada: { punto: "bg-emerald-600", fondo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", barra: "#059669" },
  anulada: { punto: "bg-slate-300", fondo: "bg-slate-500/10 text-slate-500", barra: "#cbd5e1" },
};

export function ChipEstadoRendicion({ estado }: { estado: EstadoRendicion }) {
  const e = ESTILO_ESTADO_RENDICION[estado];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${e.fondo}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${e.punto}`} />
      {ETIQUETA_ESTADO_RENDICION[estado]}
    </span>
  );
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
