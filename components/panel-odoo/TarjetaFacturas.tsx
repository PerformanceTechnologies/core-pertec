import { obtenerKpisFacturas, listarFacturasRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaFacturasClickeable from "./ListaFacturasClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

const LIMITE_EXPANDIDO = 20;

export default async function TarjetaFacturas({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisFacturas(companyId),
    listarFacturasRecientes(companyId, LIMITE_EXPANDIDO),
  ]);

  // De las últimas 20 (no de todo el histórico): una señal rápida, no un
  // conteo exhaustivo -- por eso el detalle expandido lo aclara en el texto.
  const hoy = new Date().toISOString().slice(0, 10);
  const vencidas = recientes.filter(
    (f) => f.move_type === "out_invoice" && f.payment_state !== "paid" && f.fecha_vencimiento && f.fecha_vencimiento < hoy
  );

  return (
    <TarjetaBase
      titulo="Facturas"
      acento="naranjo"
      icono="file-invoice"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-3 gap-3">
            <Stat etiqueta="Facturado (mes)" valor={money(kpis.facturadoVentasMes)} color="text-tinta" />
            <Stat etiqueta="Por cobrar" valor={money(kpis.pendienteCobro)} color="text-teal" />
            <Stat etiqueta="Por pagar" valor={money(kpis.pendientePago)} color="text-naranjo" />
          </div>

          {vencidas.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <span className="font-semibold">{vencidas.length}</span> factura{vencidas.length === 1 ? "" : "s"} de
              venta vencida{vencidas.length === 1 ? "" : "s"} sin pagar (de las últimas {LIMITE_EXPANDIDO}) por{" "}
              <span className="font-semibold">{money(vencidas.reduce((acc, f) => acc + f.monto_pendiente, 0))}</span>.
            </div>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Tendencia (6 meses)</p>
          <div className="mt-2">
            <GraficoAreaSimple datos={kpis.serieMensualVentas} expandido />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Últimas {recientes.length} facturas
          </p>
          <ListaFacturasClickeable facturas={recientes} />
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Facturado (mes)" className="truncate text-[10px] uppercase text-tinta/45">Facturado (mes)</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <p className="min-w-0 truncate font-condensed text-sm font-bold text-tinta">
              {money(kpis.facturadoVentasMes)}
            </p>
            <IndicadorVariacion actual={kpis.facturadoVentasMes} anterior={kpis.facturadoVentasMesAnterior} />
          </div>
        </div>
        <div className="min-w-0">
          <p title="Por cobrar" className="truncate text-[10px] uppercase text-tinta/45">Por cobrar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{money(kpis.pendienteCobro)}</p>
        </div>
        <div className="min-w-0">
          <p title="Por pagar" className="truncate text-[10px] uppercase text-tinta/45">Por pagar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">{money(kpis.pendientePago)}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensualVentas} />
      </div>

      <ListaFacturasClickeable facturas={recientes.slice(0, 5)} />
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
