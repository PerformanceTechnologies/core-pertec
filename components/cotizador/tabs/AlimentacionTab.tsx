import type { AlimentacionTarifas, QuotationInput } from "@/lib/cotizador/motor/types";
import type { QuotationResult } from "@/lib/cotizador/motor/consolidacion";
import { money } from "@/lib/cotizador/formato";
import { NumInput } from "../campos/Campos";

export default function AlimentacionTab({
  quotation,
  result,
  update,
  disabled,
}: {
  quotation: QuotationInput;
  result: QuotationResult;
  update: (fn: (q: QuotationInput) => QuotationInput) => void;
  disabled: boolean;
}) {
  const tarifas = quotation.tarifasAlimentacion;
  const lista: { k: string; campo: keyof AlimentacionTarifas }[] = [
    { k: "Desayuno", campo: "desayuno" },
    { k: "Almuerzo", campo: "almuerzo" },
    { k: "Cena", campo: "cena" },
    { k: "Colación", campo: "colacion" },
  ];
  const tarifaDia = tarifas.desayuno + tarifas.almuerzo + tarifas.cena + tarifas.colacion;
  const dotTotal = result.staff.reduce((a, s) => a + s.dotacionTotal, 0);

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
      <div className="rounded-xl border border-borde bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Tarifas por ración</div>
        <div className="mt-1 text-xs text-tinta/50">heredadas de la locación — editables con override por cotización</div>

        {lista.map((t) => (
          <div key={t.campo} className="flex items-center gap-3 border-b border-borde py-2">
            <span className="flex-1 text-sm text-tinta/70">{t.k}</span>
            <div className="w-28">
              <NumInput
                value={tarifas[t.campo]}
                onChange={(v) => update((q) => ({ ...q, tarifasAlimentacion: { ...q.tarifasAlimentacion, [t.campo]: v } }))}
                disabled={disabled}
              />
            </div>
          </div>
        ))}

        <div className="mt-3 flex items-center gap-3">
          <span className="flex-1 text-sm text-tinta/70">Días de alimentación / mes</span>
          <div className="w-28">
            <NumInput
              value={quotation.diasAlimentacionMes}
              onChange={(v) => update((q) => ({ ...q, diasAlimentacionMes: v }))}
              format="plain"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="mt-3 flex justify-between rounded-md bg-crema px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-tinta/60">Costo día por persona</span>
          <span className="text-sm font-bold tabular-nums text-tinta">{money(tarifaDia)}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-borde bg-white">
        <div className="grid grid-cols-[minmax(160px,1.6fr)_90px_100px_130px] gap-x-3 border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
          <span>Cargo</span>
          <span className="text-right">Dotación</span>
          <span className="text-right">Raciones/mes</span>
          <span className="text-right">Costo mensual</span>
        </div>
        {result.alimentacionPorCargo.map((a) => (
          <div key={a.id} className="grid grid-cols-[minmax(160px,1.6fr)_90px_100px_130px] gap-x-3 border-b border-borde px-4 py-2 text-sm">
            <span className="text-tinta">{a.cargo}</span>
            <span className="text-right tabular-nums text-tinta/60">{a.dotacion}</span>
            <span className="text-right tabular-nums text-tinta/60">{a.racionesMes}</span>
            <span className="rounded-md bg-crema px-2 py-0.5 text-right font-semibold tabular-nums text-tinta">
              {money(a.costoMensual)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-tinta px-4 py-3 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
            Alimentación mensual · {dotTotal} personas × {quotation.diasAlimentacionMes} días
          </span>
          <span className="text-base font-bold tabular-nums text-naranjo-suave">{money(result.alimentacionTotal)}</span>
        </div>
      </div>
    </div>
  );
}
