"use client";

import { useState } from "react";
import { IconCalendarEvent, IconVideo, IconMapPin, IconX } from "@tabler/icons-react";
import type { ReunionCalendario } from "@/lib/graph-calendario";

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Graph devuelve el dateTime ya en hora de Chile (gracias al header Prefer de
// lib/graph-calendario), pero como string SIN offset -- si se le pasara a
// `new Date()` para formatear, JS lo interpretaría en la zona horaria del
// navegador, corriendo la hora mostrada si alguien revisa desde otro huso.
// Se extrae el HH:mm directo del string, sin pasar por Date.
function horaCorta(iso: string): string {
  return iso.slice(11, 16);
}

function clavePara(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Celdas de la grilla del mes: null = celda vacía de relleno (antes del día 1
// o después del último día), para completar semanas de 7. Semana empieza en
// lunes (convención local), a diferencia de Date.getDay() que empieza en
// domingo.
function celdasDelMes(anio: number, mes: number): (number | null)[] {
  const primerDiaSemana = (new Date(anio, mes - 1, 1).getDay() + 6) % 7;
  const totalDias = new Date(anio, mes, 0).getDate();

  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
  for (let dia = 1; dia <= totalDias; dia++) celdas.push(dia);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

export default function CalendarioMensual({
  anio,
  mes,
  hoyISO,
  eventosPorDia,
}: {
  anio: number;
  mes: number;
  hoyISO: string;
  eventosPorDia: Record<string, ReunionCalendario[]>;
}) {
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(null);
  const celdas = celdasDelMes(anio, mes);
  const claveSeleccionada = diaSeleccionado !== null ? clavePara(anio, mes, diaSeleccionado) : null;
  const reunionesSeleccionadas = claveSeleccionada ? (eventosPorDia[claveSeleccionada] ?? []) : [];

  return (
    <div className="w-full max-w-[264px] rounded-xl border border-borde bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-tinta/45">
        <IconCalendarEvent size={12} stroke={1.75} />
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          {MESES[mes - 1]} {anio}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-[9px] font-medium uppercase text-tinta/30">
        {DIAS_SEMANA.map((letra, indice) => (
          <div key={indice}>{letra}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {celdas.map((dia, indice) => {
          if (dia === null) return <div key={indice} aria-hidden />;

          const clave = clavePara(anio, mes, dia);
          const reuniones = eventosPorDia[clave];
          const cantidad = reuniones?.length ?? 0;
          const esHoy = clave === hoyISO;
          const claseNumero = esHoy
            ? "bg-naranjo/10 font-semibold text-naranjo"
            : "text-tinta/65 hover:bg-tinta/5";

          return (
            <button
              key={indice}
              type="button"
              onClick={() => setDiaSeleccionado(dia)}
              className="relative flex items-center justify-center py-0.5"
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition ${claseNumero}`}>
                {dia}
              </span>
              {cantidad > 0 && (
                <span className="absolute right-0.5 top-0 flex h-3 w-3 items-center justify-center rounded-full bg-teal text-[7px] font-bold leading-none text-white">
                  {cantidad > 9 ? "9+" : cantidad}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {diaSeleccionado !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDiaSeleccionado(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-xl border border-borde bg-white p-5 shadow-lg"
            onClick={(evento) => evento.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-condensed text-lg font-bold uppercase text-tinta">
                {diaSeleccionado} de {MESES[mes - 1]}
              </p>
              <button
                type="button"
                onClick={() => setDiaSeleccionado(null)}
                aria-label="Cerrar"
                className="shrink-0 rounded-lg p-1 text-tinta/40 transition hover:bg-tinta/5 hover:text-tinta"
              >
                <IconX size={18} stroke={1.75} />
              </button>
            </div>

            {reunionesSeleccionadas.length === 0 ? (
              <p className="mt-3 text-sm text-tinta/50">Sin reuniones este día.</p>
            ) : (
              <ul className="mt-3 divide-y divide-borde">
                {reunionesSeleccionadas.map((reunion) => (
                  <li key={reunion.id} className="flex items-start gap-3 py-2.5">
                    <div className="mt-0.5 w-12 shrink-0 text-xs font-semibold tabular-nums text-naranjo">
                      {reunion.todoElDia ? "Todo el día" : horaCorta(reunion.inicio)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-tinta">{reunion.asunto}</p>
                      {reunion.ubicacion && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-tinta/50">
                          <IconMapPin size={12} stroke={1.75} className="shrink-0" />
                          {reunion.ubicacion}
                        </p>
                      )}
                    </div>
                    {reunion.enlaceTeams && (
                      <a
                        href={reunion.enlaceTeams}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-teal/10 px-2 py-1 text-xs font-semibold text-teal transition hover:bg-teal/20"
                      >
                        <IconVideo size={13} stroke={2} />
                        Unirse
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
