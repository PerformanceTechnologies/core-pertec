import { obtenerKpisGastos, listarGastosRecientes, listarFondosRecientes } from "@/lib/panel-odoo/datos";
import { money, fechaCl } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoDona, GraficoBarraApilada } from "./graficos";
import ListaGastosClickeable from "./ListaGastosClickeable";
import TarjetaBase from "./TarjetaBase";
import IndicadorVariacion from "./IndicadorVariacion";
import { traducir, ESTADOS_GASTO, CATEGORIAS_GASTO, ESTADOS_FONDO } from "@/lib/panel-odoo/traducciones";

const LIMITE_EXPANDIDO = 20;

export default async function TarjetaGastos({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes, fondos] = await Promise.all([
    obtenerKpisGastos(companyId),
    listarGastosRecientes(companyId, LIMITE_EXPANDIDO),
    listarFondosRecientes(companyId),
  ]);
  const porEmpleadoTop = kpis.porEmpleado.slice(0, 6);

  return (
    <TarjetaBase
      titulo="Gastos"
      acento="tealSuave"
      icono="cash"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat etiqueta="Gastado (mes)" valor={money(kpis.totalMes)} color="text-naranjo" />
            <Stat etiqueta="Por aprobar" valor={String(kpis.pendientesAprobacion)} color="text-tinta" />
            <Stat etiqueta="Fondos: saldo" valor={money(kpis.fondosSaldoDisponible)} color="text-teal" />
            <Stat etiqueta="Fondos entregados (mes)" valor={money(kpis.fondosEntregadosMes)} color="text-tinta" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Fondos asignados por estado
          </p>
          <div className="mt-2">
            <GraficoBarraApilada datos={kpis.fondosPorEstado} dataKey="monto" nameKey="estado" formato="dinero" expandido />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta/45">
                Por categoría (mes)
              </p>
              <GraficoDona
                datos={kpis.porCategoria}
                dataKey="monto"
                nameKey="categoria"
                formato="dinero"
                mostrarDetalle
                mostrarLeyenda
                expandido
              />
            </div>
            {porEmpleadoTop.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta/45">
                  Por empleado (mes)
                </p>
                <div className="divide-y divide-borde">
                  {porEmpleadoTop.map((fila) => (
                    <div key={fila.empleado} className="flex items-center justify-between py-1.5 text-xs">
                      <span className="min-w-0 truncate text-tinta/70">{fila.empleado}</span>
                      <span className="ml-3 shrink-0 font-semibold text-tinta">{money(fila.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Fondos por rendir ({fondos.length})
          </p>
          {fondos.length === 0 ? (
            <p className="mt-2 text-xs text-tinta/40">Sin fondos entregados todavía.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-lg border border-borde">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-crema/60 text-tinta/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Referencia</th>
                    <th className="px-3 py-2 font-medium">Empleado</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 text-right font-medium">Entregado</th>
                    <th className="px-3 py-2 text-right font-medium">Rendido</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {fondos.map((f) => (
                    <tr key={f.odoo_id}>
                      <td className="px-3 py-2 text-tinta" title={f.descripcion ?? undefined}>
                        {f.referencia}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-tinta/70" title={f.empleado ?? undefined}>
                        {f.empleado ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-tinta/70">{f.fecha ? fechaCl(f.fecha) : "-"}</td>
                      <td className="px-3 py-2 text-right text-tinta/70">{money(f.monto_entregado)}</td>
                      <td className="px-3 py-2 text-right text-tinta/70">{money(f.monto_rendido)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-tinta">{money(f.saldo)}</td>
                      <td className="px-3 py-2 text-tinta/70">{traducir(ESTADOS_FONDO, f.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Últimos {recientes.length} gastos
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-borde">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-crema/60 text-tinta/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Empleado</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {recientes.map((g) => (
                  <tr key={g.odoo_id}>
                    <td
                      className="max-w-[220px] truncate px-3 py-2 text-tinta"
                      title={g.descripcion ?? undefined}
                    >
                      {g.descripcion ?? `Gasto #${g.odoo_id}`}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{traducir(CATEGORIAS_GASTO, g.categoria)}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-tinta/70" title={g.empleado ?? undefined}>
                      {g.empleado ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{g.fecha ? fechaCl(g.fecha) : "-"}</td>
                    <td className="px-3 py-2 text-tinta/70">{traducir(ESTADOS_GASTO, g.estado)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-tinta">{money(g.monto_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <p title="Por aprobar" className="truncate text-[10px] uppercase text-tinta/45">Por aprobar</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.pendientesAprobacion}</p>
        </div>
        <div className="min-w-0">
          <p title="Fondos: saldo" className="truncate text-[10px] uppercase text-tinta/45">Fondos: saldo</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">
            {money(kpis.fondosSaldoDisponible)}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Fondos asignados por estado</p>
        <GraficoBarraApilada datos={kpis.fondosPorEstado} dataKey="monto" nameKey="estado" formato="dinero" />
      </div>

      <div className="mt-2.5">
        <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Por categoría (mes)</p>
        <GraficoDona datos={kpis.porCategoria} dataKey="monto" nameKey="categoria" formato="dinero" mostrarDetalle />
      </div>

      <ListaGastosClickeable gastos={recientes.slice(0, 5)} />
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
