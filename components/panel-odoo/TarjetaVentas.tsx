import { obtenerKpisVentas, listarVentasRecientes } from "@/lib/panel-odoo/datos";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaVentasClickeable from "./ListaVentasClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

const LIMITE_EXPANDIDO = 20;

export default async function TarjetaVentas({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisVentas(companyId),
    listarVentasRecientes(companyId, LIMITE_EXPANDIDO),
  ]);

  return (
    <TarjetaBase
      titulo="Ventas y Arriendo"
      acento="naranjo"
      icono="package"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-3 gap-3">
            <Stat etiqueta="Ventas (mes)" valor={money(kpis.ventasMes)} color="text-tinta" />
            <Stat etiqueta="Arriendos activos" valor={String(kpis.arriendosActivos)} color="text-teal" />
            <Stat etiqueta="Monto en arriendo" valor={money(kpis.montoArriendosActivos)} color="text-naranjo" />
          </div>

          {kpis.arriendosPorVencer.length > 0 && (
            <div className="mt-3 rounded-lg border border-naranjo/25 bg-naranjo/[0.06] px-3 py-2.5 text-xs">
              <p className="font-semibold text-naranjo">
                {kpis.arriendosPorVencer.length} arriendo{kpis.arriendosPorVencer.length === 1 ? "" : "s"} vence
                {kpis.arriendosPorVencer.length === 1 ? "" : "n"} en los próximos 15 días
              </p>
              <div className="mt-2 divide-y divide-naranjo/15">
                {kpis.arriendosPorVencer.map((a) => (
                  <div key={a.odoo_id} className="flex items-center justify-between py-1.5">
                    <span className="min-w-0 truncate text-tinta/70">{a.partner_nombre ?? a.numero ?? `#${a.odoo_id}`}</span>
                    <span className="ml-3 shrink-0 text-naranjo">{fechaCl(a.fecha_fin_arriendo)}</span>
                    <span className="ml-3 shrink-0 font-semibold text-tinta">{money(a.monto_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Ventas (6 meses)</p>
          <div className="mt-2">
            <GraficoAreaSimple datos={kpis.serieMensualVentas} expandido />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Últimas {recientes.length} órdenes
          </p>
          <ListaVentasClickeable ventas={recientes} />
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Ventas (mes)" className="truncate text-[10px] uppercase text-tinta/45">Ventas (mes)</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <p className="min-w-0 truncate font-condensed text-sm font-bold text-tinta">{money(kpis.ventasMes)}</p>
            <IndicadorVariacion actual={kpis.ventasMes} anterior={kpis.ventasMesAnterior} />
          </div>
        </div>
        <div className="min-w-0">
          <p title="Arriendos activos" className="truncate text-[10px] uppercase text-tinta/45">Arriendos activos</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{kpis.arriendosActivos}</p>
        </div>
        <div className="min-w-0">
          <p title="Monto en arriendo" className="truncate text-[10px] uppercase text-tinta/45">Monto en arriendo</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {money(kpis.montoArriendosActivos)}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensualVentas} />
      </div>

      <ListaVentasClickeable ventas={recientes.slice(0, 5)} />
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
