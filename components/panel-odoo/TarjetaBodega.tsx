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
  // El gráfico dibuja lo que tenga datos: sin costos cargados en Odoo, un ranking de
  // valores es siete barras en cero, y las unidades sí distinguen una bodega de otra.
  const ranking = kpis.hayValorizacion
    ? { titulo: "Valorizado por bodega", datos: kpis.porBodegaValor, formato: "dinero" as const }
    : { titulo: "Unidades por bodega", datos: kpis.porBodegaUnidades, formato: "cantidad" as const };

  return (
    <TarjetaBase
      titulo="Bodega"
      acento="grisSuave"
      icono="building"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat etiqueta="Unidades" valor={unidades} color="text-naranjo" />
            <Stat etiqueta="Productos por bodega" valor={String(kpis.productosDistintos)} />
            <Stat
              etiqueta="Transferencias"
              valor={String(kpis.transferenciasPendientes)}
              color={kpis.transferenciasAtrasadas > 0 ? "text-red-600" : "text-tinta"}
            />
            <Stat
              etiqueta="Valorizado"
              valor={kpis.hayValorizacion ? money(kpis.valorTotal) : "Sin costos"}
              color={kpis.hayValorizacion ? "text-teal" : "text-tinta/40"}
            />
          </div>

          {!kpis.hayValorizacion && (
            <p className="mt-3 rounded-lg border border-borde bg-crema/60 px-3 py-2 text-[11px] text-pretty text-tinta/55">
              Los productos con stock no tienen costo estándar cargado en Odoo, así que no hay nada que
              valorizar. En cuanto se carguen, el valor aparece acá sin tocar nada.
            </p>
          )}

          {kpis.transferenciasAtrasadas > 0 && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
              {kpis.transferenciasAtrasadas} transferencia
              {kpis.transferenciasAtrasadas === 1 ? "" : "s"} con la fecha programada vencida
            </p>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">{ranking.titulo}</p>
          <div className="mt-2">
            <GraficoBarrasRanking
              datos={ranking.datos}
              dataKey="valor"
              nameKey="nombre"
              formato={ranking.formato}
              mostrarDetalle
              expandido
            />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            {bodegas.length} bodega{bodegas.length === 1 ? "" : "s"} · tocá una para ver qué hay adentro
          </p>
          <ListaBodegasClickeable bodegas={bodegas} stockPorBodega={stockPorBodega} tope={TOPE_PRODUCTOS} />

          <p className="mt-3 text-[10px] text-pretty text-tinta/40">
            &quot;Productos por bodega&quot; suma los de cada una, así que un producto presente en dos cuenta
            dos veces. El valorizado, cuando hay, es a costo estándar del producto: no es el saldo contable de
            la cuenta de existencias.
          </p>
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          {/* El titular es el dato que existe. Con costos cargados manda la plata;
              sin ellos, un "$0" grande se lee como una tarjeta que no cargó. */}
          <p
            title={kpis.hayValorizacion ? "Valorizado" : "Unidades en bodega"}
            className="truncate text-[10px] uppercase text-tinta/45"
          >
            {kpis.hayValorizacion ? "Valorizado" : "Unidades"}
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {kpis.hayValorizacion ? money(kpis.valorTotal) : unidades}
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
              <span className="ml-1 text-[10px] font-semibold">
                ({kpis.transferenciasAtrasadas} vencidas)
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoBarrasRanking
          datos={ranking.datos}
          dataKey="valor"
          nameKey="nombre"
          formato={ranking.formato}
        />
      </div>

      <ListaBodegasClickeable bodegas={bodegas} stockPorBodega={stockPorBodega} tope={TOPE_PRODUCTOS} />
    </TarjetaBase>
  );
}

function Stat({
  etiqueta,
  valor,
  color = "text-tinta",
}: {
  etiqueta: string;
  valor: string;
  color?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-crema/60 px-3 py-2">
      <p className="truncate text-[10px] uppercase text-tinta/45">{etiqueta}</p>
      <p className={`mt-0.5 truncate font-condensed text-base font-bold ${color}`}>{valor}</p>
    </div>
  );
}
