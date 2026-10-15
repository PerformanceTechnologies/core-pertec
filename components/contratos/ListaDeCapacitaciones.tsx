"use client";

import { useState } from "react";
import Link from "@/components/contratos/Enlace";
import { InsigniaDeSituacion, InsigniaDeTipo } from "./InsigniasDeCapacitacion";
import { fechaCorta } from "@/lib/contratos/acreditacion-modelo";
import { detalleDeCapacitacion, type RegistroDeCapacitacion } from "@/lib/contratos/capacitaciones-modelo";

type Filtro = "todos" | "examen" | "curso" | "atrasadas";

function Fila({ r }: { r: RegistroDeCapacitacion }) {
  const detalle = detalleDeCapacitacion(r, fechaCorta);
  return (
    <li>
      {/* ?tab=cursos: la ficha abre directo donde se reserva, se marca lo realizado y se sube lo suyo. */}
      <Link
        href={`/contratos/acreditacion/${r.personaId}?tab=cursos`}
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 transition hover:bg-cian-lavado/50 sm:flex-nowrap"
      >
        <InsigniaDeTipo tipo={r.tipo} />
        <span className="min-w-0 flex-1 basis-40">
          {/* En el celular el texto baja de línea en vez de cortarse: «Examen preoc…» no dice qué es. */}
          <span className="block text-sm font-semibold leading-tight text-tinta sm:truncate">{r.curso}</span>
          <span className="block text-[11px] leading-tight text-gris sm:truncate">
            {r.persona}
            {detalle && <> · {detalle}</>}
          </span>
        </span>
        <span className="ml-auto">
          <InsigniaDeSituacion situacion={r.situacion} />
        </span>
      </Link>
    </li>
  );
}

/**
 * El detalle de la tarjeta «Cursos y exámenes» de la nómina: lo que está reservado, lo más cercano
 * (o lo atrasado) primero, filtrable por tipo. Cada fila lleva a la pestaña de esa persona.
 */
export default function ListaDeCapacitaciones({
  registros,
  realizadas,
  reprobadas,
}: {
  /** Solo lo reservado, ya ordenado. */
  registros: RegistroDeCapacitacion[];
  realizadas: number;
  reprobadas: number;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const cuenta = (f: Filtro) =>
    registros.filter((r) =>
      f === "todos" ? true : f === "atrasadas" ? r.situacion.situacion === "atrasada" : r.tipo === f,
    ).length;
  const visibles = registros.filter((r) =>
    filtro === "todos" ? true : filtro === "atrasadas" ? r.situacion.situacion === "atrasada" : r.tipo === filtro,
  );

  const FILTROS: { clave: Filtro; etiqueta: string }[] = [
    { clave: "todos", etiqueta: "Todos" },
    { clave: "examen", etiqueta: "Exámenes" },
    { clave: "curso", etiqueta: "Cursos" },
    { clave: "atrasadas", etiqueta: "Atrasados" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-borde p-0.5 text-[11px] font-bold uppercase tracking-wide">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            type="button"
            aria-pressed={filtro === f.clave}
            onClick={() => setFiltro(f.clave)}
            className={`min-h-8 pointer-coarse:min-h-11 rounded-md px-3 transition ${
              filtro === f.clave ? "bg-cian-lavado text-azul" : "text-gris hover:text-azul"
            }`}
          >
            {f.etiqueta} <span className="font-semibold text-gris-suave">{cuenta(f.clave)}</span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde bg-fondo/50 p-5 text-center text-sm text-gris">
          {registros.length === 0
            ? "No hay nada reservado. Los cursos y exámenes se reservan en la pestaña «Cursos y exámenes» de cada persona."
            : "No hay nada en esta vista."}
        </p>
      ) : (
        <ul className="max-h-[min(60vh,28rem)] divide-y divide-borde overflow-y-auto rounded-xl border border-borde">
          {visibles.map((r) => (
            <Fila key={r.id} r={r} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-gris-suave">
        Ya realizados: {realizadas}
        {reprobadas > 0 ? ` · ${reprobadas} ${reprobadas === 1 ? "reprobado" : "reprobados"}` : ""}.
      </p>
    </div>
  );
}
