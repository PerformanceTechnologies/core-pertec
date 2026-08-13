"use client";

import { useMemo, useState } from "react";
import type { GastoItem, Objetivo, Proyecto } from "@/lib/proyectos";
import { CAT_COLOR, catLabel, colorDe, fmtCLP, mesAnio } from "@/lib/proyectos-utilidades";
import AnilloProgreso from "./AnilloProgreso";
import { BOTON_PRIMARIO_CHICO, TARJETA } from "@/lib/estilos";

interface Categoria {
  categoria: string;
  total: number;
}

interface ObjetivoGasto {
  objetivo: Objetivo;
  total: number;
}

export default function GastosHeroMini({
  proyecto,
  objetivos,
  onVerDetalle,
}: {
  proyecto: Proyecto;
  objetivos: Objetivo[];
  onVerDetalle: () => void;
}) {
  const [vista, setVista] = useState<"categoria" | "objetivo">("categoria");
  const gastos = proyecto.gastos ?? [];
  const presupuesto = Number(proyecto.presupuesto_inicial) || 0;
  const gastado = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const disponible = presupuesto - gastado;
  const pctUsado = presupuesto > 0 ? Math.min(100, Math.round((gastado / presupuesto) * 100)) : 0;
  const sobrePresupuesto = disponible < 0;

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, Categoria>();
    gastos.forEach((g: GastoItem) => {
      const cat = g.categoria || "sin_categoria";
      const monto = Number(g.monto) || 0;
      if (monto === 0) return;
      const actual = mapa.get(cat) ?? { categoria: cat, total: 0 };
      actual.total += monto;
      mapa.set(cat, actual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [gastos]);
  const maxCategoria = porCategoria[0]?.total || 1;

  const porObjetivo = useMemo(() => {
    const mapa = new Map<string, ObjetivoGasto>();
    gastos.forEach((g: GastoItem) => {
      if (!g.objetivo_id) return;
      const monto = Number(g.monto) || 0;
      if (monto === 0) return;
      const objetivo = objetivos.find((o) => o.id === g.objetivo_id);
      if (!objetivo) return;
      const actual = mapa.get(objetivo.id) ?? { objetivo, total: 0 };
      actual.total += monto;
      mapa.set(objetivo.id, actual);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [gastos, objetivos]);
  const maxObjetivo = porObjetivo[0]?.total || 1;

  return (
    <div className={`flex w-full flex-col border-t-[3px] border-t-naranjo px-5 py-4 ${TARJETA}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-borde pb-3.5">
        <span className="etiqueta-seccion">Gastos · {mesAnio()}</span>
        <span className="text-xs font-medium tabular-nums text-tinta/50">
          {fmtCLP(gastado)}
          {presupuesto > 0 && ` / ${fmtCLP(presupuesto)}`}
        </span>
      </div>

      <div className="flex justify-center py-6">
        <div className="relative flex items-center justify-center">
          <AnilloProgreso pct={pctUsado} size={104} stroke={8} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`font-condensed text-[28px] font-bold leading-none tracking-tight tabular-nums ${
                sobrePresupuesto ? "text-red-600" : "text-tinta"
              }`}
            >
              {pctUsado}
              <span className="text-xs font-normal text-tinta/50">%</span>
            </span>
            <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[.18em] text-tinta/50">
              {presupuesto === 0 ? "sin presupuesto" : "usado"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0 border-t border-borde pt-4">
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">
            Presupuesto
          </span>
          <span className="font-condensed text-lg font-bold leading-none tracking-tight tabular-nums text-tinta">
            {fmtCLP(presupuesto)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1.5 border-x border-borde">
          <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">Gastado</span>
          <span className="font-condensed text-lg font-bold leading-none tracking-tight tabular-nums text-naranjo">
            {fmtCLP(gastado)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">
            Disponible
          </span>
          <span
            className={`font-condensed text-lg font-bold leading-none tracking-tight tabular-nums ${
              sobrePresupuesto ? "text-red-600" : "text-teal"
            }`}
          >
            {fmtCLP(disponible)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-borde pt-3.5">
        <p className="text-[10px] text-tinta/45">
          {vista === "categoria"
            ? `${porCategoria.length} categoría${porCategoria.length === 1 ? "" : "s"} con gasto`
            : `${porObjetivo.length} objetivo${porObjetivo.length === 1 ? "" : "s"} con gasto`}{" "}
          · {gastos.length} partida{gastos.length === 1 ? "" : "s"}
        </p>
        {porObjetivo.length > 0 && (
          <div className="flex gap-0.5 rounded-md border border-borde bg-superficie p-0.5">
            <button
              type="button"
              onClick={() => setVista("categoria")}
              className={`rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] transition ${
                vista === "categoria" ? "bg-naranjo text-white" : "text-tinta/45 hover:text-tinta"
              }`}
            >
              Categoría
            </button>
            <button
              type="button"
              onClick={() => setVista("objetivo")}
              className={`rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] transition ${
                vista === "objetivo" ? "bg-naranjo text-white" : "text-tinta/45 hover:text-tinta"
              }`}
            >
              Objetivo
            </button>
          </div>
        )}
      </div>

      {vista === "categoria" ? (
        porCategoria.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-borde bg-crema/40 p-3 text-center">
            <p className="text-xs text-tinta/50">Aún no hay gastos cargados.</p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {porCategoria.slice(0, 5).map((c) => {
              const color = colorDe(CAT_COLOR[c.categoria] ?? "cobre");
              return (
                <li key={c.categoria} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color.bg }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tinta/70">
                    {catLabel(c.categoria)}
                  </span>
                  <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-crema sm:w-20">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(c.total / maxCategoria) * 100}%`, background: color.bg }}
                    />
                  </div>
                  <span className="shrink-0 text-right text-[11px] font-medium tabular-nums text-tinta">
                    {fmtCLP(c.total)}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : porObjetivo.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-borde bg-crema/40 p-3 text-center">
          <p className="text-xs text-tinta/50">Ningún gasto vinculado a un objetivo todavía.</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {porObjetivo.slice(0, 5).map((r) => {
            const color = colorDe(r.objetivo.color);
            return (
              <li key={r.objetivo.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color.bg }} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-tinta/70">{r.objetivo.titulo}</span>
                <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-crema sm:w-20">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(r.total / maxObjetivo) * 100}%`, background: color.bg }}
                  />
                </div>
                <span className="shrink-0 text-right text-[11px] font-medium tabular-nums text-tinta">
                  {fmtCLP(r.total)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto pt-4">
        <button type="button" onClick={onVerDetalle} className={BOTON_PRIMARIO_CHICO}>
          Ver detalle de gastos →
        </button>
      </div>
    </div>
  );
}
