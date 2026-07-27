import { obtenerKpisContabilidad } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoBarrasDobles } from "./graficos";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatearMes(clave: string): string {
  const [anio, mes] = clave.split("-");
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

export default async function TarjetaContabilidad({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const kpis = await obtenerKpisContabilidad(companyId);

  return (
    <TarjetaBase
      titulo="Contabilidad"
      acento="teal"
      icono="chart-bar"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-3 gap-3">
            <Stat etiqueta="Ingresos (mes)" valor={money(kpis.ingresoMes)} color="text-teal" />
            <Stat etiqueta="Gastos (mes)" valor={money(kpis.gastoMes)} color="text-naranjo" />
            <Stat
              etiqueta="Margen (mes)"
              valor={money(kpis.margenMes)}
              color={kpis.margenMes >= 0 ? "text-teal" : "text-red-600"}
            />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Ingresos vs. gastos (6 meses)</p>
          <div className="mt-2">
            <GraficoBarrasDobles datos={kpis.serieMensual} expandido />
          </div>

          {kpis.serieMensual.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Detalle mensual</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-borde">
                <table className="w-full text-left text-xs">
                  <thead className="bg-crema/60 text-tinta/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Mes</th>
                      <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                      <th className="px-3 py-2 text-right font-medium">Gastos</th>
                      <th className="px-3 py-2 text-right font-medium">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {[...kpis.serieMensual].reverse().map((fila) => {
                      const margen = fila.ingreso - fila.gasto;
                      return (
                        <tr key={fila.mes}>
                          <td className="px-3 py-2 capitalize text-tinta/70">{formatearMes(fila.mes)}</td>
                          <td className="px-3 py-2 text-right text-teal">{money(fila.ingreso)}</td>
                          <td className="px-3 py-2 text-right text-naranjo">{money(fila.gasto)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${margen >= 0 ? "text-teal" : "text-red-600"}`}>
                            {money(margen)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Ingresos (mes)" className="truncate text-[10px] uppercase text-tinta/45">Ingresos (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{money(kpis.ingresoMes)}</p>
        </div>
        <div className="min-w-0">
          <p title="Gastos (mes)" className="truncate text-[10px] uppercase text-tinta/45">Gastos (mes)</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">{money(kpis.gastoMes)}</p>
        </div>
        <div className="min-w-0">
          <p title="Margen (mes)" className="truncate text-[10px] uppercase text-tinta/45">Margen (mes)</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <p
              className={`min-w-0 truncate font-condensed text-sm font-bold ${kpis.margenMes >= 0 ? "text-teal" : "text-red-600"}`}
            >
              {money(kpis.margenMes)}
            </p>
            <IndicadorVariacion actual={kpis.margenMes} anterior={kpis.margenMesAnterior} />
          </div>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoBarrasDobles datos={kpis.serieMensual} />
      </div>
      <p className="mt-1.5 text-[10px] text-tinta/40">Verde: ingresos · Naranjo: gastos</p>
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
