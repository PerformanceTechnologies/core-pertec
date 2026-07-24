import { obtenerKpisFacturas, listarFacturasRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaFacturasClickeable from "./ListaFacturasClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

export default async function TarjetaFacturas({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisFacturas(companyId),
    listarFacturasRecientes(companyId, 5),
  ]);

  return (
    <TarjetaBase titulo="Facturas" acento="naranjo" icono="file-invoice" ejecucion={ejecucion}>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Facturado (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">
            {money(kpis.facturadoVentasMes)}
            <IndicadorVariacion actual={kpis.facturadoVentasMes} anterior={kpis.facturadoVentasMesAnterior} />
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Por cobrar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{money(kpis.pendienteCobro)}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Por pagar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">{money(kpis.pendientePago)}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensualVentas} />
      </div>

      <ListaFacturasClickeable facturas={recientes} />
    </TarjetaBase>
  );
}
