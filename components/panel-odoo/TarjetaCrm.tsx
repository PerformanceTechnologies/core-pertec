import { obtenerKpisCrm, listarLeadsRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoDona, GraficoBarrasRanking } from "./graficos";
import ListaLeadsClickeable from "./ListaLeadsClickeable";
import TarjetaBase from "./TarjetaBase";

const LIMITE_EXPANDIDO = 20;

export default async function TarjetaCrm({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisCrm(companyId),
    listarLeadsRecientes(companyId, LIMITE_EXPANDIDO),
  ]);

  return (
    <TarjetaBase
      titulo="CRM"
      acento="naranjoSuave"
      icono="briefcase"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Stat etiqueta="Oportunidades abiertas" valor={String(kpis.oportunidadesAbiertas)} color="text-tinta" />
            <Stat etiqueta="Monto esperado" valor={money(kpis.montoEsperadoTotal)} color="text-teal" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Pipeline por etapa</p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
            <GraficoDona datos={kpis.porEtapa} expandido />
            <div className="divide-y divide-borde">
              {kpis.montoPorEtapa.map((fila) => (
                <div key={fila.etapa} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="min-w-0 truncate text-tinta/70">
                    {fila.etapa} <span className="text-tinta/40">({fila.cantidad})</span>
                  </span>
                  <span className="ml-3 shrink-0 font-semibold text-tinta">{money(fila.monto)}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Pipeline por vendedor</p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
            <GraficoBarrasRanking datos={kpis.porVendedor} dataKey="cantidad" nameKey="vendedor" expandido />
            <div className="divide-y divide-borde">
              {kpis.montoPorVendedor.map((fila) => (
                <div key={fila.vendedor} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="min-w-0 truncate text-tinta/70">
                    {fila.vendedor} <span className="text-tinta/40">({fila.cantidad})</span>
                  </span>
                  <span className="ml-3 shrink-0 font-semibold text-tinta">{money(fila.monto)}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Últimas {recientes.length} oportunidades
          </p>
          <ListaLeadsClickeable leads={recientes} />
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Oportunidades abiertas" className="truncate text-[10px] uppercase text-tinta/45">Oportunidades abiertas</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.oportunidadesAbiertas}</p>
        </div>
        <div className="min-w-0">
          <p title="Monto esperado" className="truncate text-[10px] uppercase text-tinta/45">Monto esperado</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{money(kpis.montoEsperadoTotal)}</p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Por etapa</p>
          <GraficoDona datos={kpis.porEtapa} />
        </div>
        <div>
          <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Por vendedor</p>
          <GraficoBarrasRanking datos={kpis.porVendedor} dataKey="cantidad" nameKey="vendedor" />
        </div>
      </div>

      <ListaLeadsClickeable leads={recientes.slice(0, 5)} />
    </TarjetaBase>
  );
}

function Stat({ etiqueta, valor, color }: { etiqueta: string; valor: string; color: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-crema/60 px-3 py-2">
      <p className="truncate text-[10px] uppercase text-tinta/45">{etiqueta}</p>
      <p className={`mt-0.5 truncate font-condensed text-base font-bold ${color}`}>{valor}</p>
    </div>
  );
}
