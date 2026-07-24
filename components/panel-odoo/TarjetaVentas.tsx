import { obtenerKpisVentas, listarVentasRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaVentasClickeable from "./ListaVentasClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

export default async function TarjetaVentas({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisVentas(companyId),
    listarVentasRecientes(companyId, 5),
  ]);

  return (
    <TarjetaBase titulo="Ventas y Arriendo" acento="naranjo" icono="package" ejecucion={ejecucion}>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Ventas (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">
            {money(kpis.ventasMes)}
            <IndicadorVariacion actual={kpis.ventasMes} anterior={kpis.ventasMesAnterior} />
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Arriendos activos</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{kpis.arriendosActivos}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Monto en arriendo</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {money(kpis.montoArriendosActivos)}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensualVentas} />
      </div>

      <ListaVentasClickeable ventas={recientes} />
    </TarjetaBase>
  );
}
