import type { Avance } from "@/lib/contratos/contratos-estado";
import type { EtapasDeRequisitos } from "@/lib/contratos/documento-estado";
import BarraDeEtapas, { LeyendaDeEtapas } from "./BarraDeEtapas";

/**
 * El avance de la carpeta en la que uno está, arriba del todo.
 *
 * Mismo cálculo que las tarjetas de la portada —hojas, y "no aplica" fuera del
 * denominador— para que el número no cambie según desde dónde se mire. Dos
 * formas de contar lo mismo es la manera más rápida de que nadie confíe en
 * ninguna.
 *
 * Con `etapas`, la barra se parte por etapa de revisión (validado, en revisión, borrador) y
 * aparece su leyenda: el porcentaje grande sigue siendo el de requisitos con algo subido, y
 * debajo se dice cuánto de eso está validado.
 */
export default function BarraDeAvance({
  avance,
  etapas,
  titulo = "Avance de esta carpeta",
  unidad = "subidos",
}: {
  avance: Avance;
  /** Los requisitos por etapa de revisión. Sin esto, la barra es de un solo color. */
  etapas?: EtapasDeRequisitos;
  /** Acreditación la reutiliza para una persona: "Avance de la documentación". */
  titulo?: string;
  unidad?: string;
}) {
  if (avance.total === 0 && avance.noAplican === 0) return null;

  const completa = avance.total > 0 && avance.subidos === avance.total;
  const validados = etapas && avance.total > 0 ? Math.round((etapas.validado / avance.total) * 100) : null;

  return (
    <div className="mt-6 rounded-xl border border-borde bg-superficie p-5 shadow-[var(--sombra-tarjeta)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gris">
            {titulo}
          </p>
          <p className="mt-0.5 text-xs text-gris-suave">
            {avance.subidos} de {avance.total} {unidad}
            {avance.noAplican > 0 && ` · ${avance.noAplican} no aplican`}
          </p>
        </div>

        <div className="text-right">
          <p>
            <span
              className={`text-3xl font-extrabold tabular-nums ${
                completa ? "text-emerald-600" : "text-tinta"
              }`}
            >
              {avance.porcentaje}
            </span>
            <span className="text-xs font-bold text-gris">%</span>
          </p>
          {validados !== null && (
            <p className="-mt-0.5 flex items-center justify-end gap-1.5 text-[11px] font-bold text-emerald-700">
              <span className="punto-etapa" data-etapa="validado" aria-hidden />
              {validados}% validado
            </p>
          )}
        </div>
      </div>

      {etapas ? (
        <>
          <div className="mt-3">
            <BarraDeEtapas etapas={etapas} />
          </div>
          <div className="mt-3">
            <LeyendaDeEtapas etapas={etapas} />
          </div>
        </>
      ) : (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-borde">
          <div
            className={`h-full rounded-full transition-[width] ${
              completa ? "bg-emerald-500" : "bg-cian"
            }`}
            style={{ width: `${avance.porcentaje}%` }}
          />
        </div>
      )}
    </div>
  );
}
