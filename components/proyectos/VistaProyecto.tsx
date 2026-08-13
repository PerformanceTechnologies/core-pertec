"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Objetivo, Proyecto } from "@/lib/proyectos";
import { puedeEnPanel, puedeVerGastos, puedeEditarGastos, type RolPanel } from "@/lib/permisos-panel";
import {
  colorDe,
  diasEntre,
  parseFecha,
  ESTADO_PROYECTO_COLOR,
  ESTADO_PROYECTO_LABEL,
} from "@/lib/proyectos-utilidades";
import AnilloProgreso from "./AnilloProgreso";
import Gantt from "./Gantt";
import TableroObjetivos from "./TableroObjetivos";
import FormularioObjetivoModal from "./FormularioObjetivoModal";
import GastosProyecto from "./GastosProyecto";
import GastosHeroMini from "./GastosHeroMini";
import SeccionMantencion from "@/components/mantencion/SeccionMantencion";
import { BOTON_PRIMARIO, TARJETA } from "@/lib/estilos";
import CargaPertec from "@/components/CargaPertec";

export default function VistaProyecto({
  proyectoId,
  rolPanel,
  onVolver,
}: {
  proyectoId: string;
  rolPanel: RolPanel;
  onVolver: () => void;
}) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [objetivos, setObjetivos] = useState<Objetivo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"gantt" | "checklist">("gantt");
  const [editando, setEditando] = useState<Objetivo | "nuevo" | null>(null);
  const [seccion, setSeccion] = useState<"objetivos" | "gastos" | "mantencion">("objetivos");
  const puedeVerGastosProyecto = puedeVerGastos(rolPanel);

  // Si el rol cambia dentro de la misma sesión del navegador (sin recargar)
  // y pierde acceso a Gastos, que no se quede mostrando esa sección.
  useEffect(() => {
    if (!puedeVerGastosProyecto) setSeccion("objetivos");
  }, [puedeVerGastosProyecto]);

  const cargar = useCallback(async () => {
    try {
      const [rp, ro] = await Promise.all([
        fetch(`/api/proyectos/${proyectoId}`, { cache: "no-store" }),
        fetch(`/api/proyectos/${proyectoId}/objetivos`, { cache: "no-store" }),
      ]);
      const cp = await rp.json();
      const co = await ro.json();
      if (!rp.ok) throw new Error(cp.error ?? "Error desconocido");
      if (!ro.ok) throw new Error(co.error ?? "Error desconocido");
      setProyecto(cp.proyecto);
      setObjetivos(co.objetivos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar el proyecto.");
    }
  }, [proyectoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const objetivosTop = useMemo(() => (objetivos ?? []).filter((o) => !o.parent_id), [objetivos]);
  const objetivosPorPadre = useMemo(() => {
    const m: Record<string, Objetivo[]> = {};
    (objetivos ?? []).forEach((o) => {
      if (o.parent_id) {
        if (!m[o.parent_id]) m[o.parent_id] = [];
        m[o.parent_id].push(o);
      }
    });
    Object.keys(m).forEach((k) => m[k].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)));
    return m;
  }, [objetivos]);

  // Resumen de gastos por objetivo (gastado + cantidad de partidas), para el
  // tooltip del Gantt y el mini-gráfico del hero — evita recorrer el array de
  // gastos en cada componente hijo por separado.
  const gastosPorObjetivo = useMemo(() => {
    const mapa: Record<string, { gastado: number; count: number }> = {};
    (proyecto?.gastos ?? []).forEach((g) => {
      if (!g.objetivo_id) return;
      const actual = mapa[g.objetivo_id] ?? { gastado: 0, count: 0 };
      actual.gastado += Number(g.monto) || 0;
      actual.count += 1;
      mapa[g.objetivo_id] = actual;
    });
    return mapa;
  }, [proyecto]);

  const total = objetivosTop.length;
  const hechos = objetivosTop.filter((o) => o.hecho).length;
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
  const vencen = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return (objetivos ?? []).filter((o) => {
      if (o.hecho) return false;
      const fin = parseFecha(o.fecha_fin);
      fin.setHours(0, 0, 0, 0);
      const diff = diasEntre(hoy, fin);
      return diff >= 0 && diff <= 7;
    }).length;
  }, [objetivos]);

  const puedeCrear = puedeEnPanel(rolPanel, "create_objetivo");
  const puedeEditar = puedeEnPanel(rolPanel, "edit_objetivo");
  const puedeAlternar = puedeEnPanel(rolPanel, "toggle_objetivo");
  const puedeEliminar = puedeEnPanel(rolPanel, "delete_objetivo");

  const alternarHecho = async (o: Objetivo) => {
    if (!puedeAlternar) return;
    setObjetivos((prev) => (prev ?? []).map((x) => (x.id === o.id ? { ...x, hecho: !o.hecho } : x)));
    const respuesta = await fetch(`/api/objetivos/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hecho: !o.hecho }),
    });
    if (!respuesta.ok) cargar();
  };

  const eliminarObjetivo = async (o: Objetivo) => {
    if (!puedeEliminar) return;
    if (!window.confirm(`¿Eliminar "${o.titulo}"?`)) return;
    const respuesta = await fetch(`/api/objetivos/${o.id}`, { method: "DELETE" });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) {
      alert("Error: " + (cuerpo.error ?? "desconocido"));
      return;
    }
    cargar();
  };

  const agregarSub = async (padre: Objetivo, titulo: string): Promise<boolean> => {
    if (rolPanel !== "admin") return false;
    const respuesta = await fetch(`/api/objetivos/${padre.id}/sub`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo }),
    });
    if (!respuesta.ok) return false;
    await cargar();
    return true;
  };

  // Mismo caso que el listado: hasta que llegan el proyecto y sus objetivos, la
  // animacion de la marca en vez de la vista con huecos.
  if ((!proyecto || !objetivos) && !error) return <CargaPertec modulo="el proyecto" />;

  if (error && !objetivos) {
    return (
      <div className={`p-8 text-center ${TARJETA}`}>
        <p className="text-sm font-medium text-red-600">{error}</p>
        <button
          onClick={cargar}
          className="mt-4 rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta/70 hover:border-naranjo/40 hover:text-naranjo"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const color = colorDe(proyecto?.color ?? "cobre");

  return (
    // Mismo tope de ancho que el listado y que el resto del core: sin esto el
    // Gantt y las dos tarjetas del hero se estiran a todo el monitor.
    <div className="flex max-w-[1500px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onVolver}
            className="rounded text-sm font-medium text-tinta/60 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            ← Proyectos
          </button>
          {proyecto && (
            <>
              <span className="text-tinta/30">/</span>
              <span className="h-2 w-2 rounded-full" style={{ background: color.bg }} />
              <span className="font-condensed font-bold uppercase text-tinta">{proyecto.nombre}</span>
            </>
          )}
        </div>

        <div className="flex gap-1 rounded-lg border border-borde bg-superficie p-1">
          <button
            onClick={() => setSeccion("objetivos")}
            className={`rounded-md px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-naranjo ${
              seccion === "objetivos" ? "bg-naranjo text-white" : "text-tinta/50 hover:text-tinta"
            }`}
          >
            Objetivos
          </button>
          <button
            onClick={() => setSeccion("mantencion")}
            className={`rounded-md px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-naranjo ${
              seccion === "mantencion" ? "bg-naranjo text-white" : "text-tinta/50 hover:text-tinta"
            }`}
          >
            Mantención
          </button>
          {puedeVerGastosProyecto && (
            <button
              onClick={() => setSeccion("gastos")}
              className={`rounded-md px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-naranjo ${
                seccion === "gastos" ? "bg-naranjo text-white" : "text-tinta/50 hover:text-tinta"
              }`}
            >
              Gastos
            </button>
          )}
        </div>
      </div>

      {seccion === "gastos" && puedeVerGastosProyecto && proyecto ? (
        <GastosProyecto
          proyecto={proyecto}
          objetivos={objetivos ?? []}
          puedeEditar={puedeEditarGastos(rolPanel)}
          onActualizado={cargar}
        />
      ) : seccion === "mantencion" ? (
        <SeccionMantencion rolPanel={rolPanel} />
      ) : (
        <>
          {/* Las dos tarjetas del hero, en una grilla de verdad.

          Antes eran dos bloques de max-w-sm centrados con justify-center, así
          que en un monitor ancho quedaban una a cada extremo con medio metro de
          crema en medio, y con un solo bloque —cuando el rol no ve gastos— la
          tarjeta quedaba flotando sola al centro.

          También se fueron los dos gradientes radiales del fondo: sobre el crema
          se leían como una mancha, no como una iluminación. */}
          <div
            className={`animar-revelar grid grid-cols-1 gap-4 ${
              puedeVerGastosProyecto ? "lg:grid-cols-2" : "max-w-md"
            }`}
          >
            {puedeVerGastosProyecto && proyecto && (
              <GastosHeroMini
                proyecto={proyecto}
                objetivos={objetivosTop}
                onVerDetalle={() => setSeccion("gastos")}
              />
            )}

            {/* La franja superior en teal en vez de la barra vertical con degradado
            naranjo→teal: era el único elemento del core con tres colores en un
            gradiente, y arrancaba justo donde la tarjeta ya tenía la regla
            naranja de la etiqueta. */}
            <div className={`flex flex-col border-t-[3px] border-t-teal px-5 py-4 ${TARJETA}`}>
              <div className="flex items-baseline justify-between gap-3 border-b border-borde pb-3.5">
                <span className="etiqueta-seccion">Progreso global</span>
                <div className="flex items-center gap-2">
                  {proyecto && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em]"
                      style={{
                        background: ESTADO_PROYECTO_COLOR[proyecto.estado].bg,
                        color: ESTADO_PROYECTO_COLOR[proyecto.estado].texto,
                        border: `1px solid ${ESTADO_PROYECTO_COLOR[proyecto.estado].borde}`,
                      }}
                    >
                      {ESTADO_PROYECTO_LABEL[proyecto.estado]}
                    </span>
                  )}
                  <span className="text-xs font-medium tabular-nums text-tinta/50">
                    {hechos}/{total}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center py-6">
                <div className="relative flex items-center justify-center">
                  <AnilloProgreso pct={pct} size={104} stroke={8} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-condensed text-[28px] font-bold leading-none tracking-tight tabular-nums text-tinta">
                      {pct}
                      <span className="text-xs font-normal text-tinta/50">%</span>
                    </span>
                    <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[.18em] text-tinta/50">
                      completado
                    </span>
                  </div>
                </div>
              </div>

              {/* Las cifras en Barlow Condensed y tabulares, como en las cintas del
              resto del core: en la tipografía de texto un 5 y un 0 tenían anchos
              distintos y las tres columnas bailaban al cambiar de proyecto. */}
              <div className="grid grid-cols-3 gap-0 border-t border-borde pt-4">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">
                    Activos
                  </span>
                  <span className="font-condensed text-xl font-bold leading-none tracking-tight tabular-nums text-naranjo">
                    {total - hechos}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 border-x border-borde">
                  <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">
                    Completados
                  </span>
                  <span className="font-condensed text-xl font-bold leading-none tracking-tight tabular-nums text-teal">
                    {hechos}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">
                    Vencen ≤7d
                  </span>
                  <span
                    className={`font-condensed text-xl font-bold leading-none tracking-tight tabular-nums ${
                      vencen > 0 ? "text-naranjo" : "text-tinta"
                    }`}
                  >
                    {vencen}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg border border-borde bg-superficie p-1">
              <button
                onClick={() => setVista("gantt")}
                className={`rounded-md px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-naranjo ${
                  vista === "gantt" ? "bg-naranjo text-white" : "text-tinta/50 hover:text-tinta"
                }`}
              >
                Gantt
              </button>
              <button
                onClick={() => setVista("checklist")}
                className={`rounded-md px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-naranjo ${
                  vista === "checklist" ? "bg-naranjo text-white" : "text-tinta/50 hover:text-tinta"
                }`}
              >
                Checklist
              </button>
            </div>
            {puedeCrear && (
              <button onClick={() => setEditando("nuevo")} className={BOTON_PRIMARIO}>
                + Nuevo objetivo
              </button>
            )}
          </div>

          {!objetivos ? (
            <div className={`p-8 text-center text-sm text-tinta/50 ${TARJETA}`}>Cargando…</div>
          ) : objetivosTop.length === 0 ? (
            <div className="rounded-xl border border-dashed border-borde p-8 text-center">
              <p className="text-sm text-pretty text-tinta/60">Aún no hay objetivos cargados.</p>
              {puedeCrear && (
                <button onClick={() => setEditando("nuevo")} className={`mt-4 ${BOTON_PRIMARIO}`}>
                  Crear el primero
                </button>
              )}
            </div>
          ) : vista === "gantt" ? (
            <Gantt
              objetivos={objetivosTop}
              gastosPorObjetivo={gastosPorObjetivo}
              puedeEditar={puedeEditar}
              puedeAlternar={puedeAlternar}
              onAlternar={alternarHecho}
              onEditar={(o) => puedeEditar && setEditando(o)}
            />
          ) : (
            <TableroObjetivos
              objetivos={objetivosTop}
              objetivosPorPadre={objetivosPorPadre}
              rolPanel={rolPanel}
              puedeEditar={puedeEditar}
              puedeEliminar={puedeEliminar}
              puedeAlternar={puedeAlternar}
              onAlternar={alternarHecho}
              onEditar={(o) => puedeEditar && setEditando(o)}
              onEliminar={eliminarObjetivo}
              onAgregarSub={agregarSub}
            />
          )}

          {editando && (
            <FormularioObjetivoModal
              objetivo={editando === "nuevo" ? null : editando}
              proyectoId={proyectoId}
              onClose={() => setEditando(null)}
              onGuardado={() => {
                setEditando(null);
                cargar();
              }}
              onEliminar={
                editando !== "nuevo" && puedeEliminar
                  ? () => {
                      eliminarObjetivo(editando);
                      setEditando(null);
                    }
                  : null
              }
            />
          )}
        </>
      )}
    </div>
  );
}
