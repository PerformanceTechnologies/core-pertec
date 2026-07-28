import { obtenerKpisFlota, listarVehiculosRecientes } from "@/lib/panel-odoo/datos";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoDona, GraficoBarrasRanking } from "./graficos";
import ListaVehiculosClickeable from "./ListaVehiculosClickeable";
import TarjetaBase from "./TarjetaBase";
import { traducir, ESTADOS_FLOTA, CATEGORIAS_FLOTA } from "@/lib/panel-odoo/traducciones";

const LIMITE_EXPANDIDO = 30;

export default async function TarjetaFlota({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisFlota(companyId),
    listarVehiculosRecientes(companyId, LIMITE_EXPANDIDO),
  ]);

  return (
    <TarjetaBase
      titulo="Flota"
      acento="gris"
      icono="truck"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat etiqueta="Vehículos" valor={String(kpis.totalVehiculos)} />
            <Stat etiqueta="Activos" valor={String(kpis.vehiculosActivos)} color="text-teal" />
            <Stat etiqueta="Doc. vigentes" valor={String(kpis.documentacion.vigentes)} color="text-teal" />
            <Stat etiqueta="Doc. vencidas" valor={String(kpis.documentacion.vencidas)} color="text-naranjo" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta/45">Vehículos activos</p>
              <GraficoBarrasRanking datos={kpis.porEstado} mostrarDetalle expandido />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta/45">
                Documentación vigente / vencida
              </p>
              <GraficoDona datos={kpis.documentacion.porEstado} mostrarDetalle mostrarLeyenda expandido />
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Vehículos ({recientes.length})
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-borde">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-crema/60 text-tinta/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Vehículo</th>
                  <th className="px-3 py-2 font-medium">Patente</th>
                  <th className="px-3 py-2 font-medium">Marca / modelo</th>
                  <th className="px-3 py-2 font-medium">Conductor</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 text-right font-medium">Odómetro</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {recientes.map((v) => (
                  <tr key={v.odoo_id}>
                    <td className="max-w-[160px] truncate px-3 py-2 text-tinta" title={v.nombre}>
                      {v.nombre}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{v.patente ?? "-"}</td>
                    {/* "modelo" ya viene de Odoo como "Marca/Modelo" -- concatenar marca de nuevo lo duplicaba. */}
                    <td className="px-3 py-2 text-tinta/70">{v.modelo ?? "-"}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-tinta/70" title={v.conductor ?? undefined}>
                      {v.conductor ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{traducir(CATEGORIAS_FLOTA, v.categoria)}</td>
                    <td className="px-3 py-2 text-right text-tinta/70">
                      {v.odometro != null ? `${Math.round(v.odometro).toLocaleString("es-CL")} km` : "-"}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{traducir(ESTADOS_FLOTA, v.estado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Vehículos</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.totalVehiculos}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Activos</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{kpis.vehiculosActivos}</p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Vehículos activos</p>
          <GraficoBarrasRanking datos={kpis.porEstado} mostrarDetalle />
        </div>
        <div>
          <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Documentación</p>
          <GraficoDona datos={kpis.documentacion.porEstado} mostrarDetalle mostrarLeyenda />
        </div>
      </div>

      <ListaVehiculosClickeable vehiculos={recientes.slice(0, 5)} />
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
