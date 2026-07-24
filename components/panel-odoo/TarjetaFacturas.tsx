import { obtenerKpisFacturas, listarFacturasRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import { GraficoAreaSimple } from "./graficos";
import ListaFacturasClickeable from "./ListaFacturasClickeable";

export default async function TarjetaFacturas({ companyId }: { companyId: number }) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisFacturas(companyId),
    listarFacturasRecientes(companyId, 5),
  ]);

  return (
    <div className="rounded-xl border border-borde bg-white p-5">
      <p className="font-condensed text-base font-bold uppercase text-tinta">Facturas</p>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Facturado (mes)</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-tinta">{money(kpis.facturadoVentasMes)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Por cobrar</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-teal">{money(kpis.pendienteCobro)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Por pagar</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-naranjo">{money(kpis.pendientePago)}</p>
        </div>
      </div>

      <div className="mt-4">
        <GraficoAreaSimple datos={kpis.serieMensualVentas} />
      </div>

      <ListaFacturasClickeable facturas={recientes} />
    </div>
  );
}
