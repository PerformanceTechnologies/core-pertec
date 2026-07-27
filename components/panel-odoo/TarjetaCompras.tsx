import { obtenerKpisCompras, listarComprasRecientes } from "@/lib/panel-odoo/datos";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaComprasClickeable from "./ListaComprasClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

const LIMITE_EXPANDIDO = 20;

export default async function TarjetaCompras({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisCompras(companyId),
    listarComprasRecientes(companyId, LIMITE_EXPANDIDO),
  ]);

  // De las últimas 20 (no de todo el histórico) -- misma salvedad que en
  // Facturas: una señal rápida, no un conteo exhaustivo.
  const hoy = new Date().toISOString().slice(0, 10);
  const atrasadas = recientes.filter(
    (c) => c.estado === "purchase" && c.fecha_entrega_esperada && c.fecha_entrega_esperada < hoy
  );

  return (
    <TarjetaBase
      titulo="Compras"
      acento="teal"
      icono="clipboard-check"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Stat etiqueta="Comprado (mes)" valor={money(kpis.compradoMes)} color="text-naranjo" />
            <Stat etiqueta="Por facturar" valor={String(kpis.pendientesFacturar)} color="text-tinta" />
          </div>

          {atrasadas.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs">
              <p className="font-semibold text-red-700">
                {atrasadas.length} orden{atrasadas.length === 1 ? "" : "es"} con entrega esperada vencida (de las
                últimas {LIMITE_EXPANDIDO})
              </p>
              <div className="mt-2 divide-y divide-red-100">
                {atrasadas.map((c) => (
                  <div key={c.odoo_id} className="flex items-center justify-between py-1.5 text-red-700/90">
                    <span className="min-w-0 truncate">{c.partner_nombre ?? c.numero ?? `#${c.odoo_id}`}</span>
                    <span className="ml-3 shrink-0">{fechaCl(c.fecha_entrega_esperada!)}</span>
                    <span className="ml-3 shrink-0 font-semibold">{money(c.monto_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Compras (6 meses)</p>
          <div className="mt-2">
            <GraficoAreaSimple datos={kpis.serieMensual} expandido />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Últimas {recientes.length} órdenes
          </p>
          <ListaComprasClickeable compras={recientes} />
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Comprado (mes)" className="truncate text-[10px] uppercase text-tinta/45">Comprado (mes)</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <p className="min-w-0 truncate font-condensed text-sm font-bold text-naranjo">{money(kpis.compradoMes)}</p>
            <IndicadorVariacion actual={kpis.compradoMes} anterior={kpis.compradoMesAnterior} esGasto />
          </div>
        </div>
        <div className="min-w-0">
          <p title="Por facturar" className="truncate text-[10px] uppercase text-tinta/45">Por facturar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.pendientesFacturar}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensual} />
      </div>

      <ListaComprasClickeable compras={recientes.slice(0, 5)} />
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
