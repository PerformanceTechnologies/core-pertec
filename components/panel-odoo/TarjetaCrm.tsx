import { obtenerKpisCrm, listarLeadsRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoDona } from "./graficos";
import ListaLeadsClickeable from "./ListaLeadsClickeable";
import TarjetaBase from "./TarjetaBase";

export default async function TarjetaCrm({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisCrm(companyId),
    listarLeadsRecientes(companyId, 5),
  ]);

  return (
    <TarjetaBase titulo="CRM" acento="naranjoSuave" icono="briefcase" ejecucion={ejecucion}>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Oportunidades abiertas</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.oportunidadesAbiertas}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Monto esperado</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{money(kpis.montoEsperadoTotal)}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoDona datos={kpis.porEtapa} />
      </div>

      <ListaLeadsClickeable leads={recientes} />
    </TarjetaBase>
  );
}
