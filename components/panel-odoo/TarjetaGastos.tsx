import { obtenerKpisGastos, listarGastosRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import { GraficoAreaSimple } from "./graficos";
import ListaGastosClickeable from "./ListaGastosClickeable";

export default async function TarjetaGastos({ companyId }: { companyId: number }) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisGastos(companyId),
    listarGastosRecientes(companyId, 5),
  ]);

  return (
    <div className="rounded-xl border border-borde bg-white p-5">
      <p className="font-condensed text-base font-bold uppercase text-tinta">Gastos</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Gastado (mes)</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-naranjo">{money(kpis.totalMes)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Por aprobar</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-tinta">{kpis.pendientesAprobacion}</p>
        </div>
      </div>

      <div className="mt-4">
        <GraficoAreaSimple datos={kpis.serieMensual} />
      </div>

      <ListaGastosClickeable gastos={recientes} />
    </div>
  );
}
