import Link from "next/link";
import { IconArrowRight, IconCalendarEvent, IconLayoutKanban } from "@tabler/icons-react";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import { PRIORIDADES, tituloDeColumna, type ResumenMisTareas, type Tarea } from "@/lib/tareas-modelo";

// Las tareas de la persona en Mi Día, en vivo (no pasan por el resumen generado):
// lo vencido y lo que vence primero arriba. Cada fila abre la tarea en el tablero.

function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Grupo({ titulo, tareas, tono }: { titulo: string; tareas: Tarea[]; tono: "rojo" | "naranjo" | "normal" }) {
  if (tareas.length === 0) return null;
  const color = tono === "rojo" ? "text-rose-600" : tono === "naranjo" ? "text-naranjo" : "text-tinta/50";
  return (
    <div>
      <p className={`mb-2 text-[11px] font-bold uppercase tracking-[0.12em] ${color}`}>
        {titulo} · {tareas.length}
      </p>
      <ul className="flex flex-col gap-2">
        {tareas.map((t) => {
          const prioridad = PRIORIDADES.find((p) => p.valor === t.prioridad);
          return (
            <li key={t.id}>
              <Link
                href={`/tareas?abrir=${t.id}`}
                className={`group relative flex items-center gap-3 overflow-hidden rounded-lg border border-borde bg-superficie py-3 pl-4 pr-3 transition hover:border-naranjo/40 ${SOMBRA_CALIDA}`}
              >
                {prioridad && <span className={`absolute inset-y-0 left-0 w-[3px] ${prioridad.barra}`} aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-tinta">{t.titulo}</p>
                  <p className="mt-0.5 text-xs text-tinta/50">
                    {tituloDeColumna(t.estado)}
                    {prioridad ? ` · prioridad ${prioridad.etiqueta.toLowerCase()}` : ""}
                  </p>
                </div>
                {t.fechaLimite && (
                  <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${tono === "rojo" ? "text-rose-600" : "text-tinta/60"}`}>
                    <IconCalendarEvent size={14} /> {fechaCorta(t.fechaLimite)}
                  </span>
                )}
                <IconArrowRight size={15} className="shrink-0 text-tinta/25 transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MisTareas({ resumen: r }: { resumen: ResumenMisTareas }) {
  const urgentes = r.vencidas.length + r.hoy.length;
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
              <Grupo titulo="Vencidas" tareas={r.vencidas} tono="rojo" />
              <Grupo titulo="Vencen hoy" tareas={r.hoy} tono="naranjo" />
              <Grupo titulo="Próximos 3 días" tareas={r.proximas} tono="normal" />
            </div>
            <div className="flex flex-col gap-6">
              <Grupo titulo="En curso" tareas={r.enCurso} tono="normal" />
              <Grupo titulo="Por hacer" tareas={r.porHacer.slice(0, 5)} tono="normal" />
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
