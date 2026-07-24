import { obtenerKpisContabilidad } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import { GraficoBarrasDobles } from "./graficos";

export default async function TarjetaContabilidad({ companyId }: { companyId: number }) {
  const kpis = await obtenerKpisContabilidad(companyId);

  return (
    <div className="rounded-xl border border-borde bg-white p-5">
      <p className="font-condensed text-base font-bold uppercase text-tinta">Contabilidad</p>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Ingresos (mes)</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-teal">{money(kpis.ingresoMes)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Gastos (mes)</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-naranjo">{money(kpis.gastoMes)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Margen (mes)</p>
          <p className={`mt-0.5 font-condensed text-lg font-bold ${kpis.margenMes >= 0 ? "text-teal" : "text-red-600"}`}>
            {money(kpis.margenMes)}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <GraficoBarrasDobles datos={kpis.serieMensual} />
      </div>
      <p className="mt-2 text-[11px] text-tinta/40">Verde: ingresos · Naranjo: gastos</p>
    </div>
  );
}
