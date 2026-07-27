import { obtenerKpisProyectos, listarTareasRecientes } from "@/lib/panel-odoo/datos";
import { fechaCl } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import ListaTareasClickeable from "./ListaTareasClickeable";
import TarjetaBase from "./TarjetaBase";

const LIMITE_EXPANDIDO = 30;

// Sin prop companyId a proposito: project.project/project.task no usan
// multi-empresa en este Odoo (ver lib/panel-odoo/datos.ts), asi que esta
// tarjeta se ve igual sin importar la empresa seleccionada en el panel.
export default async function TarjetaProyectos({ ejecucion }: { ejecucion?: EjecucionOdoo | null }) {
  const [kpis, recientes] = await Promise.all([
    obtenerKpisProyectos(),
    listarTareasRecientes(LIMITE_EXPANDIDO),
  ]);

  const porProyectoMapa = new Map<string, typeof recientes>();
  for (const t of recientes) {
    const proyecto = t.proyecto_nombre ?? "Sin proyecto";
    porProyectoMapa.set(proyecto, [...(porProyectoMapa.get(proyecto) ?? []), t]);
  }
  const porProyecto = Array.from(porProyectoMapa.entries());

  return (
    <TarjetaBase
      titulo="Proyectos"
      acento="grisSuave"
      icono="clipboard-list"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-3 gap-3">
            <Stat etiqueta="Proyectos activos" valor={String(kpis.proyectosActivos)} color="text-tinta" />
            <Stat etiqueta="Tareas abiertas" valor={String(kpis.tareasAbiertas)} color="text-naranjo" />
            <Stat etiqueta="Completadas" valor={String(kpis.tareasCompletadas)} color="text-teal" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Tareas abiertas por proyecto ({recientes.length})
          </p>
          <div className="mt-2 space-y-4">
            {porProyecto.map(([proyecto, tareas]) => (
              <div key={proyecto}>
                <p className="truncate text-xs font-semibold text-tinta/70" title={proyecto}>
                  {proyecto}
                </p>
                <div className="mt-1 overflow-x-auto rounded-lg border border-borde">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="bg-crema/60 text-tinta/50">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Tarea</th>
                        <th className="px-3 py-1.5 font-medium">Etapa</th>
                        <th className="px-3 py-1.5 font-medium">Asignados</th>
                        <th className="px-3 py-1.5 font-medium">Fecha límite</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde">
                      {tareas.map((t) => (
                        <tr key={t.odoo_id}>
                          <td className="max-w-[220px] truncate px-3 py-1.5 text-tinta" title={t.nombre}>
                            {t.nombre}
                          </td>
                          <td className="px-3 py-1.5 text-tinta/70">{t.etapa ?? "-"}</td>
                          <td className="max-w-[140px] truncate px-3 py-1.5 text-tinta/70" title={t.asignados ?? undefined}>
                            {t.asignados ?? "-"}
                          </td>
                          <td className="px-3 py-1.5 text-tinta/70">
                            {t.fecha_limite ? fechaCl(t.fecha_limite) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p title="Proyectos activos" className="truncate text-[10px] uppercase text-tinta/45">Proyectos activos</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{kpis.proyectosActivos}</p>
        </div>
        <div className="min-w-0">
          <p title="Tareas abiertas" className="truncate text-[10px] uppercase text-tinta/45">Tareas abiertas</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">{kpis.tareasAbiertas}</p>
        </div>
        <div className="min-w-0">
          <p title="Completadas" className="truncate text-[10px] uppercase text-tinta/45">Completadas</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">{kpis.tareasCompletadas}</p>
        </div>
      </div>

      <p className="mt-2.5 text-[10px] uppercase text-tinta/45">Tareas abiertas más próximas</p>
      <ListaTareasClickeable tareas={recientes.slice(0, 6)} />
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
