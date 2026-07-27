import { obtenerKpisFlota, listarVehiculosRecientes } from "@/lib/panel-odoo/datos";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoDona } from "./graficos";
import ListaVehiculosClickeable from "./ListaVehiculosClickeable";
import TarjetaBase from "./TarjetaBase";

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
          <div className="grid grid-cols-2 gap-4 sm:items-center">
            <Stat etiqueta="Vehículos" valor={String(kpis.totalVehiculos)} />
            <GraficoDona datos={kpis.porEstado} expandido />
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
                    <td className="px-3 py-2 text-tinta/70">
                      {[v.marca, v.modelo].filter(Boolean).join(" ") || "-"}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-tinta/70" title={v.conductor ?? undefined}>
                      {v.conductor ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{v.categoria ?? "-"}</td>
                    <td className="px-3 py-2 text-right text-tinta/70">
                      {v.odometro != null ? `${Math.round(v.odometro).toLocaleString("es-CL")} km` : "-"}
                    </td>
                    <td className="px-3 py-2 text-tinta/70">{v.estado ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      }
    >
      <div className="mt-2">
        <p className="text-[10px] uppercase text-tinta/45">Vehículos</p>
        <p className="mt-0.5 font-condensed text-sm font-bold text-tinta">{kpis.totalVehiculos}</p>
      </div>

      <div className="mt-2.5">
        <GraficoDona datos={kpis.porEstado} />
      </div>

      <ListaVehiculosClickeable vehiculos={recientes.slice(0, 5)} />
    </TarjetaBase>
  );
}

function Stat({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-crema/60 px-3 py-2">
      <p className="truncate text-[10px] uppercase text-tinta/45">{etiqueta}</p>
      <p className="mt-0.5 truncate font-condensed text-base font-bold text-tinta">{valor}</p>
    </div>
  );
}
