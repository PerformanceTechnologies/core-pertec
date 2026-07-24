import { obtenerKpisContabilidad } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoBarrasDobles } from "./graficos";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

export default async function TarjetaContabilidad({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const kpis = await obtenerKpisContabilidad(companyId);

  return (
    <TarjetaBase titulo="Contabilidad" acento="teal" icono="chart-bar" ejecucion={ejecucion}>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Ingresos (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{money(kpis.ingresoMes)}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Gastos (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">{money(kpis.gastoMes)}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Margen (mes)</p>
          <p className={`mt-0.5 truncate font-condensed text-sm font-bold ${kpis.margenMes >= 0 ? "text-teal" : "text-red-600"}`}>
            {money(kpis.margenMes)}
            <IndicadorVariacion actual={kpis.margenMes} anterior={kpis.margenMesAnterior} />
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoBarrasDobles datos={kpis.serieMensual} />
      </div>
      <p className="mt-1.5 text-[10px] text-tinta/40">Verde: ingresos · Naranjo: gastos</p>
    </TarjetaBase>
  );
}
