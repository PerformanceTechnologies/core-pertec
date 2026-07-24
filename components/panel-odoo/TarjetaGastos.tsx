import { obtenerKpisGastos, listarGastosRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaGastosClickeable from "./ListaGastosClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

export default async function TarjetaGastos({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisGastos(companyId),
    listarGastosRecientes(companyId, 5),
  ]);

  return (
    <TarjetaBase titulo="Gastos" acento="tealSuave" icono="cash" ejecucion={ejecucion}>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Gastado (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {money(kpis.totalMes)}
            <IndicadorVariacion actual={kpis.totalMes} anterior={kpis.totalMesAnterior} esGasto />
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Por aprobar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.pendientesAprobacion}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensual} />
      </div>

      <ListaGastosClickeable gastos={recientes} />
    </TarjetaBase>
  );
}
