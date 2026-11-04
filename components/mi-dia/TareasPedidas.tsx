import Link from "next/link";
import { IconLayoutKanban } from "@tabler/icons-react";
import type { ResumenTareasPedidas, Tarea } from "@/lib/tareas-modelo";
import { GrupoTareas } from "./MisTareas";

// Lo que la persona pidió a otros, en Mi Día: cómo va cada encargo, qué se atrasó y qué se
// terminó esta semana. Así quien pide no tiene que ir a preguntar ni revisar el tablero.

export default function TareasPedidas({ resumen: r, hoyIso, nombres }: { resumen: ResumenTareasPedidas; hoyIso: string; nombres: Record<string, string> }) {
  const quienes = (t: Tarea) => {
    if (t.responsables.length === 0) return "sin responsable";
    const ns = t.responsables.map((c) => nombres[c.toLowerCase()] ?? c.split("@")[0]);
    const verbo = t.estado === "hecho" ? "la terminó" : "la tiene";
    return `${verbo} ${ns.length > 2 ? `${ns.slice(0, 2).join(", ")} y ${ns.length - 2} más` : ns.join(" y ")}`;
  };
  return (
    <section className="mt-10">
      <div className="flex items-center gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta/50">Tareas que pediste</h2>
        <span className="h-px flex-1 bg-borde" />
        <Link href="/tareas" className="inline-flex items-center gap-1 text-[11px] font-semibold text-tinta/50 transition hover:text-naranjo">
          <IconLayoutKanban size={14} /> Ver tablero
        </Link>
      </div>

      <p className="mt-4 text-sm text-tinta/70">
        {r.total > 0 ? (
          <>
            Le pediste <strong className="text-tinta">{r.total}</strong> {r.total === 1 ? "tarea" : "tareas"} a otros que siguen abiertas
            {r.vencidas.length > 0 && (
              <>
                {" "}y <strong className="text-rose-600">{r.vencidas.length}</strong> {r.vencidas.length === 1 ? "está atrasada" : "están atrasadas"}
              </>
            )}
            .
          </>
        ) : (
          "Todo lo que pediste está terminado."
        )}
        {r.terminadas.length > 0 && (
          <>
            {" "}
            <strong className="text-emerald-600">{r.terminadas.length}</strong> {r.terminadas.length === 1 ? "se terminó" : "se terminaron"} esta semana.
          </>
        )}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <GrupoTareas titulo="Atrasadas" tareas={r.vencidas} tono="rojo" hoyIso={hoyIso} detalle={quienes} />
          <GrupoTareas titulo="En marcha" tareas={r.pendientes.slice(0, 6)} tono="normal" hoyIso={hoyIso} detalle={quienes} />
          {r.pendientes.length > 6 && (
            <Link href="/tareas" className="text-xs font-semibold text-tinta/50 hover:text-naranjo">
              y {r.pendientes.length - 6} más →
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <GrupoTareas titulo="Terminadas esta semana" tareas={r.terminadas.slice(0, 6)} tono="verde" hoyIso={hoyIso} detalle={quienes} />
        </div>
      </div>
    </section>
  );
}
