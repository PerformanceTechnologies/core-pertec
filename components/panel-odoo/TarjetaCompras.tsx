import { obtenerKpisCompras, listarComprasRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaComprasClickeable from "./ListaComprasClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

export default async function TarjetaCompras({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisCompras(companyId),
    listarComprasRecientes(companyId, 5),
  ]);

  return (
    <TarjetaBase titulo="Compras" acento="teal" icono="clipboard-check" ejecucion={ejecucion}>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Comprado (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {money(kpis.compradoMes)}
            <IndicadorVariacion actual={kpis.compradoMes} anterior={kpis.compradoMesAnterior} esGasto />
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Por facturar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.pendientesFacturar}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensual} />
      </div>

      <ListaComprasClickeable compras={recientes} />
    </TarjetaBase>
  );
}
