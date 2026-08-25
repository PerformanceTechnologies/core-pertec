import { listarBodegas, listarStockDeBodega, obtenerKpisBodega } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import type { FilaStockBodega } from "@/lib/panel-odoo/datos";
import { GraficoBarrasRanking } from "./graficos";
import ListaBodegasClickeable from "./ListaBodegasClickeable";
import TarjetaBase from "./TarjetaBase";

/**
 * Bodega: el inventario de Odoo, por bodega.
 *
 * Es el único módulo cuyo registro no es un documento con una fecha sino un lugar,
 * así que la tarjeta no muestra "los últimos cinco" sino TODAS las bodegas: son
 * pocas y estables, y una que no aparezca sería un dato que falta, no un dato
 * viejo. Por lo mismo el gráfico es un ranking y no una serie de meses: la
 * pregunta es cuál bodega concentra el inventario.
 */
const TOPE_PRODUCTOS = 50;

export default async function TarjetaBodega({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, bodegas] = await Promise.all([obtenerKpisBodega(companyId), listarBodegas(companyId)]);

  // El detalle de todas de una vez: son pocas bodegas, y así abrir una no espera
  // ninguna consulta. Las consultas van en paralelo, no una tras otra.
  const detalles = await Promise.all(bodegas.map((b) => listarStockDeBodega(b.odoo_id, TOPE_PRODUCTOS)));
  const stockPorBodega: Record<number, FilaStockBodega[]> = {};
  bodegas.forEach((b, i) => {
    stockPorBodega[b.odoo_id] = detalles[i];
  });

  const unidades = kpis.unidadesTotal.toLocaleString("es-CL", { maximumFractionDigits: 0 });

  return (
    <TarjetaBase
      titulo="Bodega"
      acento="grisSuave"
      icono="building"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat etiqueta="Valorizado" valor={money(kpis.valorTotal)} color="text-naranjo" />
            <Stat etiqueta="Unidades" valor={unidades} />
            <Stat etiqueta="Productos por bodega" valor={String(kpis.productosDistintos)} />
            <Stat
              etiqueta="Transferencias"
              valor={String(kpis.transferenciasPendientes)}
              color={kpis.transferenciasAtrasadas > 0 ? "text-red-600" : "text-tinta"}
            />
          </div>

          {kpis.transferenciasAtrasadas > 0 && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
              {kpis.transferenciasAtrasadas} transferencia
              {kpis.transferenciasAtrasadas === 1 ? "" : "s"} con la fecha programada vencida
            </p>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Valorizado por bodega
          </p>
          <div className="mt-2">
            <GraficoBarrasRanking
              datos={kpis.porBodega}
              dataKey="valor"
              nameKey="nombre"
              formato="dinero"
              mostrarDetalle
              expandido
            />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            {bodegas.length} bodega{bodegas.length === 1 ? "" : "s"} · tocá una para ver qué hay adentro
          </p>
          <ListaBodegasClickeable bodegas={bodegas} stockPorBodega={stockPorBodega} tope={TOPE_PRODUCTOS} />

          <p className="mt-3 text-[10px] text-pretty text-tinta/40">
            Valorizado a costo estándar del producto, como lo informa Odoo. &quot;Productos por bodega&quot;
            suma los de cada una, así que un producto presente en dos cuenta dos veces.
          </p>
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Valorizado" className="truncate text-[10px] uppercase text-tinta/45">
            Valorizado
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {money(kpis.valorTotal)}
          </p>
        </div>
        <div className="min-w-0">
          <p title="Transferencias pendientes" className="truncate text-[10px] uppercase text-tinta/45">
            Transferencias
          </p>
          <p
            className={`mt-0.5 truncate font-condensed text-sm font-bold ${
              kpis.transferenciasAtrasadas > 0 ? "text-red-600" : "text-tinta"
            }`}
          >
            {kpis.transferenciasPendientes}
            {kpis.transferenciasAtrasadas > 0 && (
              <span className="ml-1 text-[10px] font-semibold">({kpis.transferenciasAtrasadas} vencidas)</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoBarrasRanking datos={kpis.porBodega} dataKey="valor" nameKey="nombre" formato="dinero" />
      </div>

      <ListaBodegasClickeable bodegas={bodegas} stockPorBodega={stockPorBodega} tope={TOPE_PRODUCTOS} />
    </TarjetaBase>
  );
}

function Stat({ etiqueta, valor, color = "text-tinta" }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-crema/60 px-3 py-2">
      <p className="truncate text-[10px] uppercase text-tinta/45">{etiqueta}</p>
      <p className={`mt-0.5 truncate font-condensed text-base font-bold ${color}`}>{valor}</p>
    </div>
  );
}
