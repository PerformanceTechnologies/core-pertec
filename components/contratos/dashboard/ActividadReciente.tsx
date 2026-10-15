import Link from "@/components/contratos/Enlace";
import { IconHistory } from "@tabler/icons-react";
import CajaDeWidget, { VacioDeWidget } from "./CajaDeWidget";
import { haceCuanto, type MovimientoReciente } from "@/lib/contratos/dashboard-modelo";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

/**
 * Lo último que pasó en Acreditación: quién hizo qué y a quién.
 *
 * Solo Acreditación lleva historial (los demás módulos todavía no registran quién cambió qué), así
 * que es lo único que alimenta este widget. Cada fila lleva a la ficha de la persona, en su
 * pestaña de historial.
 */
export default function ActividadReciente({
  movimientos,
  ahora,
}: {
  movimientos: MovimientoReciente[];
  /** Para poder fijar el «hace cuánto» en una vista previa; por omisión, el momento actual. */
  ahora?: number;
}) {
  return (
    <CajaDeWidget
      titulo="Actividad reciente"
      subtitulo="Lo último en Acreditación Personas"
      icono={<IconHistory size={18} stroke={1.8} />}
    >
      {movimientos.length === 0 ? (
        <VacioDeWidget
          icono={<IconHistory size={22} />}
          titulo="Sin movimientos todavía"
          texto="Cada alta, cambio de datos y documento cargado queda anotado acá, con quién lo hizo."
        />
      ) : (
        <ol className="relative -mx-1 space-y-0.5 before:absolute before:bottom-3 before:left-[22px] before:top-3 before:w-px before:bg-borde">
          {movimientos.map((m) => (
            <li key={m.id} className="relative">
              <Link
                href={`/contratos/acreditacion/${m.personaId}?tab=historial`}
                className="dash-fila-enlace flex items-start gap-3 rounded-lg px-1 py-2 transition"
              >
                <span
                  className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-azul text-[11px] font-extrabold text-white ring-4 ring-[var(--color-superficie)]"
                  aria-hidden
                >
                  {iniciales(m.usuario)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-tinta sm:truncate">
                    <strong className="font-semibold">{m.usuario}</strong>{" "}
                    <span className="text-gris">{m.accion.toLowerCase()}</span>
                  </span>
                  <span className="block truncate text-xs text-gris">
                    {m.persona}
                    {m.detalle ? ` · ${m.detalle}` : ""}
                  </span>
                </span>
                <span className="mt-0.5 shrink-0 text-[11px] text-gris-suave">{haceCuanto(m.cuando, ahora)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </CajaDeWidget>
  );
}
