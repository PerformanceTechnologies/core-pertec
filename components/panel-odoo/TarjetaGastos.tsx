import { obtenerKpisGastos, listarGastos, listarFondos } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { hoyEnChileIso, resumirGastos } from "@/lib/panel-odoo/gastos-filtro";
import { resumirFondos } from "@/lib/panel-odoo/gastos-series";
import { GraficoDona } from "./graficos";
import ListaGastosClickeable from "./ListaGastosClickeable";
import DetalleGastos from "./DetalleGastos";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

// Cuántos gastos se listan en la tarjeta chica (el detalle expandido los muestra todos,
// con filtros).
const EN_LA_TARJETA = 5;

export default async function TarjetaGastos({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, todos, fondos] = await Promise.all([
    obtenerKpisGastos(companyId),
    // El detalle filtra y ordena en el cliente sobre el histórico completo, no sobre el
    // mes: sin los viejos no se ve lo que quedó sin rendir.
    listarGastos(companyId),
    listarFondos(companyId),
  ]);

  const hoy = hoyEnChileIso();
  const resumen = resumirGastos(todos, hoy);
  const plataAfuera = resumirFondos(fondos);

  return (
    <TarjetaBase
      titulo="Gastos"
      anchoExpandido="ancho"
      acento="tealSuave"
      icono="cash"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat etiqueta="Gastado (mes)" valor={money(kpis.totalMes)} color="text-naranjo" />
            <Stat etiqueta="Sin rendir" valor={money(resumen.montoSinRendir)} color="text-naranjo" />
            <Stat etiqueta="Por reembolsar" valor={money(resumen.montoPorReembolsar)} color="text-teal" />
            <Stat etiqueta="Fondos sin cerrar" valor={money(plataAfuera.saldo)} color="text-tinta" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Gastos ({todos.length})
          </p>
          <div className="mt-2">
            <DetalleGastos gastos={todos} fondos={fondos} />
          </div>
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p title="Gastado (mes)" className="truncate text-[10px] uppercase text-tinta/45">Gastado (mes)</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <p className="min-w-0 truncate font-condensed text-sm font-bold text-naranjo">{money(kpis.totalMes)}</p>
            <IndicadorVariacion actual={kpis.totalMes} anterior={kpis.totalMesAnterior} esGasto />
          </div>
        </div>
        <div className="min-w-0">
          {/* Lo que sigue en borrador, que es la plata que nadie tramitó todavía. */}
          <p title="Sin rendir" className="truncate text-[10px] uppercase text-tinta/45">Sin rendir</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {money(resumen.montoSinRendir)}
          </p>
        </div>
        <div className="min-w-0">
          <p title="Por reembolsar" className="truncate text-[10px] uppercase text-tinta/45">Por reembolsar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">
            {money(resumen.montoPorReembolsar)}
          </p>
        </div>
      </div>

      {resumen.sinRespaldo > 0 && (
        <p className="mt-2 text-[10px] text-red-600">
          {resumen.sinRespaldo} sin respaldo adjunto
          {resumen.olvidados > 0 && ` · ${resumen.olvidados} en borrador hace +30 días`}
        </p>
      )}

      <div className="mt-2.5">
        <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Por categoría (mes)</p>
        <GraficoDona datos={kpis.porCategoria} dataKey="monto" nameKey="categoria" formato="dinero" mostrarDetalle />
      </div>

      <ListaGastosClickeable gastos={todos.slice(0, EN_LA_TARJETA)} />
    </TarjetaBase>
  );
}

function Stat({ etiqueta, valor, color }: { etiqueta: string; valor: string; color: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-crema/60 px-3 py-2">
      <p title={etiqueta} className="truncate text-[10px] uppercase text-tinta/45">{etiqueta}</p>
      <p className={`mt-0.5 truncate font-condensed text-base font-bold ${color}`}>{valor}</p>
    </div>
  );
}
