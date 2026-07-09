"use client";

import { useState } from "react";
import type { ChecklistRun, EquipoMantenimiento, EstadoEquipo, FotoEvidencia } from "@/lib/mantencion";
import { ESTADOS_EQUIPO, ESTADO_EQUIPO_COLOR, ESTADO_EQUIPO_LABEL } from "@/lib/mantencion-utilidades";
import FilaInspeccion from "./FilaInspeccion";

const ICONO_COLOR_POR_ESTADO: Record<string, string> = {
  operativo: "#C85217",
  mantencion: "#b58900",
  revision: "#4A6FA5",
  fuera_servicio: "#b91c1c",
};

export default function FichaEquipo({
  equipo,
  runs,
  esAdmin,
  puedeOperar,
  onNuevaInspeccion,
  onEditar,
  onEliminar,
  onSetEstado,
  onCheckItem,
  onUpdateItem,
  onCerrarRun,
  onReabrirRun,
  onEliminarRun,
}: {
  equipo: EquipoMantenimiento;
  runs: ChecklistRun[];
  esAdmin: boolean;
  puedeOperar: boolean;
  onNuevaInspeccion: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  onSetEstado: (estado: EstadoEquipo) => void;
  onCheckItem: (runId: string, itemId: string, hecho: boolean) => void;
  onUpdateItem: (runId: string, itemId: string, patch: { notas?: string | null; fotos?: FotoEvidencia[]; medicion?: Record<string, string> | null }) => void;
  onCerrarRun: (runId: string) => void;
  onReabrirRun: (runId: string) => void;
  onEliminarRun: (runId: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const totalRuns = runs.length;
  const enCurso = runs.filter((r) => !r.cerrado_en).length;
  const ultima = runs[0];

  return (
    <li
      className={`group border bg-white transition ${abierto ? "border-naranjo shadow-[0_8px_24px_rgba(200,82,23,.08)]" : "border-borde hover:border-tinta/15"}`}
    >
      <button type="button" onClick={() => setAbierto((s) => !s)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="inline-flex w-4 justify-center text-tinta/40">{abierto ? "▾" : "▸"}</span>
        <span className="text-base" style={{ color: ICONO_COLOR_POR_ESTADO[equipo.estado] }}>
          🔧
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight text-tinta">{equipo.nombre}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-tinta/50">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em]"
              style={{ background: ESTADO_EQUIPO_COLOR[equipo.estado].bg, color: ESTADO_EQUIPO_COLOR[equipo.estado].texto }}
            >
              {ESTADO_EQUIPO_LABEL[equipo.estado]}
            </span>
            <span>
              · {totalRuns} inspecc{totalRuns === 1 ? "ión" : "iones"}
              {enCurso > 0 ? ` · ${enCurso} en curso` : ""}
            </span>
            {ultima && <span>· última {new Date(ultima.iniciado_en).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}</span>}
          </p>
        </div>
        {puedeOperar && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onNuevaInspeccion();
            }}
            className="rounded-lg p-1.5 text-tinta/40 opacity-0 hover:bg-crema hover:text-naranjo group-hover:opacity-100"
            title="Nueva inspección"
          >
            +
          </span>
        )}
      </button>

      {abierto && (
        <div className="flex flex-col gap-2.5 border-t border-borde bg-gradient-to-b from-crema/40 to-white py-3 pl-11 pr-3.5">
          {equipo.descripcion && <p className="text-[13px] font-light leading-relaxed text-tinta/55">{equipo.descripcion}</p>}

          {puedeOperar && (
            <div className="flex flex-wrap items-center gap-1.5 border border-borde bg-crema/60 px-3 py-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.1em] text-tinta/50">Estado:</span>
              {ESTADOS_EQUIPO.map((es) => {
                const color = ESTADO_EQUIPO_COLOR[es];
                const activo = equipo.estado === es;
                return (
                  <button
                    key={es}
                    type="button"
                    onClick={() => onSetEstado(es)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] transition"
                    style={{
                      background: color.bg,
                      color: color.texto,
                      border: `1px solid ${color.borde}`,
                      boxShadow: activo ? `inset 0 0 0 2px ${color.texto}` : "none",
                    }}
                  >
                    {ESTADO_EQUIPO_LABEL[es]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            {puedeOperar && (
              <button
                type="button"
                onClick={onNuevaInspeccion}
                className="rounded-full bg-naranjo px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-white shadow-[0_4px_14px_rgba(200,82,23,.25)] transition hover:bg-[#b14614]"
              >
                + Nueva inspección
              </button>
            )}
            <div className="flex-1" />
            {puedeOperar && (
              <>
                <button type="button" onClick={onEditar} className="rounded-lg p-1.5 text-tinta/40 hover:bg-crema hover:text-naranjo" title="Editar">
                  ✎
                </button>
                <button type="button" onClick={onEliminar} className="rounded-lg p-1.5 text-tinta/40 hover:bg-crema hover:text-red-600" title="Eliminar">
                  ×
                </button>
              </>
            )}
          </div>

          {runs.length === 0 ? (
            <p className="border border-dashed border-borde bg-crema/50 py-4 text-center text-xs italic text-tinta/40">Sin inspecciones todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((r) => (
                <FilaInspeccion
                  key={r.id}
                  run={r}
                  esAdmin={esAdmin}
                  puedeOperar={puedeOperar}
                  onCheck={(itemId, hecho) => onCheckItem(r.id, itemId, hecho)}
                  onUpdateItem={(itemId, patch) => onUpdateItem(r.id, itemId, patch)}
                  onCerrar={() => onCerrarRun(r.id)}
                  onReabrir={() => onReabrirRun(r.id)}
                  onEliminar={() => onEliminarRun(r.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
