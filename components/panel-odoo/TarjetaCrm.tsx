import { obtenerKpisCrm, listarLeadsRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import { GraficoDona } from "./graficos";
import ListaLeadsClickeable from "./ListaLeadsClickeable";

export default async function TarjetaCrm({ companyId }: { companyId: number }) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisCrm(companyId),
    listarLeadsRecientes(companyId, 5),
  ]);

  return (
    <div className="rounded-xl border border-borde bg-white p-5">
      <p className="font-condensed text-base font-bold uppercase text-tinta">CRM</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Oportunidades abiertas</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-tinta">{kpis.oportunidadesAbiertas}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-tinta/45">Monto esperado</p>
          <p className="mt-0.5 font-condensed text-lg font-bold text-teal">{money(kpis.montoEsperadoTotal)}</p>
        </div>
      </div>

      <div className="mt-4">
        <GraficoDona datos={kpis.porEtapa} />
      </div>

      <ListaLeadsClickeable leads={recientes} />
    </div>
  );
}
