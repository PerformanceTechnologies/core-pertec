"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/cotizador/formato";
import type { FilaProyecto, FilaTarea } from "@/lib/panel-odoo/datos";
import {
  CRITERIOS_INICIALES,
  ESTADO_FILTROS,
  GRUPOS_DE_ESTADO,
  avisos as avisosDeTareas,
  cerrada,
  diasDesde,
  esSubtarea,
  estancada,
  filtrarTareas,
  hoyEnChileIso,
  ordenarTareas,
  pasadaDeHoras,
  resumirProyectos,
  resumirTareas,
  sobreGastado,
  vencida,
  type CampoOrden,
  type Criterios,
} from "@/lib/panel-odoo/proyectos-filtro";
import {
  avancePorProyecto,
  etiquetaDeSalud,
  gastoPorCategoria,
  horasPorProyecto,
  horizonteDePlazos,
  masEstancadas,
  porEtapa,
  porProyecto,
  porResponsable,
  presupuestoPorProyecto,
  saludDeProyectos,
} from "@/lib/panel-odoo/proyectos-series";
import { traducir, ESTADOS_TAREA } from "@/lib/panel-odoo/traducciones";
import ModalDetalleTarea from "./ModalDetalleTarea";
import {
  GraficoAvance,
  GraficoGastoPorCategoria,
  GraficoHoras,
  GraficoHorizonteDePlazos,
  GraficoPorEtapa,
  GraficoPorProyecto,
  GraficoPorResponsable,
  GraficoPresupuesto,
  GraficoSalud,
} from "./graficos-proyectos";

const POR_TANDA = 40;

const COLUMNAS: { campo: CampoOrden; etiqueta: string; alinear?: "derecha" }[] = [
  { campo: "nombre", etiqueta: "Tarea" },
  { campo: "proyecto", etiqueta: "Proyecto" },
  { campo: "etapa", etiqueta: "Etapa" },
  { campo: "asignados", etiqueta: "Responsable" },
  { campo: "fecha_limite", etiqueta: "Plazo" },
  { campo: "horas", etiqueta: "Horas", alinear: "derecha" },
  { campo: "gastos_total", etiqueta: "Gasto", alinear: "derecha" },
];

/** dd-mm-aaaa sin pasar por Date: un "2026-03-01" en UTC se corre un día en Chile. */
function fecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

function horasDe(v: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(v);
}

const CLASES_SALUD: Record<string, string> = {
  off_track: "bg-red-600/15 text-red-600",
  at_risk: "bg-naranjo/15 text-naranjo",
  on_hold: "bg-naranjo-suave/15 text-naranjo",
  on_track: "bg-teal/10 text-teal",
  done: "bg-teal/10 text-teal",
};

export default function DetalleProyectos({
  proyectos,
  tareas,
}: {
  proyectos: FilaProyecto[];
  tareas: FilaTarea[];
}) {
  const [criterios, setCriterios] = useState<Criterios>(CRITERIOS_INICIALES);
  const [mostrados, setMostrados] = useState(POR_TANDA);
  const [seleccionada, setSeleccionada] = useState<FilaTarea | null>(null);
  const [verGraficos, setVerGraficos] = useState(true);

  const hoy = useMemo(() => hoyEnChileIso(), []);

  const visibles = useMemo(
    () => ordenarTareas(filtrarTareas(tareas, criterios, hoy), criterios.orden, criterios.sentido),
    [tareas, criterios, hoy],
  );
  const resumen = useMemo(() => resumirTareas(visibles, hoy), [visibles, hoy]);

  // Los proyectos se recortan a los que quedaron representados en lo filtrado: si alguien
  // filtra por un responsable, los gráficos de plata y de avance tienen que hablar de SUS
  // proyectos, no de todos.
  const proyectosVisibles = useMemo(() => {
    if (!hayFiltroDeTareas(criterios)) return proyectos;
    const nombres = new Set(visibles.map((t) => t.proyecto_nombre));
    return proyectos.filter((p) => nombres.has(p.nombre));
  }, [proyectos, visibles, criterios]);

  const resumenProyectos = useMemo(() => resumirProyectos(proyectosVisibles), [proyectosVisibles]);

  // Los gráficos se calculan sobre lo FILTRADO: la tabla y los gráficos contestan la
  // misma pregunta.
  const series = useMemo(
    () => ({
      etapas: porEtapa(visibles),
      responsables: porResponsable(visibles),
      proyectos: porProyecto(visibles),
      plazos: horizonteDePlazos(visibles, hoy),
      salud: saludDeProyectos(proyectosVisibles),
      categorias: gastoPorCategoria(proyectosVisibles),
      presupuesto: presupuestoPorProyecto(proyectosVisibles),
      horas: horasPorProyecto(visibles),
      avance: avancePorProyecto(proyectosVisibles),
      estancadas: masEstancadas(visibles, hoy),
    }),
    [visibles, proyectosVisibles, hoy],
  );

  // Los avisos van sobre TODO y no sobre lo filtrado: son la tarea pendiente completa, y
  // esconderlos al filtrar los volvería inútiles.
  const avisos = useMemo(() => avisosDeTareas(tareas, hoy), [tareas, hoy]);

  const nombresDeProyecto = useMemo(
    () => [...new Set(tareas.map((t) => t.proyecto_nombre ?? ""))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es")),
    [tareas],
  );
  const responsables = useMemo(
    () =>
      [
        ...new Set(
          tareas.flatMap((t) =>
            (t.asignados ?? "")
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "es")),
    [tareas],
  );
  const etiquetas = useMemo(
    () =>
      [
        ...new Set(
          tareas.flatMap((t) =>
            (t.etiquetas ?? "")
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "es")),
    [tareas],
  );

  function cambiar(parcial: Partial<Criterios>) {
    setCriterios((previos) => ({ ...previos, ...parcial }));
    setMostrados(POR_TANDA);
  }

  const alternarEstado = (f: string) => cambiar({ estado: criterios.estado === f ? "" : f });
  const alternarProyecto = (p: string) => cambiar({ proyecto: criterios.proyecto === p ? "" : p });
  const alternarResponsable = (r: string) => cambiar({ responsable: criterios.responsable === r ? "" : r });
  const alternarEtapa = (e: string) => cambiar({ etapa: criterios.etapa === e ? "" : e });

  function ordenarPor(campo: CampoOrden) {
    cambiar(
      criterios.orden === campo
        ? { sentido: criterios.sentido === "asc" ? "desc" : "asc" }
        : { orden: campo, sentido: campo === "fecha_limite" || campo === "nombre" ? "asc" : "desc" },
    );
  }

  const hayFiltro = hayFiltroDeTareas(criterios);

  return (
    <div>
      {/* Lo que pide una acción hoy, contado y clickeable. */}
      {avisos.length > 0 && (
        <div className="mb-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-tinta/70">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">Requiere atención</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {avisos.map((a) => (
              <button
                key={a.filtro}
                type="button"
                onClick={() => alternarEstado(a.filtro)}
                className="text-left underline decoration-dotted underline-offset-2 transition hover:text-naranjo"
              >
                <strong className="font-semibold text-tinta">{a.cantidad}</strong> {a.texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buscador y filtros */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          type="search"
          value={criterios.texto}
          onChange={(e) => cambiar({ texto: e.target.value })}
          placeholder="Buscar por tarea, proyecto, responsable, etiqueta…"
          aria-label="Buscar tareas"
          className="col-span-2 rounded-lg border border-borde px-3 py-2 text-xs text-tinta placeholder:text-tinta/40 focus:border-teal focus:outline-none"
        />
        <select
          value={criterios.estado}
          onChange={(e) => cambiar({ estado: e.target.value })}
          aria-label="Estado"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todas las tareas</option>
          {GRUPOS_DE_ESTADO.map((grupo) => (
            <optgroup key={grupo} label={grupo}>
              {ESTADO_FILTROS.filter((e) => e.grupo === grupo).map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.etiqueta}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={criterios.proyecto}
          onChange={(e) => cambiar({ proyecto: e.target.value })}
          aria-label="Proyecto"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los proyectos</option>
          {nombresDeProyecto.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={criterios.responsable}
          onChange={(e) => cambiar({ responsable: e.target.value })}
          aria-label="Responsable"
          className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
        >
          <option value="">Todos los responsables</option>
          {responsables.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {etiquetas.length > 0 && (
          <select
            value={criterios.etiqueta}
            onChange={(e) => cambiar({ etiqueta: e.target.value })}
            aria-label="Etiqueta"
            className="rounded-lg border border-borde px-2 py-2 text-xs text-tinta focus:border-teal focus:outline-none"
          >
            <option value="">Todas las etiquetas</option>
            {etiquetas.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          Vence desde
          <input
            type="date"
            value={criterios.desde}
            onChange={(e) => cambiar({ desde: e.target.value })}
            aria-label="Vence desde"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-tinta/55">
          hasta
          <input
            type="date"
            value={criterios.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            aria-label="Vence hasta"
            className="min-w-0 flex-1 rounded-lg border border-borde px-2 py-1.5 text-xs text-tinta focus:border-teal focus:outline-none"
          />
        </label>
      </div>

      {/* Lo que está filtrado, y cómo sacarlo */}
      {hayFiltro && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-tinta/40">Filtrando por</span>
          {criterios.texto && <Chip texto={`"${criterios.texto}"`} onQuitar={() => cambiar({ texto: "" })} />}
          {criterios.estado && (
            <Chip
              texto={ESTADO_FILTROS.find((e) => e.valor === criterios.estado)?.etiqueta ?? criterios.estado}
              onQuitar={() => cambiar({ estado: "" })}
            />
          )}
          {criterios.proyecto && <Chip texto={criterios.proyecto} onQuitar={() => cambiar({ proyecto: "" })} />}
          {criterios.responsable && <Chip texto={criterios.responsable} onQuitar={() => cambiar({ responsable: "" })} />}
          {criterios.etapa && <Chip texto={criterios.etapa} onQuitar={() => cambiar({ etapa: "" })} />}
          {criterios.etiqueta && <Chip texto={criterios.etiqueta} onQuitar={() => cambiar({ etiqueta: "" })} />}
          {(criterios.desde || criterios.hasta) && (
            <Chip
              texto={`${criterios.desde ? fecha(criterios.desde) : "…"} a ${criterios.hasta ? fecha(criterios.hasta) : "…"}`}
              onQuitar={() => cambiar({ desde: "", hasta: "" })}
            />
          )}
          <button
            type="button"
            onClick={() => cambiar(CRITERIOS_INICIALES)}
            className="rounded-full border border-borde px-2 py-0.5 text-[11px] font-semibold text-tinta/50 transition hover:bg-crema hover:text-tinta"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Resumen de lo que quedó a la vista */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-crema/60 px-3 py-2 text-[11px] text-tinta/60">
        <span>
          <strong className="text-tinta">{resumen.cantidad}</strong> tarea{resumen.cantidad === 1 ? "" : "s"}
        </span>
        <span>
          Abiertas <strong className="text-naranjo">{resumen.abiertas}</strong>
        </span>
        <span>
          Completadas <strong className="text-teal">{resumen.completadas}</strong>
        </span>
        {resumen.vencidas > 0 && (
          <span>
            Vencidas <strong className="text-red-600">{resumen.vencidas}</strong>
          </span>
        )}
        {resumen.estancadas > 0 && (
          <span>
            Estancadas <strong className="text-naranjo">{resumen.estancadas}</strong>
          </span>
        )}
        {(resumen.horasAsignadas > 0 || resumen.horasGastadas > 0) && (
          <span>
            Horas{" "}
            <strong className={resumen.horasGastadas > resumen.horasAsignadas ? "text-naranjo" : "text-tinta"}>
              {horasDe(resumen.horasGastadas)}
            </strong>
            <span className="text-tinta/40"> de {horasDe(resumen.horasAsignadas)} plan.</span>
          </span>
        )}
        {resumen.gasto > 0 && (
          <span>
            Gasto de tareas <strong className="text-tinta">{money(resumen.gasto)}</strong>
          </span>
        )}
      </div>

      {/* La plata de los proyectos que quedaron a la vista */}
      {(resumenProyectos.presupuesto > 0 || resumenProyectos.gastado > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-borde px-3 py-2 text-[11px] text-tinta/60">
          <span className="text-[10px] uppercase tracking-wide text-tinta/40">
            {resumenProyectos.activos} proyecto{resumenProyectos.activos === 1 ? "" : "s"}
          </span>
          <span>
            Presupuesto <strong className="text-tinta">{money(resumenProyectos.presupuesto)}</strong>
          </span>
          <span>
            Gastado <strong className="text-naranjo">{money(resumenProyectos.gastado)}</strong>
          </span>
          <span>
            Disponible{" "}
            <strong className={resumenProyectos.disponible < 0 ? "text-red-600" : "text-teal"}>
              {money(resumenProyectos.disponible)}
            </strong>
          </span>
          <span>
            Objetivos{" "}
            <strong className="text-tinta">
              {resumenProyectos.objetivosHechos}/{resumenProyectos.objetivosTotal}
            </strong>
          </span>
          {resumenProyectos.enRiesgo > 0 && (
            <span>
              En riesgo <strong className="text-red-600">{resumenProyectos.enRiesgo}</strong>
            </span>
          )}
          {resumenProyectos.sobreGastados > 0 && (
            <span>
              Sobre presupuesto <strong className="text-red-600">{resumenProyectos.sobreGastados}</strong>
            </span>
          )}
        </div>
      )}

      {/* Gráficos */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
          Gráficos <span className="font-normal normal-case text-tinta/35">— hacé clic para filtrar</span>
        </p>
        <button
          type="button"
          onClick={() => setVerGraficos((v) => !v)}
          aria-expanded={verGraficos}
          className="rounded-lg border border-borde px-2 py-1 text-[11px] font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta"
        >
          {verGraficos ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {verGraficos && (
        <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Panel titulo="Cuán cerca está cada plazo">
            <GraficoHorizonteDePlazos tramos={series.plazos} onElegir={alternarEstado} />
          </Panel>
          <Panel titulo="Cómo va cada proyecto, según Odoo">
            <GraficoSalud puntos={series.salud} />
          </Panel>
          <Panel titulo="En qué etapa está el trabajo">
            <GraficoPorEtapa grupos={series.etapas} onElegir={alternarEtapa} />
          </Panel>
          <Panel titulo="Cuánto tiene encima cada persona">
            <GraficoPorResponsable grupos={series.responsables} onElegir={alternarResponsable} />
          </Panel>
          {series.avance.length > 0 && (
            <Panel titulo="Avance de objetivos">
              <GraficoAvance puntos={series.avance} onElegir={alternarProyecto} />
            </Panel>
          )}
          {series.presupuesto.length > 0 && (
            <Panel titulo="Presupuesto contra gasto">
              <GraficoPresupuesto puntos={series.presupuesto} onElegir={alternarProyecto} />
            </Panel>
          )}
          {series.horas.length > 0 && (
            <Panel titulo="Horas planificadas contra trabajadas">
              <GraficoHoras puntos={series.horas} onElegir={alternarProyecto} />
            </Panel>
          )}
          {series.categorias.length > 0 && (
            <Panel titulo="En qué se va la plata">
              <GraficoGastoPorCategoria grupos={series.categorias} />
            </Panel>
          )}
          <Panel titulo="Cuánto trabajo tiene cada proyecto" ancho={series.estancadas.length === 0}>
            <GraficoPorProyecto grupos={series.proyectos} onElegir={alternarProyecto} />
          </Panel>
          {series.estancadas.length > 0 && (
            <Panel titulo="Lo que lleva más tiempo sin moverse">
              <ul className="mt-1 divide-y divide-borde text-xs">
                {series.estancadas.map((e) => (
                  <li key={`${e.proyecto}-${e.tarea}`} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate text-tinta" title={e.tarea}>
                        {e.tarea}
                      </span>
                      <span className="block truncate text-[10px] text-tinta/45" title={e.proyecto}>
                        {e.proyecto}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-naranjo">{e.dias} d</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {/* Las fichas de los proyectos que quedaron a la vista */}
      {proyectosVisibles.length > 0 && (
        <>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-tinta/45">Proyectos</p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {proyectosVisibles.map((p) => (
              <FichaProyecto
                key={p.odoo_id}
                proyecto={p}
                hoy={hoy}
                activo={criterios.proyecto === p.nombre}
                onElegir={() => alternarProyecto(p.nombre)}
              />
            ))}
          </div>
        </>
      )}

      {/* Tabla */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead>
            <tr className="border-b border-borde text-[10px] uppercase tracking-wide text-tinta/45">
              {COLUMNAS.map((c) => {
                const activa = criterios.orden === c.campo;
                return (
                  <th
                    key={c.campo}
                    scope="col"
                    className={`py-2 font-semibold ${c.alinear === "derecha" ? "text-right" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(c.campo)}
                      aria-label={`Ordenar por ${c.etiqueta}`}
                      className={`transition hover:text-tinta ${activa ? "text-teal" : ""}`}
                    >
                      {c.etiqueta}
                      {activa && <span aria-hidden> {criterios.sentido === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="py-2 pl-3 font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.slice(0, mostrados).map((t) => {
              const estaCerrada = cerrada(t);
              const estaVencida = vencida(t, hoy);
              const quieta = estancada(t, hoy);
              const diasQuieta = diasDesde(t.fecha_ultimo_cambio_etapa, hoy);
              return (
                <tr
                  key={t.odoo_id}
                  onClick={() => setSeleccionada(t)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSeleccionada(t);
                    }
                  }}
                  className={`cursor-pointer transition hover:bg-crema/60 ${estaCerrada ? "opacity-50" : ""}`}
                >
                  <td className="max-w-[260px] py-2 text-tinta" title={t.nombre}>
                    <span className="flex items-center gap-1.5">
                      {t.color_hex && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color_hex }} />
                      )}
                      {/* Una subtarea se marca con una sangría: sin esto sus horas y su
                          gasto se leen como trabajo aparte, cuando ya están sumados en la
                          tarea madre. */}
                      {esSubtarea(t) && <span className="shrink-0 text-tinta/30" aria-label="Subtarea">↳</span>}
                      <span className={`truncate ${estaCerrada ? "line-through" : ""}`}>{t.nombre}</span>
                      {t.prioridad === "1" && (
                        <span className="shrink-0 text-[9px] text-naranjo" title="Prioritaria">
                          ★
                        </span>
                      )}
                      {t.subtareas > 0 && (
                        <span className="shrink-0 text-[9px] text-tinta/35" title={`${t.subtareas} subtarea(s)`}>
                          +{t.subtareas}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="max-w-[160px] truncate py-2 text-tinta/70" title={t.proyecto_nombre ?? undefined}>
                    {t.proyecto_nombre ?? "—"}
                  </td>
                  <td className="py-2 text-tinta/70">{t.etapa ?? "—"}</td>
                  <td className="max-w-[140px] truncate py-2 text-tinta/70" title={t.asignados ?? undefined}>
                    {t.asignados ?? <span className="text-naranjo/70">sin asignar</span>}
                  </td>
                  <td className={`py-2 ${estaVencida ? "font-semibold text-red-600" : "text-tinta/70"}`}>
                    {t.fecha_limite ? fecha(t.fecha_limite) : "—"}
                  </td>
                  <td className="py-2 text-right text-tinta/70">
                    {t.horas_asignadas > 0 || t.horas_gastadas > 0 ? (
                      <span className={pasadaDeHoras(t) ? "font-semibold text-naranjo" : undefined}>
                        {horasDe(t.horas_gastadas)}
                        <span className="text-tinta/35">/{horasDe(t.horas_asignadas)}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-right text-tinta/70">
                    {t.gastos_total > 0 ? (
                      <span title={`${t.gastos_cantidad} gasto(s) en Odoo`}>{money(t.gastos_total)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pl-3">
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="text-tinta/60">
                        {t.completado ? "Objetivo cumplido" : traducir(ESTADOS_TAREA, t.estado)}
                      </span>
                      {quieta && (
                        <span
                          className="rounded-full bg-naranjo/15 px-1.5 py-0.5 text-[10px] font-semibold text-naranjo"
                          title={`Sin cambiar de etapa hace ${diasQuieta} días`}
                        >
                          {diasQuieta} d quieta
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="py-6 text-center text-xs text-tinta/40">Ninguna tarea cumple estos filtros.</p>
        )}
      </div>

      {mostrados < visibles.length && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setMostrados((m) => m + POR_TANDA)}
            className="rounded-lg border border-borde px-3 py-1.5 text-xs font-semibold text-tinta/60 transition hover:bg-crema hover:text-tinta"
          >
            Ver {Math.min(POR_TANDA, visibles.length - mostrados)} más ({visibles.length - mostrados} restantes)
          </button>
        </div>
      )}

      {seleccionada && <ModalDetalleTarea tarea={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </div>
  );
}

function hayFiltroDeTareas(c: Criterios): boolean {
  return (
    c.texto !== "" ||
    c.estado !== "" ||
    c.proyecto !== "" ||
    c.responsable !== "" ||
    c.etapa !== "" ||
    c.etiqueta !== "" ||
    c.desde !== "" ||
    c.hasta !== ""
  );
}

/**
 * La ficha de un proyecto: su estado, su avance y su plata de un vistazo.
 *
 * Es clickeable y filtra la tabla por ese proyecto, igual que un punto de un gráfico:
 * son la misma clase de gesto y no había razón para que la ficha fuera la única parte
 * inerte de la pantalla.
 */
function FichaProyecto({
  proyecto: p,
  hoy,
  activo,
  onElegir,
}: {
  proyecto: FilaProyecto;
  hoy: string;
  activo: boolean;
  onElegir: () => void;
}) {
  const avance = p.objetivos_total > 0 ? Math.round((p.objetivos_hechos / p.objetivos_total) * 100) : null;
  const atrasado = Boolean(p.fecha_vencimiento) && p.fecha_vencimiento!.slice(0, 10) < hoy;

  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activo}
      className={`rounded-xl border p-3 text-left transition hover:bg-crema/40 ${
        activo ? "border-teal bg-teal/5" : "border-borde"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 font-condensed text-sm font-bold uppercase text-tinta">
          {/* El color que el proyecto tiene asignado en el panel de Odoo: es como la
              gente lo reconoce allá, y acá era invisible. */}
          {p.color_hex && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color_hex }} />}
          <span className="truncate" title={p.nombre}>
            {p.nombre}
          </span>
        </p>
        {p.estado_salud && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              CLASES_SALUD[p.estado_salud] ?? "bg-gris/15 text-gris"
            }`}
            title={p.fecha_estado_salud ? `Actualizado el ${fecha(p.fecha_estado_salud)}` : undefined}
          >
            {etiquetaDeSalud(p.estado_salud)}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-tinta/50">
        {p.partner_nombre && <span className="truncate">{p.partner_nombre}</span>}
        {p.responsable && <span className="truncate">{p.responsable}</span>}
        {p.etapa && <span className="truncate">{p.etapa}</span>}
        {p.fecha_vencimiento && (
          <span className={atrasado ? "text-red-600" : undefined}>
            {atrasado ? "venció" : "vence"} {fecha(p.fecha_vencimiento)}
          </span>
        )}
      </div>

      {avance !== null && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between text-[10px] text-tinta/55">
            <span>
              Objetivos {p.objetivos_hechos}/{p.objetivos_total}
            </span>
            <span className="font-semibold text-tinta">{avance}%</span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-tinta/10">
            <div className="h-full rounded-full bg-teal" style={{ width: `${avance}%` }} />
          </div>
        </div>
      )}

      {p.presupuesto > 0 && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between text-[10px] text-tinta/55">
            <span>
              {money(p.gastado)} de {money(p.presupuesto)}
            </span>
            <span className={sobreGastado(p) ? "font-semibold text-red-600" : "font-semibold text-tinta"}>
              {Math.round(p.porcentaje_gastado)}%
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-tinta/10">
            {/* Por encima del 100% la barra se llena y el porcentaje de arriba dice
                cuánto: una barra que se sale del riel no se puede leer. */}
            <div
              className={`h-full rounded-full ${sobreGastado(p) ? "bg-red-600" : "bg-naranjo"}`}
              style={{ width: `${Math.min(100, Math.round(p.porcentaje_gastado))}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}

/** Un filtro activo, con su × para sacarlo. */
function Chip({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
      {texto}
      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar filtro ${texto}`}
        className="text-teal/70 hover:text-teal"
      >
        ✕
      </button>
    </span>
  );
}

function Panel({ titulo, ancho, children }: { titulo: string; ancho?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-borde bg-crema/40 p-3 ${ancho ? "xl:col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold text-tinta/55">{titulo}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
