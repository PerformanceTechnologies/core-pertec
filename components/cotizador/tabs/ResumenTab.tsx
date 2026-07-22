import type { MargenesConfig, QuotationInput } from "@/lib/cotizador/motor/types";
import type { QuotationResult } from "@/lib/cotizador/motor/consolidacion";
import { money, pct } from "@/lib/cotizador/formato";
import { Badge } from "../campos/Campos";

const ASIG_CLASES: Record<string, string> = {
  directo: "bg-teal/10 text-teal",
  indirecto: "bg-gris/10 text-gris",
  mixto: "bg-naranjo/10 text-naranjo",
};

export default function ResumenTab({
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
  const m = quotation.margenes;
  const pctDir = result.costoMensualTotal > 0 ? pct(result.costoDirecto / result.costoMensualTotal) : "0%";
  const pctInd = result.costoMensualTotal > 0 ? pct(result.costoIndirecto / result.costoMensualTotal) : "0%";

  const setMargen = (campo: keyof MargenesConfig, valorPct: number) =>
    update((q) => ({ ...q, margenes: { ...q.margenes, [campo]: valorPct / 100 } }));

  const margenesA: { k: string; campo: keyof MargenesConfig; v: number; monto: number }[] = [
    { k: "MOB", campo: "mobPct", v: m.mobPct * 100, monto: result.mob },
    { k: "GG", campo: "ggPct", v: m.ggPct * 100, monto: result.gg },
    { k: "Utilidad", campo: "utilidadPct", v: m.utilidadPct * 100, monto: result.utilidad },
  ];
  const margenesB: { k: string; campo: keyof MargenesConfig; v: number; monto: number }[] = [
    { k: "GG-ECO", campo: "ggEcoPct", v: m.ggEcoPct * 100, monto: result.ggEco },
    { k: "Utilidad-ECO", campo: "utilidadEcoPct", v: m.utilidadEcoPct * 100, monto: result.utilidadEco },
  ];

  const escalera = [
    { k: "Costo mensual total", v: money(result.costoMensualTotal), fuerte: "font-medium" },
    { k: "+ MOB", v: money(result.mob), n: pct(m.mobPct) },
    { k: "= Venta mensual", v: money(result.ventaMensual), fuerte: "font-semibold", fondo: true },
    { k: "+ GG", v: money(result.gg), n: pct(m.ggPct) },
    { k: "+ Utilidad", v: money(result.utilidad), n: pct(m.utilidadPct) },
    { k: "= Costo total servicio", v: money(result.costoTotalServicio), fuerte: "font-bold", fondo: true },
  ];

  const margenPositivo = result.margenEfectivoTotal >= 0.15;

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_.65fr] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-borde bg-white">
          <div className="grid grid-cols-[minmax(190px,1.7fr)_130px_76px_110px] gap-x-3 border-b-2 border-tinta px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-tinta/40">
            <span>Categoría de costo</span>
            <span className="text-right">Costo mensual</span>
            <span className="text-right">% total</span>
            <span>Asignación</span>
          </div>
          {result.categorias.map((c) => (
            <div key={c.categoria} className="grid grid-cols-[minmax(190px,1.7fr)_130px_76px_110px] items-center gap-x-3 border-b border-borde px-4 py-2 text-sm">
              <span className="text-tinta">{c.nombre}</span>
              <span className="text-right font-medium tabular-nums text-tinta">{money(c.monto)}</span>
              <span className="text-right text-xs tabular-nums text-tinta/40">
                {result.costoMensualTotal > 0 ? pct(c.monto / result.costoMensualTotal) : "0%"}
              </span>
              <span>
                <Badge tono={c.asignacion === "directo" ? "teal" : c.asignacion === "mixto" ? "naranjo" : "gris"}>
                  {c.asignacion.toUpperCase()}
                </Badge>
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(190px,1.7fr)_130px_186px] items-center gap-x-3 border-t-2 border-tinta bg-crema/50 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-tinta">Costo mensual total</span>
            <span className="text-right text-base font-bold tabular-nums text-tinta">{money(result.costoMensualTotal)}</span>
            <span className="text-right text-xs text-tinta/40">directo {pctDir} · indirecto {pctInd}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-borde bg-white">
          {escalera.map((e) => (
            <div
              key={e.k}
              className={`grid grid-cols-[minmax(190px,1.7fr)_130px_1fr] items-center gap-x-3 border-b border-borde px-4 py-2 ${e.fondo ? "bg-crema/50" : ""}`}
            >
              <span className={`text-sm ${e.fuerte ?? ""} text-tinta`}>{e.k}</span>
              <span className={`text-right text-sm tabular-nums ${e.fuerte ?? ""} text-tinta`}>{e.v}</span>
              <span className="text-right text-xs text-tinta/30">{e.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="rounded-xl border border-borde bg-white p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-tinta/50">Márgenes internos · RESUMEN</div>
          {margenesA.map((mm) => (
            <div key={mm.k} className="flex items-center gap-2 py-1.5">
              <span className="flex-1 text-sm text-tinta/70">{mm.k}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                defaultValue={mm.v}
                disabled={disabled}
                onChange={(e) => setMargen(mm.campo, Number(e.target.value))}
                className="h-8 w-16 rounded-md border border-borde px-2 text-right text-sm tabular-nums outline-none focus:border-naranjo/50 disabled:bg-crema"
              />
              <span className="w-3 text-xs text-tinta/40">%</span>
              <span className="w-24 text-right text-xs tabular-nums text-tinta/60">{money(mm.monto)}</span>
            </div>
          ))}

          <div className="my-2.5 h-px bg-borde" />

          <div className="mb-2 flex items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">
              Márgenes ECO · sobre{" "}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  update((q) => ({
                    ...q,
                    margenes: { ...q.margenes, baseCalculoEco: m.baseCalculoEco === "costo_puro" ? "costo_cargado" : "costo_puro" },
                  }))
                }
                className="normal-case tracking-normal text-naranjo underline decoration-dotted"
              >
                {m.baseCalculoEco === "costo_puro" ? "costo puro" : "costo cargado"}
              </button>
            </div>
          </div>
          {margenesB.map((mm) => (
            <div key={mm.k} className="flex items-center gap-2 py-1.5">
              <span className="flex-1 text-sm text-tinta/70">{mm.k}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                defaultValue={mm.v}
                disabled={disabled}
                onChange={(e) => setMargen(mm.campo, Number(e.target.value))}
                className="h-8 w-16 rounded-md border border-borde px-2 text-right text-sm tabular-nums outline-none focus:border-naranjo/50 disabled:bg-crema"
              />
              <span className="w-3 text-xs text-tinta/40">%</span>
              <span className="w-24 text-right text-xs tabular-nums text-tinta/60">{money(mm.monto)}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 py-1.5">
            <span className="flex-1 text-sm text-tinta/70">IVA</span>
            <span className="flex h-8 w-16 items-center justify-end rounded-md bg-crema px-2 text-sm tabular-nums text-tinta/60">
              {(m.ivaPct * 100).toFixed(0)}
            </span>
            <span className="w-3 text-xs text-tinta/40">%</span>
            <span className="w-24 text-right text-xs tabular-nums text-tinta/60">{money(result.ecoIva)}</span>
          </div>
        </div>

        <div className="rounded-xl bg-tinta p-4 text-white">
          <div className="flex justify-between border-b border-white/10 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Costo total</span>
            <span className="text-base font-bold tabular-nums">{money(result.costoMensualTotal)}</span>
          </div>
          <div className="flex justify-between border-b border-white/10 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Precio de venta</span>
            <span className="text-base font-bold tabular-nums">{money(result.costoTotalServicio)}</span>
          </div>
          <div className="pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Margen efectivo total</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold tabular-nums ${margenPositivo ? "text-teal-suave" : "text-naranjo-suave"}`}>
                {pct(result.margenEfectivoTotal)}
              </span>
              <span className="text-xs text-white/55">recargo compuesto {pct(result.recargoCompuesto)} sobre costo</span>
            </div>
          </div>
        </div>

        {result.warnDobleMargen && (
          <div className="rounded-lg border border-naranjo/30 bg-naranjo/5 p-3.5 text-xs leading-relaxed text-tinta/70">
            <b className="text-tinta">Márgenes aplicados dos veces.</b> GG {pct(m.ggPct)} + Utilidad {pct(m.utilidadPct)} ya
            están en el precio de venta, y GG-ECO {pct(m.ggEcoPct)} + Utilidad-ECO {pct(m.utilidadEcoPct)} se aplican sobre
            ese costo cargado. Verifique si es colchón de negociación intencional o doble marginación.{" "}
            {!disabled && (
              <button
                type="button"
                onClick={() => update((q) => ({ ...q, margenes: { ...q.margenes, baseCalculoEco: "costo_puro" } }))}
                className="text-naranjo underline"
              >
                Cambiar base de cálculo ECO →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
