import Link from "@/components/contratos/Enlace";
import {
  IconAlertTriangle,
  IconCalendarDue,
  IconCar,
  IconCircleCheck,
  IconCoin,
  IconId,
  IconTruck,
  IconFolder,
} from "@tabler/icons-react";
import CajaDeWidget from "./CajaDeWidget";
import { nombreDeModulo, type Atencion, type ClaveDeModulo } from "@/lib/contratos/dashboard-modelo";

const ICONO_DE_MODULO: Record<ClaveDeModulo, React.ReactNode> = {
  documentos: <IconFolder size={15} />,
  acreditacion: <IconId size={15} />,
  vehiculos: <IconCar size={15} />,
  logistica: <IconTruck size={15} />,
  gastos: <IconCoin size={15} />,
};

/**
 * La lista de lo que hay que mirar hoy, de todos los módulos, lo más urgente primero.
 *
 * Es el único widget que no es un resumen sino una lista de tareas: cada fila es algo concreto
 * (una persona, una partida, una fecha límite) y es un enlace directo a donde se arregla. Si no
 * hay nada, lo dice como una buena noticia y no como una caja vacía.
 */
export default function RequiereAtencion({ items, total }: { items: Atencion[]; total: number }) {
  return (
    <CajaDeWidget
      id="atencion"
      titulo="Requiere atención"
      subtitulo={total === 0 ? "Nada urgente por ahora" : `${total} ${total === 1 ? "punto" : "puntos"} · lo más urgente primero`}
      icono={<IconAlertTriangle size={18} stroke={1.8} />}
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-borde bg-fondo/50 px-4 py-8 text-center">
          <span data-tono="ok" className="dash-pastilla flex h-11 w-11 items-center justify-center rounded-full">
            <IconCircleCheck size={24} />
          </span>
          <p className="mt-3 text-sm font-semibold text-tinta">Todo al día</p>
          <p className="mt-1 max-w-xs text-xs text-gris">
            No hay documentos vencidos, fechas pasadas ni partidas fuera de presupuesto.
          </p>
        </div>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {items.map((a) => (
            <li key={a.clave}>
              <Link
                href={a.href}
                data-tono={a.tono}
                className="dash-fila-enlace group flex items-start gap-3 rounded-lg px-2 py-2 transition"
              >
                <span className="dash-pastilla mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" aria-hidden>
                  {a.tono === "critico" ? <IconAlertTriangle size={15} /> : <IconCalendarDue size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tinta">{a.titulo}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--tono-texto)" }}>
                    {a.detalle}
                  </span>
                </span>
                <span
                  className="mt-0.5 hidden shrink-0 items-center gap-1 rounded-md bg-fondo px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gris sm:inline-flex"
                  title={nombreDeModulo(a.modulo)}
                >
                  {ICONO_DE_MODULO[a.modulo]}
                </span>
              </Link>
            </li>
          ))}
          {total > items.length && (
            <li className="px-2 pt-2 text-[11px] text-gris-suave">
              y {total - items.length} más en los módulos.
            </li>
          )}
        </ul>
      )}
    </CajaDeWidget>
  );
}
