import {
  obtenerKpisProyectos,
  listarTareasRecientes,
  listarTareasDeProyectos,
  estaCerrada,
  type FilaProyecto,
  type FilaTarea,
} from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import { GraficoDona, GraficoBarrasRanking, GraficoBarraApilada } from "./graficos";
import ListaTareasClickeable from "./ListaTareasClickeable";
import TarjetaBase from "./TarjetaBase";

// Sin prop companyId a proposito: project.project/project.task no usan
// multi-empresa en este Odoo (ver lib/panel-odoo/datos.ts), asi que esta
// tarjeta se ve igual sin importar la empresa seleccionada en el panel.
export default async function TarjetaProyectos({ ejecucion }: { ejecucion?: EjecucionOdoo | null }) {
  const [kpis, recientes, todasLasTareas] = await Promise.all([
    obtenerKpisProyectos(),
    listarTareasRecientes(6),
    listarTareasDeProyectos(),
  ]);

  const tareasPorProyecto = new Map<number, FilaTarea[]>();
  for (const t of todasLasTareas) {
    if (t.proyecto_odoo_id === null) continue;
    tareasPorProyecto.set(t.proyecto_odoo_id, [...(tareasPorProyecto.get(t.proyecto_odoo_id) ?? []), t]);
  }

  const avanceObjetivos =
    kpis.objetivosTotal > 0 ? Math.round((kpis.objetivosHechos / kpis.objetivosTotal) * 100) : 0;

  // El presupuesto se muestra solo si alguien lo cargo en Odoo. Un proyecto sin
  // presupuesto_inicial daria una barra de "0 gastado de 0", que no dice nada y
  // ademas se lee como si no hubiera gasto.
  const hayPresupuesto = kpis.presupuestoTotal > 0;

  return (
    <TarjetaBase
      titulo="Proyectos"
      acento="grisSuave"
      icono="clipboard-list"
      ejecucion={ejecucion}
      contenidoExpandido={
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat etiqueta="Proyectos activos" valor={String(kpis.proyectosActivos)} color="text-tinta" />
            <Stat
              etiqueta="Objetivos cumplidos"
              valor={`${kpis.objetivosHechos}/${kpis.objetivosTotal}`}
              color="text-teal"
              pie={`${avanceObjetivos}% del total`}
            />
            <Stat etiqueta="Tareas abiertas" valor={String(kpis.tareasAbiertas)} color="text-naranjo" />
            <Stat
              etiqueta="Vencidas"
              valor={String(kpis.tareasVencidas)}
              color={kpis.tareasVencidas > 0 ? "text-naranjo" : "text-tinta/40"}
              pie={kpis.tareasVencidas > 0 ? "con plazo cumplido" : "ninguna atrasada"}
            />
          </div>

          {hayPresupuesto && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
                Presupuesto de los proyectos activos
              </p>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
                <GraficoBarraApilada
                  datos={[
                    { estado: "Gastado", monto: kpis.gastadoTotal },
                    // Un sobregiro dejaria "disponible" negativo, y una barra
                    // apilada no puede dibujar un segmento negativo: se muestra
                    // en 0 y el numero real queda en la fila de al lado.
                    { estado: "Disponible", monto: Math.max(0, kpis.disponibleTotal) },
                  ]}
                  expandido
                />
                <div className="divide-y divide-borde">
                  <FilaMonto etiqueta="Presupuesto inicial" monto={kpis.presupuestoTotal} />
                  <FilaMonto etiqueta="Gastado" monto={kpis.gastadoTotal} color="text-naranjo" />
                  <FilaMonto
                    etiqueta="Disponible"
                    monto={kpis.disponibleTotal}
                    color={kpis.disponibleTotal < 0 ? "text-naranjo" : "text-teal"}
                  />
                </div>
              </div>
            </>
          )}

          {kpis.porCategoria.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
                Gasto por categoría
              </p>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
                <GraficoDona
                  datos={kpis.porCategoria}
                  dataKey="monto"
                  nameKey="categoria"
                  formato="dinero"
                  mostrarDetalle
                  expandido
                />
                <div className="divide-y divide-borde">
                  {kpis.porCategoria.map((c) => (
                    <FilaMonto key={c.categoria} etiqueta={c.categoria} monto={c.monto} punto={c.color} />
                  ))}
                </div>
              </div>
            </>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Carga de trabajo abierta
          </p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] uppercase text-tinta/40">Por responsable</p>
              <GraficoBarrasRanking
                datos={kpis.porResponsable}
                dataKey="cantidad"
                nameKey="responsable"
                mostrarDetalle
                expandido
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase text-tinta/40">Por etapa</p>
              <GraficoBarrasRanking
                datos={kpis.porEtapa}
                dataKey="cantidad"
                nameKey="etapa"
                mostrarDetalle
                expandido
              />
            </div>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-tinta/45">
            Detalle por proyecto ({kpis.proyectos.length})
          </p>
          <div className="mt-2 space-y-5">
            {kpis.proyectos.map((p) => (
              <BloqueProyecto key={p.odoo_id} proyecto={p} tareas={tareasPorProyecto.get(p.odoo_id) ?? []} />
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
          <p title="Objetivos cumplidos" className="truncate text-[10px] uppercase text-tinta/45">Objetivos</p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">
            {kpis.objetivosHechos}/{kpis.objetivosTotal}
          </p>
        </div>
        <div className="min-w-0">
          <p title="Tareas abiertas (vencidas)" className="truncate text-[10px] uppercase text-tinta/45">
            Abiertas
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-naranjo">
            {kpis.tareasAbiertas}
            {kpis.tareasVencidas > 0 && (
              <span className="ml-1 text-[10px] font-normal text-naranjo/70">({kpis.tareasVencidas} vencidas)</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">
            {hayPresupuesto ? "Gasto por categoría" : "Tareas por etapa"}
          </p>
          {hayPresupuesto && kpis.porCategoria.length > 0 ? (
            <GraficoDona datos={kpis.porCategoria} dataKey="monto" nameKey="categoria" formato="dinero" mostrarDetalle />
          ) : (
            <GraficoDona datos={kpis.porEtapa} dataKey="cantidad" nameKey="etapa" mostrarDetalle />
          )}
        </div>
        <div>
          <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">Por responsable</p>
          <GraficoBarrasRanking datos={kpis.porResponsable} dataKey="cantidad" nameKey="responsable" mostrarDetalle />
        </div>
      </div>

      <p className="mt-2.5 text-[10px] uppercase text-tinta/45">Tareas abiertas más próximas</p>
      <ListaTareasClickeable tareas={recientes} />
    </TarjetaBase>
  );
}

/**
 * Un proyecto con su avance, su plata y sus tareas.
 *
 * Antes el detalle agrupaba las tareas por NOMBRE de proyecto y no mostraba
 * nada del proyecto en si: ni el cliente, ni el responsable, ni el plazo, ni el
 * presupuesto, aunque los cuatro ya estaban en la cache.
 */
function BloqueProyecto({ proyecto: p, tareas }: { proyecto: FilaProyecto; tareas: FilaTarea[] }) {
  const avance = p.objetivos_total > 0 ? Math.round((p.objetivos_hechos / p.objetivos_total) * 100) : 0;
  const abiertas = tareas.filter((t) => !estaCerrada(t));
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-borde p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 font-condensed text-sm font-bold uppercase text-tinta">
          {/* El color que el proyecto tiene asignado en el panel de Odoo: es
              como la gente lo reconoce allá, y acá era invisible. */}
          {p.color_hex && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color_hex }} />
          )}
          <span className="truncate" title={p.nombre}>{p.nombre}</span>
        </p>
        <p className="shrink-0 text-[11px] text-tinta/50">
          {abiertas.length} abierta{abiertas.length === 1 ? "" : "s"} de {tareas.length}
        </p>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-tinta/55">
        {p.partner_nombre && <span>Cliente: <span className="text-tinta/80">{p.partner_nombre}</span></span>}
        {p.responsable && <span>Responsable: <span className="text-tinta/80">{p.responsable}</span></span>}
        {p.fecha_vencimiento && (
          <span>
            Vence:{" "}
            <span className={p.fecha_vencimiento < hoy ? "text-naranjo" : "text-tinta/80"}>
              {fecha(p.fecha_vencimiento)}
            </span>
          </span>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Barra
          etiqueta={`Objetivos: ${p.objetivos_hechos} de ${p.objetivos_total}`}
          porcentaje={avance}
          color="var(--color-teal, #00a080)"
        />
        {p.presupuesto > 0 && (
          <Barra
            etiqueta={`Presupuesto: ${money(p.gastado)} de ${money(p.presupuesto)}`}
            // Por encima del 100% la barra se llena y el número al costado dice
            // cuánto: una barra que se sale del riel no se puede leer.
            porcentaje={Math.min(100, Math.round(p.porcentaje_gastado))}
            color={p.porcentaje_gastado > 100 ? "var(--color-naranjo, #c85217)" : "var(--color-naranjo, #c85217)"}
            pie={`${Math.round(p.porcentaje_gastado)}% · quedan ${money(p.disponible)}`}
            alerta={p.disponible < 0}
          />
        )}
      </div>

      {tareas.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-borde">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-crema/60 text-tinta/50">
              <tr>
                <th className="px-3 py-1.5 font-medium">Tarea</th>
                <th className="px-3 py-1.5 font-medium">Etapa</th>
                <th className="px-3 py-1.5 font-medium">Asignados</th>
                <th className="px-3 py-1.5 font-medium">Inicio</th>
                <th className="px-3 py-1.5 font-medium">Plazo</th>
                <th className="px-3 py-1.5 text-right font-medium">Gasto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {tareas.map((t) => {
                const cerrada = estaCerrada(t);
                const vencida = !cerrada && Boolean(t.fecha_limite) && t.fecha_limite!.slice(0, 10) < hoy;
                return (
                  <tr key={t.odoo_id} className={cerrada ? "opacity-45" : undefined}>
                    <td className="max-w-[220px] px-3 py-1.5 text-tinta" title={t.nombre}>
                      <span className="flex items-center gap-1.5">
                        {t.color_hex && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color_hex }} />
                        )}
                        <span className={`truncate ${cerrada ? "line-through" : ""}`}>{t.nombre}</span>
                        {t.prioridad === "1" && (
                          <span className="shrink-0 text-[9px] uppercase text-naranjo" title="Prioritaria">
                            ★
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-tinta/70">{t.etapa ?? "-"}</td>
                    <td className="max-w-[140px] truncate px-3 py-1.5 text-tinta/70" title={t.asignados ?? undefined}>
                      {t.asignados ?? "-"}
                    </td>
                    <td className="px-3 py-1.5 text-tinta/70">{t.fecha_inicio ? fecha(t.fecha_inicio) : "-"}</td>
                    <td className={`px-3 py-1.5 ${vencida ? "font-semibold text-naranjo" : "text-tinta/70"}`}>
                      {t.fecha_limite ? fecha(t.fecha_limite) : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-tinta/70">
                      {t.gastos_total > 0 ? (
                        <span title={`${t.gastos_cantidad} gasto(s) en Odoo`}>{money(t.gastos_total)}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** dd-mm-aaaa sin pasar por Date: un "2026-03-01" en UTC se corre un dia en Chile. */
function fecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

function Barra({
  etiqueta,
  porcentaje,
  color,
  pie,
  alerta,
}: {
  etiqueta: string;
  porcentaje: number;
  color: string;
  pie?: string;
  alerta?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-tinta/60" title={etiqueta}>{etiqueta}</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tinta/10">
        <div className="h-full rounded-full" style={{ width: `${porcentaje}%`, background: color }} />
      </div>
      {pie && <p className={`mt-0.5 text-[10px] ${alerta ? "text-naranjo" : "text-tinta/45"}`}>{pie}</p>}
    </div>
  );
}

function FilaMonto({
  etiqueta,
  monto,
  color = "text-tinta",
  punto,
}: {
  etiqueta: string;
  monto: number;
  color?: string;
  punto?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <span className="flex min-w-0 items-center gap-1.5 truncate text-tinta/70">
        {punto && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: punto }} />}
        {etiqueta}
      </span>
      <span className={`ml-3 shrink-0 font-semibold ${color}`}>{money(monto)}</span>
    </div>
  );
}

function Stat({
  etiqueta,
  valor,
  color,
  pie,
}: {
  etiqueta: string;
  valor: string;
  color: string;
  pie?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-crema/60 px-3 py-2">
      <p className="truncate text-[10px] uppercase text-tinta/45">{etiqueta}</p>
      <p className={`mt-0.5 truncate font-condensed text-base font-bold ${color}`}>{valor}</p>
      {pie && <p className="truncate text-[10px] text-tinta/40">{pie}</p>}
    </div>
  );
}
