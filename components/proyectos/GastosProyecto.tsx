"use client";

import { useMemo, useState } from "react";
import type { GastoItem, Proyecto } from "@/lib/proyectos";
import { CAT_COLOR, catLabel, colorDe, costoConcepto, fmtCLP } from "@/lib/proyectos-utilidades";
import FormularioGastosModal from "./FormularioGastosModal";
import PopoverAdjuntosGasto from "./PopoverAdjuntosGasto";

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

export default function GastosProyecto({
  proyecto,
  puedeEditar,
  onActualizado,
}: {
  proyecto: Proyecto;
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-tinta/50">
          {presupuesto > 0 ? `Presupuesto ${fmtCLP(presupuesto)} · ` : ""}
          {gastos.length} partida{gastos.length === 1 ? "" : "s"} · {porCategoria.length} categoría{porCategoria.length === 1 ? "" : "s"}
          {" · haz clic en una partida para ver sus adjuntos"}
        </p>
        {puedeEditar && (
          <button
            onClick={() => setConfigAbierto(true)}
            className="rounded-full bg-naranjo px-4 py-2 text-[11px] font-semibold uppercase tracking-[.12em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:-translate-y-px hover:bg-[#b14614]"
          >
            Configurar gastos
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-t-[3px] border border-borde bg-white p-4" style={{ borderTopColor: "#C85217" }}>
          <span className="etiqueta-seccion">Presupuesto inicial</span>
          <p className="mt-2 text-[26px] font-medium leading-none tracking-tight text-naranjo">{fmtCLP(presupuesto)}</p>
          <p className="mt-1.5 text-[11px] text-tinta/45">{presupuesto === 0 ? "configura el presupuesto" : "base del proyecto"}</p>
        </div>
        <div className="border border-borde bg-white p-4">
          <span className="etiqueta-seccion">Gastado</span>
          <p className="mt-2 text-[26px] font-medium leading-none tracking-tight text-tinta">{fmtCLP(gastado)}</p>
          <p className="mt-1.5 text-[11px] text-tinta/45">
            {gastos.length} partidas{presupuesto > 0 ? ` · ${pctUsado}%` : ""}
          </p>
        </div>
        <div className={`border bg-white p-4 ${sobrePresupuesto ? "border-red-300" : "border-borde"}`}>
          <span className="etiqueta-seccion">Disponible</span>
          <p className={`mt-2 text-[26px] font-medium leading-none tracking-tight ${sobrePresupuesto ? "text-red-600" : "text-tinta"}`}>{fmtCLP(disponible)}</p>
          <p className="mt-1.5 text-[11px] text-tinta/45">
            {sobrePresupuesto ? "fuera de presupuesto" : presupuesto > 0 ? `${100 - pctUsado}% restante` : "sin presupuesto definido"}
          </p>
        </div>
      </div>

      {gastos.length === 0 ? (
        <div className="rounded-2xl border border-borde bg-white p-8 text-center">
          <p className="text-sm text-tinta/60">Aún no hay gastos registrados.</p>
          <p className="mt-1 text-xs text-tinta/40">
            {puedeEditar ? "Configura el presupuesto inicial y agrega los gastos del proyecto." : "El admin aún no ha registrado gastos."}
          </p>
          {puedeEditar && (
            <button onClick={() => setConfigAbierto(true)} className="mt-4 rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold text-white hover:bg-naranjo-suave">
              Configurar gastos
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="border border-borde bg-white p-4">
            <div className="mb-3 flex items-baseline justify-between border-b border-borde pb-2.5">
              <span className="text-[15px] font-medium tracking-tight text-tinta">Por categoría</span>
              <em className="text-xs font-semibold not-italic text-tinta/45">{porCategoria.length}</em>
            </div>
            <ul className="flex flex-col gap-3.5">
              {porCategoria.map((c) => {
                const color = colorDe(CAT_COLOR[c.categoria] ?? "cobre");
                return (
                  <li key={c.categoria} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color.bg }} />
                      <span className="flex-1 truncate text-[13px] font-medium text-tinta">{catLabel(c.categoria)}</span>
                      <span className="text-[13px] font-semibold text-tinta">{fmtCLP(c.total)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-crema">
                      <div className="h-full rounded-full" style={{ width: `${(c.total / maxCategoria) * 100}%`, background: color.bg }} />
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
                                <span className="ml-1.5 text-tinta/35" title={`${g.archivos.length} adjunto(s)`}>
                                  📎 {g.archivos.length}
                                </span>
                              )}
                            </span>
                            <span className="font-medium text-tinta">{fmtCLP(g.monto)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border border-borde bg-white p-4">
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
                      <span className="text-[13px] font-semibold text-tinta">{fmtCLP(t.total)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-crema">
                      <div className="h-full rounded-full bg-naranjo" style={{ width: `${(t.total / maxPartida) * 100}%` }} />
                    </div>
                    {t.count > 1 && <p className="text-[11px] text-tinta/40">{t.count} entradas</p>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {configAbierto && (
        <FormularioGastosModal
          proyecto={proyecto}
          onClose={() => setConfigAbierto(false)}
          onGuardado={() => {
            setConfigAbierto(false);
            onActualizado();
          }}
        />
      )}

      {popover && (
        <PopoverAdjuntosGasto titulo={popover.titulo} gastos={popover.gastos} onClose={() => setPopover(null)} />
      )}
    </div>
  );
}
