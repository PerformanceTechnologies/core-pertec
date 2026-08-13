"use client";

import { useMemo, useState } from "react";
import type { GastoItem, Objetivo, Proyecto } from "@/lib/proyectos";
import { CAT_COLOR, catLabel, colorDe, costoConcepto, fmtCLP } from "@/lib/proyectos-utilidades";
import FormularioGastosModal from "./FormularioGastosModal";
import PopoverAdjuntosGasto from "./PopoverAdjuntosGasto";
import { BOTON_PRIMARIO, TARJETA } from "@/lib/estilos";

interface Categoria {
  categoria: string;
  total: number;
  count: number;
  items: GastoItem[];
}

interface Partida {
  label: string;
  total: number;
  count: number;
  items: GastoItem[];
}

interface ResumenObjetivo {
  objetivo: Objetivo;
  gastado: number;
  count: number;
  items: GastoItem[];
}

export default function GastosProyecto({
  proyecto,
  objetivos,
  puedeEditar,
  onActualizado,
}: {
  proyecto: Proyecto;
  objetivos: Objetivo[];
  puedeEditar: boolean;
  onActualizado: () => void;
}) {
  const [configAbierto, setConfigAbierto] = useState(false);
  const [popover, setPopover] = useState<{ titulo: string; gastos: GastoItem[] } | null>(null);
  const gastos = proyecto.gastos ?? [];
  const presupuesto = Number(proyecto.presupuesto_inicial) || 0;
  const gastado = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const disponible = presupuesto - gastado;
  const pctUsado = presupuesto > 0 ? Math.min(100, Math.round((gastado / presupuesto) * 100)) : 0;
  const sobrePresupuesto = disponible < 0;

  const saldoGlobalAsignado = Number(proyecto.saldo_global_asignado) || 0;
  const sumaPresupuestosObjetivos = objetivos.reduce((s, o) => s + (Number(o.presupuesto) || 0), 0);
  const sobreasignado = saldoGlobalAsignado > 0 && sumaPresupuestosObjetivos > saldoGlobalAsignado;

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, Categoria>();
    gastos.forEach((g) => {
      const cat = g.categoria || "sin_categoria";
      const monto = Number(g.monto) || 0;
      if (monto === 0) return;
      const actual = mapa.get(cat) ?? { categoria: cat, total: 0, count: 0, items: [] };
      actual.total += monto;
      actual.count += 1;
      actual.items.push(g);
      mapa.set(cat, actual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [gastos]);
  const maxCategoria = porCategoria[0]?.total || 1;

  const porPartida = useMemo(() => {
    const mapa = new Map<string, Partida>();
    gastos.forEach((g) => {
      const k = costoConcepto(g);
      const monto = Number(g.monto) || 0;
      if (monto === 0) return;
      const actual = mapa.get(k) ?? { label: k, total: 0, count: 0, items: [] };
      actual.total += monto;
      actual.count += 1;
      actual.items.push(g);
      mapa.set(k, actual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [gastos]);
  const maxPartida = porPartida[0]?.total || 1;

  // Objetivos con presupuesto propio o con al menos un gasto vinculado —
  // un gasto puede o no tener objetivo_id (los gastos generales del
  // proyecto siguen sin objetivo, ver GastoItem.objetivo_id).
  const porObjetivo = useMemo(() => {
    const resultado: ResumenObjetivo[] = [];
    objetivos.forEach((o) => {
      const items = gastos.filter((g) => g.objetivo_id === o.id);
      const gastadoObjetivo = items.reduce((s, g) => s + (Number(g.monto) || 0), 0);
      if ((Number(o.presupuesto) || 0) > 0 || items.length > 0) {
        resultado.push({ objetivo: o, gastado: gastadoObjetivo, count: items.length, items });
      }
    });
    return resultado.sort(
      (a, b) => (Number(b.objetivo.presupuesto) || 0) - (Number(a.objetivo.presupuesto) || 0),
    );
  }, [objetivos, gastos]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-tinta/50">
          {presupuesto > 0 ? `Presupuesto ${fmtCLP(presupuesto)} · ` : ""}
          {gastos.length} partida{gastos.length === 1 ? "" : "s"} · {porCategoria.length} categoría
          {porCategoria.length === 1 ? "" : "s"}
          {" · haz clic en una partida para ver sus adjuntos"}
        </p>
        {puedeEditar && (
          <button type="button" onClick={() => setConfigAbierto(true)} className={BOTON_PRIMARIO}>
            Configurar gastos
          </button>
        )}
      </div>

      <dl
        className={`grid grid-cols-1 overflow-hidden rounded-2xl border sm:grid-cols-3 ${
          sobrePresupuesto ? "border-red-300" : "border-borde"
        }`}
      >
        <div className="border-b border-borde bg-naranjo/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-medium text-tinta/55">Presupuesto inicial</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-naranjo sm:text-3xl">
            {fmtCLP(presupuesto)}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">
            {presupuesto === 0 ? "configura el presupuesto" : "base del proyecto"}
          </dd>
        </div>
        <div className="border-b border-borde bg-gris/[0.08] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-medium text-tinta/55">Gastado</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-tinta sm:text-3xl">
            {fmtCLP(gastado)}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">
            {gastos.length} partida{gastos.length === 1 ? "" : "s"}
            {presupuesto > 0 ? ` · ${pctUsado}%` : ""}
          </dd>
        </div>
        <div className={`px-5 py-4 ${sobrePresupuesto ? "bg-red-50" : "bg-teal/[0.06]"}`}>
          <dt className="text-xs font-medium text-tinta/55">Disponible</dt>
          <dd
            className={`mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums sm:text-3xl ${
              sobrePresupuesto ? "text-red-600" : "text-teal"
            }`}
          >
            {fmtCLP(disponible)}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">
            {sobrePresupuesto
              ? "fuera de presupuesto"
              : presupuesto > 0
                ? `${100 - pctUsado}% restante`
                : "sin presupuesto definido"}
          </dd>
        </div>
      </dl>

      {(saldoGlobalAsignado > 0 || sumaPresupuestosObjetivos > 0) && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
            sobreasignado ? "border-red-300 bg-red-50 text-red-700" : "border-borde bg-crema/60 text-tinta/70"
          }`}
        >
          {sobreasignado && <span aria-hidden>⚠</span>}
          <span>
            Suma de presupuestos por objetivo{" "}
            <strong className={sobreasignado ? "text-red-700" : "text-tinta"}>
              {fmtCLP(sumaPresupuestosObjetivos)}
            </strong>{" "}
            de{" "}
            <strong className={sobreasignado ? "text-red-700" : "text-tinta"}>
              {fmtCLP(saldoGlobalAsignado)}
            </strong>{" "}
            asignados
            {sobreasignado && " — supera el saldo global asignado"}
          </span>
        </div>
      )}

      {gastos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde p-8 text-center">
          <p className="text-sm text-pretty text-tinta/60">Aún no hay gastos registrados.</p>
          <p className="mt-1 text-xs text-tinta/40">
            {puedeEditar
              ? "Configura el presupuesto inicial y agrega los gastos del proyecto."
              : "El admin aún no ha registrado gastos."}
          </p>
          {puedeEditar && (
            <button type="button" onClick={() => setConfigAbierto(true)} className={`mt-4 ${BOTON_PRIMARIO}`}>
              Configurar gastos
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className={`p-4 ${TARJETA}`}>
            <div className="mb-3 flex items-baseline justify-between border-b border-borde pb-2.5">
              <span className="text-[15px] font-medium tracking-tight text-tinta">Por categoría</span>
              <em className="text-xs font-semibold not-italic text-tinta/45">{porCategoria.length}</em>
            </div>
            <ul className="flex flex-col gap-3.5">
              {porCategoria.map((c) => {
                const color = colorDe(CAT_COLOR[c.categoria] ?? "cobre");
                const totalArchivos = c.items.reduce((s, g) => s + (g.archivos?.length ?? 0), 0);
                return (
                  <li key={c.categoria} className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPopover({ titulo: `${catLabel(c.categoria)} · todos los gastos`, gastos: c.items })
                      }
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-crema"
                      title="Ver todos los adjuntos de esta categoría"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color.bg }} />
                      <span className="flex-1 truncate text-[13px] font-medium text-tinta">
                        {catLabel(c.categoria)}
                        {totalArchivos > 0 && (
                          <span
                            className="ml-1.5 text-tinta/35"
                            title={`${totalArchivos} adjunto(s) en total`}
                          >
                            📎 {totalArchivos}
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-tinta">
                        {fmtCLP(c.total)}
                      </span>
                    </button>
                    <div className="h-1.5 overflow-hidden rounded-full bg-crema">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(c.total / maxCategoria) * 100}%`, background: color.bg }}
                      />
                    </div>
                    <ul className="ml-2.5 flex flex-col gap-1 border-l border-dashed border-borde pl-3">
                      {c.items.map((g, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() =>
                              setPopover({
                                titulo: `${catLabel(c.categoria)} · ${[g.tag, g.label].filter(Boolean).join(" · ") || "Sin detalle"}`,
                                gastos: [g],
                              })
                            }
                            className="flex w-full justify-between gap-3 rounded px-1 py-0.5 text-left text-xs text-tinta/50 hover:bg-crema hover:text-tinta"
                          >
                            <span>
                              {[g.tag, g.label].filter(Boolean).join(" · ") || "Sin detalle"}
                              {g.archivos && g.archivos.length > 0 && (
                                <span
                                  className="ml-1.5 text-tinta/35"
                                  title={`${g.archivos.length} adjunto(s)`}
                                >
                                  📎 {g.archivos.length}
                                </span>
                              )}
                            </span>
                            <span className="font-medium tabular-nums text-tinta">{fmtCLP(g.monto)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={`p-4 ${TARJETA}`}>
            <div className="mb-3 flex items-baseline justify-between border-b border-borde pb-2.5">
              <span className="text-[15px] font-medium tracking-tight text-tinta">Por partida</span>
              <em className="text-xs font-semibold not-italic text-tinta/45">{porPartida.length}</em>
            </div>
            <ul className="flex flex-col gap-3">
              {porPartida.map((t) => (
                <li key={t.label}>
                  <button
                    type="button"
                    onClick={() => setPopover({ titulo: t.label, gastos: t.items })}
                    className="flex w-full flex-col gap-1.5 rounded px-1 py-1 text-left hover:bg-crema"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-[13px] font-medium text-tinta">{t.label}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-tinta">
                        {fmtCLP(t.total)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-crema">
                      <div
                        className="h-full rounded-full bg-naranjo"
                        style={{ width: `${(t.total / maxPartida) * 100}%` }}
                      />
                    </div>
                    {t.count > 1 && <p className="text-[11px] text-tinta/40">{t.count} entradas</p>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {porObjetivo.length > 0 && (
        <div className={`p-4 ${TARJETA}`}>
          <div className="mb-3 flex items-baseline justify-between border-b border-borde pb-2.5">
            <span className="text-[15px] font-medium tracking-tight text-tinta">Por objetivo</span>
            <em className="text-xs font-semibold not-italic text-tinta/45">{porObjetivo.length}</em>
          </div>
          <ul className="flex flex-col gap-3.5">
            {porObjetivo.map((r) => {
              const presupuestoObjetivo = Number(r.objetivo.presupuesto) || 0;
              const pctObjetivo =
                presupuestoObjetivo > 0
                  ? Math.min(100, Math.round((r.gastado / presupuestoObjetivo) * 100))
                  : 0;
              const sobreObjetivo = presupuestoObjetivo > 0 && r.gastado > presupuestoObjetivo;
              return (
                <li key={r.objetivo.id} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPopover({ titulo: `${r.objetivo.titulo} · todos los gastos`, gastos: r.items })
                    }
                    className="flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-crema"
                    title="Ver todos los adjuntos de este objetivo"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: colorDe(r.objetivo.color).bg }}
                    />
                    <span className="flex-1 truncate text-[13px] font-medium text-tinta">
                      {r.objetivo.titulo}
                      {r.count > 0 && (
                        <span className="ml-1.5 text-tinta/35">
                          {r.count} gasto{r.count === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-[13px] font-semibold tabular-nums ${sobreObjetivo ? "text-red-600" : "text-tinta"}`}
                    >
                      {fmtCLP(r.gastado)}
                      {presupuestoObjetivo > 0 && (
                        <span className="ml-1 font-normal text-tinta/40">
                          de {fmtCLP(presupuestoObjetivo)}
                        </span>
                      )}
                    </span>
                  </button>
                  {presupuestoObjetivo > 0 && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-crema">
                      <div
                        className={`h-full rounded-full ${sobreObjetivo ? "bg-red-500" : ""}`}
                        style={{
                          width: `${pctObjetivo}%`,
                          background: sobreObjetivo ? undefined : colorDe(r.objetivo.color).bg,
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {configAbierto && (
        <FormularioGastosModal
          proyecto={proyecto}
          objetivos={objetivos}
          onClose={() => setConfigAbierto(false)}
          onGuardado={() => {
            setConfigAbierto(false);
            onActualizado();
          }}
        />
      )}

      {popover && (
        <PopoverAdjuntosGasto
          titulo={popover.titulo}
          gastos={popover.gastos}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
