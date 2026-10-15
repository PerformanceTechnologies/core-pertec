import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import type { Avance } from "@/lib/contratos/contratos-estado";

export interface ResumenGlobal extends Avance {
  carpetas: number;
  carpetasCompletas: number;
}

/**
 * El estado de toda la carpeta de arranque, arriba de las tarjetas.
 *
 * Las tarjetas responden "cómo va cada carpeta"; esto responde "cómo vamos",
 * que es la pregunta con la que uno entra. Con cuatro carpetas la diferencia es
 * chica; con doce, sumar de cabeza deja de ser razonable.
 *
 * Es el bloque de marca de la pantalla —degradado azul con un resplandor cian—
 * y no una tarjeta blanca más: lo primero que se ve tiene que ser lo único que
 * pesa más que el resto, y así las tarjetas de abajo quedan como detalle.
 */
export default function ResumenDeArranque({
  resumen,
  titulo,
}: {
  resumen: ResumenGlobal;
  titulo: string;
}) {
  const completa = resumen.total > 0 && resumen.subidos === resumen.total;
  const sinNada = resumen.total === 0 && resumen.noAplican === 0;

  return (
    <div className="hero-marca mt-6 rounded-2xl p-4 sm:p-5">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-cian-suave before:inline-block before:h-0.5 before:w-6 before:bg-cian">
            {titulo}
          </span>
          <p className="mt-2.5 text-[15px] text-white/85">
            {sinNada ? (
              "Todavía no hay requisitos que seguir."
            ) : completa ? (
              <span className="inline-flex items-center gap-2 font-bold text-white">
                <IconCircleCheck size={18} />
                Todos los requisitos están subidos.
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <IconAlertTriangle size={18} className="shrink-0 text-amber-300" />
                {/* El número que importa es cuántos faltan, no cuántos hay: es
                    lo único sobre lo que alguien puede hacer algo hoy. */}
                <span>
                  Faltan <strong className="font-extrabold text-white">{resumen.pendientes}</strong>{" "}
                  {resumen.pendientes === 1 ? "documento" : "documentos"} para completarla
                </span>
              </span>
            )}
          </p>
        </div>

        {!sinNada && (
          <p className="shrink-0 leading-none">
            <span className="text-4xl font-extrabold tabular-nums sm:text-5xl">
              {resumen.porcentaje}
            </span>
            <span className="text-lg font-bold text-cian-suave">%</span>
          </p>
        )}
      </div>

      {!sinNada && (
        <>
          <div
            className="relative z-10 mt-4 h-2 overflow-hidden rounded-full bg-white/15"
            role="img"
            aria-label={`${resumen.porcentaje}% de los requisitos subidos`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-cian to-cian-suave transition-[width] duration-500"
              style={{ width: `${resumen.porcentaje}%` }}
            />
          </div>

          <dl className="relative z-10 mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-white/80">
            <Dato color="bg-cian" valor={resumen.subidos} etiqueta="subidos" />
            <Dato color="bg-white/20" valor={resumen.pendientes} etiqueta="faltan" />
            {resumen.noAplican > 0 && (
              <Dato color="bg-white/50" valor={resumen.noAplican} etiqueta="no aplican" />
            )}
            <div className="sm:ml-auto">
              <dd className="inline font-extrabold text-white">
                {resumen.carpetasCompletas} de {resumen.carpetas}
              </dd>{" "}
              <dt className="inline">carpetas completas</dt>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

function Dato({ color, valor, etiqueta }: { color: string; valor: number; etiqueta: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />
      <dd className="font-extrabold text-white">{valor}</dd>
      <dt>{etiqueta}</dt>
    </div>
  );
}
