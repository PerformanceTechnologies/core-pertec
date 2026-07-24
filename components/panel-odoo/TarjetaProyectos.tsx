import { obtenerKpisProyectos, listarTareasRecientes } from "@/lib/panel-odoo/datos";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import ListaTareasClickeable from "./ListaTareasClickeable";
import TarjetaBase from "./TarjetaBase";

// Sin prop companyId a proposito: project.project/project.task no usan
// multi-empresa en este Odoo (ver lib/panel-odoo/datos.ts), asi que esta
// tarjeta se ve igual sin importar la empresa seleccionada en el panel.
export default async function TarjetaProyectos({ ejecucion }: { ejecucion?: EjecucionOdoo | null }) {
  const [kpis, recientes] = await Promise.all([obtenerKpisProyectos(), listarTareasRecientes(6)]);

  return (
    <TarjetaBase titulo="Proyectos" acento="grisSuave" icono="clipboard-list" ejecucion={ejecucion}>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Proyectos activos</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.proyectosActivos}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Tareas abiertas</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">{kpis.tareasAbiertas}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase text-tinta/45">Completadas</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{kpis.tareasCompletadas}</p>
        </div>
      </div>

      <p className="mt-2.5 text-[10px] uppercase text-tinta/45">Tareas abiertas más próximas</p>
      <ListaTareasClickeable tareas={recientes} />
    </TarjetaBase>
  );
}
