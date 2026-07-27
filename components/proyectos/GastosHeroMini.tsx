"use client";

import { useMemo, useState } from "react";
import type { GastoItem, Objetivo, Proyecto } from "@/lib/proyectos";
import { CAT_COLOR, catLabel, colorDe, fmtCLP, mesAnio } from "@/lib/proyectos-utilidades";
import AnilloProgreso from "./AnilloProgreso";

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
    <div className="relative mx-auto w-full max-w-sm overflow-hidden bg-white px-6 py-5 shadow-[0_20px_40px_rgba(12,10,9,.08)]">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: "linear-gradient(180deg, #C85217 0%, #E67E3F 50%, #00A080 100%)" }}
      />
      <div className="flex items-baseline justify-between border-b border-borde pb-3.5">
        <span className="etiqueta-seccion">Gastos · {mesAnio()}</span>
        <span className="text-xs font-medium tracking-wide text-tinta/50">
          {fmtCLP(gastado)}
          {presupuesto > 0 && ` / ${fmtCLP(presupuesto)}`}
        </span>
      </div>

      <div className="flex justify-center py-5">
        <div className="relative flex items-center justify-center">
          <AnilloProgreso pct={pctUsado} size={104} stroke={8} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-[26px] font-medium leading-none tracking-tight ${sobrePresupuesto ? "text-red-600" : "text-tinta"}`}>
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
          <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">Presupuesto</span>
          <span className="text-lg font-medium leading-none tracking-tight text-tinta">{fmtCLP(presupuesto)}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 border-x border-borde">
          <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">Gastado</span>
          <span className="text-lg font-medium leading-none tracking-tight" style={{ color: "#C85217" }}>
            {fmtCLP(gastado)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[8.5px] font-semibold uppercase tracking-[.14em] text-tinta/50">Disponible</span>
          <span className="text-lg font-medium leading-none tracking-tight" style={{ color: sobrePresupuesto ? "#dc2626" : "#00A080" }}>
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
          <div className="flex gap-0.5 rounded-full border border-borde bg-white p-0.5">
            <button
              type="button"
              onClick={() => setVista("categoria")}
              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] transition ${
                vista === "categoria" ? "bg-naranjo text-white" : "text-tinta/45"
              }`}
            >
              Categoría
            </button>
            <button
              type="button"
              onClick={() => setVista("objetivo")}
              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] transition ${
                vista === "objetivo" ? "bg-naranjo text-white" : "text-tinta/45"
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
                  <span className="w-16 shrink-0 truncate text-[10px] text-tinta/70">{catLabel(c.categoria)}</span>
                  <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-crema">
                    <div className="h-full rounded-full" style={{ width: `${(c.total / maxCategoria) * 100}%`, background: color.bg }} />
                  </div>
                  <span className="shrink-0 text-right text-[10px] font-medium text-tinta">{fmtCLP(c.total)}</span>
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
                <span className="w-16 shrink-0 truncate text-[10px] text-tinta/70">{r.objetivo.titulo}</span>
                <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-crema">
                  <div className="h-full rounded-full" style={{ width: `${(r.total / maxObjetivo) * 100}%`, background: color.bg }} />
                </div>
                <span className="shrink-0 text-right text-[10px] font-medium text-tinta">{fmtCLP(r.total)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={onVerDetalle}
        className="mt-4 self-start rounded-full bg-naranjo px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:-translate-y-px hover:bg-[#b14614]"
      >
        Ver detalle de gastos →
      </button>
    </div>
  );
}
