import { listarProyectosConTareas } from "@/lib/panel-odoo/datos";
import { money } from "@/lib/cotizador/formato";
import type { EjecucionOdoo } from "@/lib/panel-odoo/sync-ejecuciones";
import {
  abierta,
  avisos as avisosDeTareas,
  hoyEnChileIso,
  ordenarTareas,
  resumirProyectos,
  resumirTareas,
} from "@/lib/panel-odoo/proyectos-filtro";
import { GraficoDona } from "./graficos";
import ListaTareasClickeable from "./ListaTareasClickeable";
import DetalleProyectos from "./DetalleProyectos";
import TarjetaBase from "./TarjetaBase";

// Cuántas tareas se listan en la tarjeta chica (el detalle expandido las muestra todas,
// con filtros y gráficos).
const EN_LA_TARJETA = 6;

// Sin prop companyId a propósito: project.project/project.task no usan multi-empresa en
// este Odoo (ver lib/panel-odoo/datos.ts), así que esta tarjeta se ve igual sin importar
// la empresa seleccionada en el panel.
export default async function TarjetaProyectos({ ejecucion }: { ejecucion?: EjecucionOdoo | null }) {
  // Todo en una sola consulta: el detalle filtra en el cliente, y sin las cerradas no hay
  // avance que mostrar.
  const { proyectos, tareas } = await listarProyectosConTareas();
  const hoy = hoyEnChileIso();

  const resumen = resumirTareas(tareas, hoy);
  const resumenProyectos = resumirProyectos(proyectos);
  const avisos = avisosDeTareas(tareas, hoy);

  const proximas = ordenarTareas(tareas.filter(abierta), "fecha_limite", "asc").slice(0, EN_LA_TARJETA);

  const avance =
    resumenProyectos.objetivosTotal > 0
      ? Math.round((resumenProyectos.objetivosHechos / resumenProyectos.objetivosTotal) * 100)
      : null;

  // La dona de la tarjeta chica muestra la plata si hay presupuesto cargado en Odoo, y si
  // no, en qué anda el trabajo. Un anillo de "0 de 0" no dice nada.
  const categorias = proyectos.flatMap((p) => p.gastos_por_categoria ?? []);
  const hayPlata = resumenProyectos.presupuesto > 0 || categorias.length > 0;

  const gastoPorCategoria = Array.from(
    categorias
      .reduce((mapa, c) => mapa.set(c.label, (mapa.get(c.label) ?? 0) + c.amount), new Map<string, number>())
      .entries(),
  )
    .map(([categoria, monto]) => ({ categoria, monto }))
    .sort((a, b) => b.monto - a.monto);

  const porEtapa = Array.from(
    tareas
      .filter(abierta)
      .reduce((mapa, t) => mapa.set(t.etapa ?? "Sin etapa", (mapa.get(t.etapa ?? "Sin etapa") ?? 0) + 1), new Map<string, number>())
      .entries(),
  )
    .map(([etapa, cantidad]) => ({ etapa, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  return (
    <TarjetaBase
      titulo="Proyectos"
      acento="grisSuave"
      icono="clipboard-list"
      ejecucion={ejecucion}
      anchoExpandido="ancho"
      contenidoExpandido={<DetalleProyectos proyectos={proyectos} tareas={tareas} />}
    >
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p title="Proyectos activos" className="truncate text-[10px] uppercase text-tinta/45">
            Proyectos
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">
            {resumenProyectos.activos}
            {resumenProyectos.enRiesgo > 0 && (
              <span className="ml-1 text-[10px] font-normal text-red-600">
                ({resumenProyectos.enRiesgo} en riesgo)
              </span>
            )}
          </p>
        </div>
        <div className="min-w-0">
          {/* El avance de objetivos y no el conteo de tareas: es el número con el que se
              mide si el proyecto está llegando. */}
          <p title="Objetivos cumplidos sobre el total" className="truncate text-[10px] uppercase text-tinta/45">
            Objetivos
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-teal">
            {resumenProyectos.objetivosHechos}/{resumenProyectos.objetivosTotal}
            {avance !== null && <span className="ml-1 text-[10px] font-normal text-teal/70">({avance}%)</span>}
          </p>
        </div>
        <div className="min-w-0">
          <p title="Tareas abiertas" className="truncate text-[10px] uppercase text-tinta/45">
            Abiertas
          </p>
          <p className="mt-0.5 truncate font-condensed text-sm font-bold text-tinta">{resumen.abiertas}</p>
        </div>
        <div className="min-w-0">
          {/* Vencidas en la tarjeta chica: es lo único de esta pantalla sobre lo que hay
              que hacer algo hoy. */}
          <p title="Abiertas con el plazo cumplido" className="truncate text-[10px] uppercase text-tinta/45">
            Vencidas
          </p>
          <p
            className={`mt-0.5 truncate font-condensed text-sm font-bold ${
              resumen.vencidas > 0 ? "text-red-600" : "text-tinta"
            }`}
          >
            {resumen.vencidas}
            {resumen.estancadas > 0 && (
              <span className="ml-1 text-[10px] font-normal text-naranjo">(+{resumen.estancadas} quietas)</span>
            )}
          </p>
        </div>
      </div>

      {(resumenProyectos.presupuesto > 0 || resumenProyectos.gastado > 0) && (
        <p className="mt-2 truncate text-[10px] text-tinta/45">
          Presupuesto <span className="font-semibold text-tinta">{money(resumenProyectos.presupuesto)}</span> · gastado{" "}
          <span className="font-semibold text-naranjo">{money(resumenProyectos.gastado)}</span> · queda{" "}
          <span className={`font-semibold ${resumenProyectos.disponible < 0 ? "text-red-600" : "text-teal"}`}>
            {money(resumenProyectos.disponible)}
          </span>
        </p>
      )}

      <div className="mt-2.5">
        <p className="mb-1 truncate text-[9px] uppercase text-tinta/40">
          {hayPlata ? "En qué se va la plata" : "Trabajo abierto por etapa"}
        </p>
        {hayPlata && gastoPorCategoria.length > 0 ? (
          <GraficoDona datos={gastoPorCategoria} dataKey="monto" nameKey="categoria" formato="dinero" />
        ) : (
          <GraficoDona datos={porEtapa} dataKey="cantidad" nameKey="etapa" />
        )}
      </div>

      {avisos.length > 0 && (
        <p className="mt-2 text-[10px] text-tinta/45">
          {avisos
            .slice(0, 3)
            .map((a) => `${a.cantidad} ${a.texto}`)
            .join(" · ")}
        </p>
      )}

      <ListaTareasClickeable tareas={proximas} />
    </TarjetaBase>
  );
}
