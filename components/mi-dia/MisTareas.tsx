import Link from "next/link";
import { IconArrowRight, IconCalendarEvent, IconLayoutKanban } from "@tabler/icons-react";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import { PRIORIDADES, etiquetaFechas, tituloDeColumna, type ResumenMisTareas, type Tarea } from "@/lib/tareas-modelo";

// Las tareas de la persona en Mi Día, en vivo (no pasan por el resumen generado):
// lo vencido y lo que vence primero arriba. Cada fila abre la tarea en el tablero.

export type Tono = "rojo" | "naranjo" | "verde" | "normal";

const nombreDe = (nombres: Record<string, string>, correo: string) => nombres[correo.toLowerCase()] ?? correo.split("@")[0];

/**
 * Una tarea como fila: título, estado y prioridad, y a la derecha sus fechas. `detalle` cambia
 * según quién mira: al responsable le dice quién la pidió; a quien la pidió, quién la tiene.
 */
export function FilaTarea({ t, tono, hoyIso, detalle }: { t: Tarea; tono: Tono; hoyIso: string; detalle?: string }) {
  const prioridad = PRIORIDADES.find((p) => p.valor === t.prioridad);
  const fechas = etiquetaFechas(t, hoyIso);
  return (
    <li>
      <Link
        href={`/tareas?abrir=${t.id}`}
        className={`group relative flex items-center gap-3 overflow-hidden rounded-lg border border-borde bg-superficie py-3 pl-4 pr-3 transition hover:border-naranjo/40 ${SOMBRA_CALIDA}`}
      >
        {prioridad && <span className={`absolute inset-y-0 left-0 w-[3px] ${prioridad.barra}`} aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${t.estado === "hecho" ? "text-tinta/60 line-through decoration-tinta/30" : "text-tinta"}`}>{t.titulo}</p>
          <p className="mt-0.5 truncate text-xs text-tinta/50">
            {tituloDeColumna(t.estado)}
            {prioridad && t.estado !== "hecho" ? ` · prioridad ${prioridad.etiqueta.toLowerCase()}` : ""}
            {detalle ? ` · ${detalle}` : ""}
          </p>
        </div>
        {fechas && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${tono === "rojo" ? "text-rose-600" : tono === "verde" ? "text-emerald-600" : "text-tinta/60"}`}
            title={t.fechaInicio ? "Rango de fechas" : "Fecha límite"}
          >
            <IconCalendarEvent size={14} /> {fechas}
          </span>
        )}
        <IconArrowRight size={15} className="shrink-0 text-tinta/25 transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
      </Link>
    </li>
  );
}

export function GrupoTareas({
  titulo,
  tareas,
  tono,
  hoyIso,
  detalle,
}: {
  titulo: string;
  tareas: Tarea[];
  tono: Tono;
  hoyIso: string;
  detalle?: (t: Tarea) => string | undefined;
}) {
  if (tareas.length === 0) return null;
  const color = tono === "rojo" ? "text-rose-600" : tono === "naranjo" ? "text-naranjo" : tono === "verde" ? "text-emerald-600" : "text-tinta/50";
  return (
    <div>
      <p className={`mb-2 text-[11px] font-bold uppercase tracking-[0.12em] ${color}`}>
        {titulo} · {tareas.length}
      </p>
      <ul className="flex flex-col gap-2">
        {tareas.map((t) => (
          <FilaTarea key={t.id} t={t} tono={tono} hoyIso={hoyIso} detalle={detalle?.(t)} />
        ))}
      </ul>
    </div>
  );
}

export default function MisTareas({ resumen: r, hoyIso, nombres }: { resumen: ResumenMisTareas; hoyIso: string; nombres: Record<string, string> }) {
  const urgentes = r.vencidas.length + r.hoy.length;
  // Al responsable le sirve saber quién se la pidió (si no fue él mismo).
  const pidio = (t: Tarea) => (t.asignadoPor && !t.responsables.some((x) => x.toLowerCase() === t.asignadoPor!.toLowerCase()) ? `pedida por ${nombreDe(nombres, t.asignadoPor)}` : undefined);
  return (
    <section className="mt-10">
      <div className="flex items-center gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta/50">Mis tareas</h2>
        <span className="h-px flex-1 bg-borde" />
        <Link href="/tareas" className="inline-flex items-center gap-1 text-[11px] font-semibold text-tinta/50 transition hover:text-naranjo">
          <IconLayoutKanban size={14} /> Ver tablero
        </Link>
      </div>

      {r.total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-borde px-4 py-6 text-center text-sm text-tinta/45">
          No tienes tareas pendientes. 🎉
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-tinta/70">
            Tienes <strong className="text-tinta">{r.total}</strong> {r.total === 1 ? "tarea pendiente" : "tareas pendientes"}
            {urgentes > 0 && (
              <>
                {" "}y <strong className="text-rose-600">{urgentes}</strong> {urgentes === 1 ? "necesita" : "necesitan"} atención hoy
              </>
            )}
            .
          </p>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <GrupoTareas titulo="Vencidas" tareas={r.vencidas} tono="rojo" hoyIso={hoyIso} detalle={pidio} />
              <GrupoTareas titulo="Vencen hoy" tareas={r.hoy} tono="naranjo" hoyIso={hoyIso} detalle={pidio} />
              <GrupoTareas titulo="Próximos 3 días" tareas={r.proximas} tono="normal" hoyIso={hoyIso} detalle={pidio} />
              <GrupoTareas titulo="En su período" tareas={r.enPeriodo} tono="normal" hoyIso={hoyIso} detalle={pidio} />
            </div>
            <div className="flex flex-col gap-6">
              <GrupoTareas titulo="En curso" tareas={r.enCurso} tono="normal" hoyIso={hoyIso} detalle={pidio} />
              <GrupoTareas titulo="Por hacer" tareas={r.porHacer.slice(0, 5)} tono="normal" hoyIso={hoyIso} detalle={pidio} />
              {r.porHacer.length > 5 && (
                <Link href="/tareas" className="text-xs font-semibold text-tinta/50 hover:text-naranjo">
                  y {r.porHacer.length - 5} más por hacer →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
