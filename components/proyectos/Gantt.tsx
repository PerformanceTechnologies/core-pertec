"use client";

import type { Objetivo } from "@/lib/proyectos";
import { colorDe, diasEntre, fmtMes, parseFecha, sumarDias } from "@/lib/proyectos-utilidades";

const ANCHO_DIA = 28;
const ANCHO_LABEL = 180;

export default function Gantt({
  objetivos,
  puedeEditar,
  puedeAlternar,
  onAlternar,
  onEditar,
}: {
  objetivos: Objetivo[];
  puedeEditar: boolean;
  puedeAlternar: boolean;
  onAlternar: (o: Objetivo) => void;
  onEditar: (o: Objetivo) => void;
}) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const starts = objetivos.map((o) => parseFecha(o.fecha_inicio).getTime());
  const ends = objetivos.map((o) => parseFecha(o.fecha_fin).getTime());
  const minTs = Math.min(hoy.getTime(), ...starts);
  const maxTs = Math.max(hoy.getTime(), ...ends);
  const inicio = sumarDias(new Date(minTs), -3);
  const fin = sumarDias(new Date(maxTs), 3);
  const totalDias = diasEntre(inicio, fin) + 1;

  const dias: Date[] = [];
  for (let i = 0; i < totalDias; i++) dias.push(sumarDias(inicio, i));

  const gruposMes: { start: number; len: number; label: string; anio: number }[] = [];
  let mesActual: string | null = null;
  let inicioRun = 0;
  let largoRun = 0;
  dias.forEach((d, i) => {
    const clave = `${d.getFullYear()}-${d.getMonth()}`;
    if (clave !== mesActual) {
      if (mesActual !== null) {
        gruposMes.push({ start: inicioRun, len: largoRun, label: fmtMes(dias[inicioRun]), anio: dias[inicioRun].getFullYear() });
      }
      mesActual = clave;
      inicioRun = i;
      largoRun = 1;
    } else {
      largoRun++;
    }
  });
  gruposMes.push({ start: inicioRun, len: largoRun, label: fmtMes(dias[inicioRun]), anio: dias[inicioRun].getFullYear() });

  const colHoy = diasEntre(inicio, hoy);
  const gridTemplateColumns = `${ANCHO_LABEL}px repeat(${totalDias}, ${ANCHO_DIA}px)`;

  return (
    <div className="animar-revelar overflow-x-auto rounded-2xl border border-borde bg-white shadow-sm">
      <div className="grid" style={{ gridTemplateColumns }}>
        <div className="sticky left-0 z-10 border-b border-r border-borde bg-crema" />
        {gruposMes.map((g, i) => (
          <div
            key={`m${i}`}
            className="flex items-baseline gap-1 border-b border-borde bg-crema px-2 py-1 text-[10px] font-semibold uppercase text-tinta/70"
            style={{ gridColumn: `${g.start + 2} / span ${g.len}` }}
          >
            {g.label} <span className="text-tinta/40">{g.anio}</span>
          </div>
        ))}

        <div className="sticky left-0 z-10 border-b border-r border-borde bg-crema px-2.5 py-1 text-[10px] font-semibold uppercase text-tinta/45">
          Objetivo
        </div>
        {dias.map((d, i) => {
          const esHoy = d.getTime() === hoy.getTime();
          const esFinDeSemana = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={`d${i}`}
              className={`flex flex-col items-center border-b border-borde py-0.5 text-[9px] ${
                esHoy ? "bg-naranjo/10 font-bold text-naranjo" : esFinDeSemana ? "bg-crema/70 text-tinta/40" : "text-tinta/50"
              }`}
            >
              <span>{d.getDate()}</span>
              <span>{["D", "L", "M", "M", "J", "V", "S"][d.getDay()]}</span>
            </div>
          );
        })}

        {objetivos.map((o, idx) => {
          const s = parseFecha(o.fecha_inicio);
          const e = parseFecha(o.fecha_fin);
          const colInicio = diasEntre(inicio, s);
          const span = diasEntre(s, e) + 1;
          const color = colorDe(o.color);
          const fila = 3 + idx;
          const diasTotales = span;
          const titulo = `${o.titulo} · ${diasTotales} día${diasTotales === 1 ? "" : "s"}${
            o.responsables.length ? " · " + o.responsables.join(", ") : ""
          }`;
          return (
            <div key={o.id} className="contents">
              <div
                style={{ gridRow: fila, gridColumn: 1 }}
                className="sticky left-0 z-10 flex items-center gap-1.5 border-b border-r border-borde bg-white px-2.5 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={o.hecho}
                  disabled={!puedeAlternar}
                  onChange={() => onAlternar(o)}
                  className="h-3.5 w-3.5 accent-naranjo"
                />
                <button
                  type="button"
                  onClick={() => onEditar(o)}
                  disabled={!puedeEditar}
                  className="truncate text-left text-xs text-tinta disabled:cursor-default"
                  title={titulo}
                >
                  <span className={o.hecho ? "text-tinta/40 line-through" : ""}>{o.titulo}</span>
                </button>
              </div>
              {dias.map((d, i) => {
                const esHoy = d.getTime() === hoy.getTime();
                const esFinDeSemana = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={`c${o.id}_${i}`}
                    style={{ gridRow: fila, gridColumn: i + 2 }}
                    className={`border-b border-borde/60 ${esHoy ? "bg-naranjo/5" : esFinDeSemana ? "bg-crema/50" : ""}`}
                  />
                );
              })}
              <button
                type="button"
                title={titulo}
                onClick={() => onEditar(o)}
                disabled={!puedeEditar}
                style={{
                  gridRow: fila,
                  gridColumn: `${colInicio + 2} / span ${span}`,
                  background: o.hecho ? color.soft : `linear-gradient(135deg, ${color.bg} 0%, ${color.bg} 65%, rgba(0,0,0,.18) 100%)`,
                  borderColor: color.edge,
                  color: o.hecho ? "var(--color-tinta)" : color.txt,
                  opacity: o.hecho ? 0.7 : 1,
                }}
                className="z-[1] mx-0.5 my-1 flex h-6 items-center truncate rounded-[3px] border px-2.5 text-[10.5px] font-semibold tracking-wide transition hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(12,10,9,.14)] hover:brightness-[1.06] disabled:cursor-default"
              >
                <span className={o.hecho ? "truncate line-through" : "truncate"}>{o.titulo}</span>
                {o.hecho && <span className="ml-1">✓</span>}
              </button>
            </div>
          );
        })}

        {colHoy >= 0 && colHoy < totalDias && (
          <div
            className="w-0.5 justify-self-center bg-naranjo"
            style={{ gridColumn: colHoy + 2, gridRow: `3 / span ${objetivos.length}`, boxShadow: "0 0 8px rgba(200,82,23,.4)" }}
          />
        )}
      </div>
    </div>
  );
}
