import { obtenerKpisGastos, listarGastosRecientes } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoAreaSimple } from "./graficos";
import ListaGastosClickeable from "./ListaGastosClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";

const LIMITE_EXPANDIDO = 20;

export default async function TarjetaGastos({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisGastos(companyId),
    listarGastosRecientes(companyId, LIMITE_EXPANDIDO),
  ]);

  // Desglose por empleado de las últimas N (no de todo el histórico) --
  // reutiliza la misma lista ya obtenida, sin otra consulta a Supabase.
  const porEmpleadoMapa = new Map<string, number>();
  for (const g of recientes) {
    const empleado = g.empleado ?? "Sin asignar";
    porEmpleadoMapa.set(empleado, (porEmpleadoMapa.get(empleado) ?? 0) + g.monto_total);
  }
  const porEmpleado = Array.from(porEmpleadoMapa.entries())
    .map(([empleado, monto]) => ({ empleado, monto }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 6);

  return (
    <TarjetaBase
      titulo="Gastos"
      acento="tealSuave"
      icono="cash"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Stat etiqueta="Gastado (mes)" valor={money(kpis.totalMes)} color="text-naranjo" />
            <Stat etiqueta="Por aprobar" valor={String(kpis.pendientesAprobacion)} color="text-tinta" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">Tendencia (6 meses)</p>
          <div className="mt-2">
            <GraficoAreaSimple datos={kpis.serieMensual} expandido />
          </div>

          {porEmpleado.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
                Por empleado (últimos {recientes.length})
              </p>
              <div className="mt-2 divide-y divide-borde">
                {porEmpleado.map((fila) => (
                  <div key={fila.empleado} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="min-w-0 truncate text-tinta/70">{fila.empleado}</span>
                    <span className="ml-3 shrink-0 font-semibold text-tinta">{money(fila.monto)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Últimos {recientes.length} gastos
          </p>
          <ListaGastosClickeable gastos={recientes} />
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Gastado (mes)" className="truncate text-[10px] uppercase text-tinta/45">Gastado (mes)</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <p className="min-w-0 truncate font-condensed text-sm font-bold text-naranjo">{money(kpis.totalMes)}</p>
            <IndicadorVariacion actual={kpis.totalMes} anterior={kpis.totalMesAnterior} esGasto />
          </div>
        </div>
        <div className="min-w-0">
          <p title="Por aprobar" className="truncate text-[10px] uppercase text-tinta/45">Por aprobar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.pendientesAprobacion}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <GraficoAreaSimple datos={kpis.serieMensual} />
      </div>

      <ListaGastosClickeable gastos={recientes.slice(0, 5)} />
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
