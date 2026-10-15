import Link from "@/components/contratos/Enlace";
import { IconArrowRight, IconCalendarEvent, IconFolder } from "@tabler/icons-react";
import type { Avance } from "@/lib/contratos/contratos-estado";
import { estadoDeAvance, etiquetaDeEstado } from "@/lib/contratos/estado-de-avance";
import { textoDePlazo, type LecturaDePlazo } from "@/lib/contratos/plazos-modelo";
import { fechaCorta } from "@/lib/contratos/acreditacion-modelo";

/**
 * Un submódulo de la portada con su avance: Documentos generales, Acreditación,
 * Logística, Gastos de arranque.
 *
 * Es CHICA a propósito. La versión anterior medía casi 370 px de alto porque repetía
 * tres veces la misma cifra (anillo, «x de y» y tres contadores); con cuatro tarjetas
 * había que desplazarse para ver todas. Ahora cada cifra aparece una vez: el anillo
 * dice el porcentaje, la línea de al lado «x de y» y la barra lo dibuja; lo que falta
 * va en el pie junto al estado.
 *
 * El estado se lee por color y por forma, no solo por un número: franja superior,
 * chip, anillo y barra comparten el mismo par de colores (ver .tarjeta-estado en
 * globals.css). Gris es «nadie ha subido nada», cian «hay avance», ámbar «algo
 * requiere atención» y verde «completa».
 *
 * Las carpetas de DENTRO de un módulo no usan esta tarjeta sino una fila de lista
 * (ver FilaDeCarpeta): son decenas, y una lista se recorre de un vistazo.
 */
export default function TarjetaDeCarpeta({
  nombre,
  href,
  avance,
  descripcion,
  icono,
  alertas = 0,
  unidad = "subidos",
  plazo,
  accion,
}: {
  nombre: string;
  href: string;
  avance: Avance;
  descripcion?: string | null;
  /** El icono del recuadro. Por omisión, una carpeta. */
  icono?: React.ReactNode;
  /** Cuántas cosas requieren atención (vencimientos, por ejemplo). Pasa el estado a ámbar. */
  alertas?: number;
  /** Qué se cuenta: «subidos» para documentos, «ejecutadas» para partidas. */
  unidad?: string;
  /** La fecha límite del módulo, si se definió. */
  plazo?: LecturaDePlazo | null;
  /** Un control propio de la tarjeta (renombrar), junto a «Entrar». Va encima del enlace. */
  accion?: React.ReactNode;
}) {
  const estado = estadoDeAvance(avance, alertas);
  const sinRequisitos = estado === "vacia";

  return (
    // La tarjeta es un <div> y el enlace se estira sobre ella con after:inset-0:
    // así toda la superficie es clicable sin anidar nada interactivo dentro de un <a>.
    <div
      data-estado={estado}
      className="tarjeta-estado group relative flex h-full flex-col overflow-hidden rounded-xl border border-borde p-4"
    >
      <span className="tarjeta-franja" aria-hidden />

      <div className="flex items-start gap-3">
        <span className="tarjeta-icono" aria-hidden>
          {icono ?? <IconFolder size={20} stroke={1.75} />}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="titular text-sm leading-snug text-azul [overflow-wrap:anywhere]">
            {/* Sin precarga: abrir cada módulo exige leer SharePoint o la base, y
                precargar los cuatro cada vez que se ve la portada es trabajo que casi
                nunca se usa. Ver FilaDeCarpeta. */}
            <Link
              href={href}
              prefetch={false}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {nombre}
            </Link>
          </h2>
          {descripcion && <p className="mt-0.5 text-[11px] leading-snug text-gris">{descripcion}</p>}
        </div>
      </div>

      <div className="mt-auto pt-3.5">
        {sinRequisitos ? (
          <p className="text-xs text-gris-suave">Sin requisitos que seguir todavía</p>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="anillo"
              style={{ "--p": avance.porcentaje } as React.CSSProperties}
              role="img"
              aria-label={`${avance.porcentaje}% de avance`}
            >
              <span className="text-[13px] font-extrabold tabular-nums text-tinta">
                {avance.porcentaje}
                <span className="text-[8px] font-bold text-gris">%</span>
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-gris">
                <strong className="font-extrabold text-tinta">{avance.subidos}</strong> de {avance.total}{" "}
                {unidad}
              </p>
              <div className="barra-estado mt-1.5" aria-hidden>
                <i style={{ width: `${avance.porcentaje}%` }} />
              </div>
            </div>
          </div>
        )}

        {plazo && (
          <p
            className={`mt-3 flex items-center gap-1.5 text-[11px] font-bold ${
              // Un módulo ya completo no se pinta de alarma aunque la fecha haya pasado:
              // el plazo importa mientras falta algo.
              estado === "completa"
                ? "text-gris"
                : plazo.estado === "vencido"
                  ? "text-red-600"
                  : plazo.estado === "al_dia"
                    ? "text-gris"
                    : "text-amber-600"
            }`}
          >
            <IconCalendarEvent size={13} aria-hidden className="shrink-0" />
            Límite {fechaCorta(plazo.fecha)} · {textoDePlazo(plazo)}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-borde/70 pt-3">
          <span className="tarjeta-chip">{etiquetaDeEstado(estado, alertas)}</span>
          {avance.pendientes > 0 && (
            <span className="text-[11px] font-bold text-amber-600">faltan {avance.pendientes}</span>
          )}
          {accion && <span className="relative z-10 flex items-center text-gris">{accion}</span>}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-cian-texto transition-[gap,color] group-hover:gap-2 group-hover:text-azul">
            Entrar
            <IconArrowRight size={13} />
          </span>
        </div>
      </div>
    </div>
  );
}
