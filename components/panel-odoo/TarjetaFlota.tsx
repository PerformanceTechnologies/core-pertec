import { obtenerKpisFlota, listarVehiculosRecientes } from "@/lib/panel-odoo/datos";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoDona } from "./graficos";
import ListaVehiculosClickeable from "./ListaVehiculosClickeable";
import TarjetaBase from "./TarjetaBase";

export default async function TarjetaFlota({
  companyId,
  ejecucion,
}: {
  companyId: number;
  ejecucion?: EjecucionOdoo | null;
}) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisFlota(companyId),
    listarVehiculosRecientes(companyId, 5),
  ]);

  return (
    <TarjetaBase titulo="Flota" acento="gris" icono="truck" ejecucion={ejecucion}>
      <div className="mt-2">
        <p className="text-[10px] uppercase text-tinta/45">Vehículos</p>
        <p className="mt-0.5 font-condensed text-sm font-bold text-tinta">{kpis.totalVehiculos}</p>
      </div>

      <div className="mt-2.5">
        <GraficoDona datos={kpis.porEstado} />
      </div>

      <ListaVehiculosClickeable vehiculos={recientes} />
    </TarjetaBase>
  );
}
