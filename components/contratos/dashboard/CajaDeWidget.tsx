import Link from "@/components/contratos/Enlace";
import { IconArrowRight } from "@tabler/icons-react";
import { TARJETA } from "@/lib/contratos/estilos";

/**
 * El marco de cada widget del dashboard: título, subtítulo, un enlace al módulo y el contenido.
 *
 * Todos comparten marco para que el tablero se lea como una sola pieza y no como una pila de
 * cajas distintas. El encabezado es una sola línea que se parte en el celular.
 */
export default function CajaDeWidget({
  id,
  titulo,
  subtitulo,
  icono,
  href,
  enlace = "Abrir",
  derecha,
  children,
  className = "",
}: {
  id?: string;
  titulo: string;
  subtitulo?: string;
  icono?: React.ReactNode;
  href?: string;
  enlace?: string;
  /** Algo a la derecha del título: una pastilla de plazo, por ejemplo. */
  derecha?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`${TARJETA} scroll-mt-6 p-4 sm:p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {icono && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cian-lavado text-azul">
              {icono}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="titular truncate text-base text-azul">{titulo}</h2>
            {subtitulo && <p className="truncate text-xs text-gris">{subtitulo}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {derecha}
          {href && (
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gris transition hover:text-azul"
            >
              {enlace}
              <IconArrowRight size={13} />
            </Link>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

/** El hueco de un widget que no se pudo leer: dice qué pasó y deja el resto del tablero en pie. */
export function WidgetNoDisponible({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <section className={`${TARJETA} p-5`}>
      <h2 className="titular text-base text-azul">{titulo}</h2>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        {mensaje}
      </p>
    </section>
  );
}

/** Lo que se ve mientras un widget carga: la misma caja, con pulso. */
export function EsqueletoDeWidget({ alto = "h-64", className = "" }: { alto?: string; className?: string }) {
  return <div className={`${TARJETA} ${alto} animate-pulse ${className}`} aria-hidden />;
}

/** Un estado vacío con aire de «todavía no hay nada», no de error. */
export function VacioDeWidget({
  icono,
  titulo,
  texto,
  accion,
}: {
  icono: React.ReactNode;
  titulo: string;
  texto: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-borde bg-fondo/50 px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cian-lavado text-azul">{icono}</span>
      <p className="mt-3 text-sm font-semibold text-tinta">{titulo}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-gris">{texto}</p>
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}
