// Colores de los estados de facturación electrónica (sin "use client": sirven en servidor y cliente).
import type { EstadoSii } from "@/lib/fin/dte/modelo";

export const TONO_SII: Record<EstadoSii, string> = {
  aceptado: "bg-emerald-500/12 text-ok dark:text-emerald-300",
  aceptado_reparos: "bg-amber-500/12 text-aviso dark:text-amber-300",
  rechazado: "bg-rose-500/12 text-alerta dark:text-rose-300",
  pendiente: "bg-sky-500/10 text-info dark:text-sky-300",
  desconocido: "bg-slate-500/10 text-slate-500",
};
export const TONO_EMISION: Record<string, string> = {
  borrador: "bg-slate-500/10 text-tinta dark:text-slate-300",
  enviando: "bg-amber-500/12 text-aviso dark:text-amber-300",
  error: "bg-rose-500/12 text-alerta dark:text-rose-300",
  descartado: "bg-slate-500/10 text-slate-500",
  emitido: "bg-emerald-500/12 text-ok dark:text-emerald-300",
};

