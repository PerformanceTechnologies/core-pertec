import type { QuotationInput } from "@/lib/cotizador/motor/types";
import type { CotizacionCompleta } from "@/lib/cotizador";
import { EMPRESAS } from "@/lib/cotizador/empresas";
import { money, fechaCl } from "@/lib/cotizador/formato";
import { NumInput } from "../campos/Campos";
import { actualizarMetaCotizacionAction } from "@/app/(protegido)/cotizador/acciones";

export default function ParametrosTab({
  cotizacion,
  quotation,
  update,
  disabled,
}: {
  cotizacion: CotizacionCompleta;
  quotation: QuotationInput;
  update: (fn: (q: QuotationInput) => QuotationInput) => void;
  disabled: boolean;
}) {
  const accionMeta = actualizarMetaCotizacionAction.bind(null, cotizacion.id);
  const P = cotizacion.parametrosSnapshot;

  const spotParams: { etiqueta: string; campo: keyof QuotationInput; formato: "plain" }[] = [
    { etiqueta: "Duración (meses)", campo: "duracionMeses", formato: "plain" },
    { etiqueta: "Días de servicio", campo: "diasServicio", formato: "plain" },
    { etiqueta: "Horas base/mes", campo: "horasBaseMes", formato: "plain" },
    { etiqueta: "Factor contingencia", campo: "factorContingencia", formato: "plain" },
    { etiqueta: "Divisor movilización", campo: "divisorMovilizacion", formato: "plain" },
    { etiqueta: "N° cuadrillas día", campo: "nCuadrillasDia", formato: "plain" },
    { etiqueta: "N° cuadrillas noche", campo: "nCuadrillasNoche", formato: "plain" },
  ];

  const legalItems = [
    { k: "UF", v: money(P.uf) },
    { k: "UTM", v: money(P.utm) },
    { k: "Ingreso mínimo", v: money(P.ingresoMinimo) },
    { k: "Tope imponible AFP", v: `${P.topeImponibleAfpUF} UF` },
    { k: "Tope imponible cesantía", v: `${P.topeImponibleCesantiaUF} UF` },
    { k: "AFP (tasa promedio)", v: `${(P.tasaAfp * 100).toFixed(2)}%` },
    { k: "Aporte reforma previsional", v: `${(P.aporteReformaPrevisionalEmp * 100).toFixed(1)}%` },
    { k: "Tramos impuesto único", v: `${P.taxBrackets.length} tramos` },
  ];

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_.8fr] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-borde bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Identificación del proyecto</div>
          <form action={accionMeta} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-tinta/70">Nombre del proyecto</label>
              <input
                name="nombre"
                required
                defaultValue={cotizacion.nombre}
                disabled={disabled}
                className="mt-1 h-9 w-full rounded-md border border-borde px-2 text-sm outline-none focus:border-naranjo/50 disabled:bg-crema"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tinta/70">Empresa</label>
              <select
                name="empresa"
                defaultValue={cotizacion.empresa}
                disabled={disabled}
                className="mt-1 h-9 w-full rounded-md border border-borde bg-white px-2 text-sm outline-none focus:border-naranjo/50 disabled:bg-crema"
              >
                {EMPRESAS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-tinta/70">Cliente</label>
              <input
                name="cliente"
                defaultValue={cotizacion.cliente ?? ""}
                disabled={disabled}
                className="mt-1 h-9 w-full rounded-md border border-borde px-2 text-sm outline-none focus:border-naranjo/50 disabled:bg-crema"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tinta/70">Faena / locación</label>
              <input
                name="faena"
                defaultValue={cotizacion.faena ?? ""}
                disabled={disabled}
                className="mt-1 h-9 w-full rounded-md border border-borde px-2 text-sm outline-none focus:border-naranjo/50 disabled:bg-crema"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tinta/70">Tipo de servicio</label>
              <select
                name="tipoServicio"
                defaultValue={cotizacion.tipoServicio}
                disabled={disabled}
                className="mt-1 h-9 w-full rounded-md border border-borde bg-white px-2 text-sm outline-none focus:border-naranjo/50 disabled:bg-crema"
              >
                <option value="spot">SPOT</option>
                <option value="contrato_permanente">Contrato permanente</option>
              </select>
            </div>
            {!disabled && (
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-naranjo px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave"
                >
                  Guardar identificación
                </button>
              </div>
            )}
          </form>
        </div>

        <div className="rounded-xl border border-borde bg-white p-5">
          <div className="flex items-baseline gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Parámetros del motor SPOT</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {spotParams.map((p) => (
              <div key={p.campo}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-tinta/40">{p.etiqueta}</div>
                <div className="mt-1">
                  <NumInput
                    value={quotation[p.campo] as number}
                    onChange={(v) => update((q) => ({ ...q, [p.campo]: v }))}
                    format="plain"
                    disabled={disabled}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-borde bg-crema/40 p-5">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-tinta/50">Set de parámetros legales</div>
          <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal">
            Vigente · {fechaCl(P.vigenteDesde)}
          </span>
        </div>
        <div className="mt-2 text-xs text-tinta/50">
          Congelado al crear esta cotización — se administra en «Parámetros legales» (solo admin).
        </div>
        <div className="mt-3 divide-y divide-borde">
          {legalItems.map((i) => (
            <div key={i.k} className="flex justify-between gap-3 py-2 text-sm">
              <span className="text-tinta/60">{i.k}</span>
              <span className="tabular-nums font-medium text-tinta">{i.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
