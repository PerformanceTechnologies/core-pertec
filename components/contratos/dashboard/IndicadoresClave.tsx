import Link from "@/components/contratos/Enlace";
import {
  IconBellRinging,
  IconCar,
  IconCoin,
  IconFileCheck,
  IconId,
  IconTruck,
  IconUsersGroup,
} from "@tabler/icons-react";
import { Barrita } from "./graficos";
import { TARJETA } from "@/lib/contratos/estilos";
import type { IconoDeIndicador, Indicador } from "@/lib/contratos/dashboard-modelo";

const ICONOS: Record<IconoDeIndicador, React.ReactNode> = {
  documentos: <IconFileCheck size={18} stroke={1.8} />,
  dotacion: <IconUsersGroup size={18} stroke={1.8} />,
  acreditadas: <IconId size={18} stroke={1.8} />,
  flota: <IconCar size={18} stroke={1.8} />,
  logistica: <IconTruck size={18} stroke={1.8} />,
  gastos: <IconCoin size={18} stroke={1.8} />,
  alertas: <IconBellRinging size={18} stroke={1.8} />,
};

/**
 * Las tarjetas de indicadores: lo más importante de cada módulo, en un número grande.
 *
 * Cada una dice una cosa, una vez: el número, contra qué se mide, y —si es un avance— una
 * barrita. El icono va en un recuadro teñido con el tono de la tarjeta, así que el color ya
 * dice si es bueno, está en curso o requiere atención sin leer nada. Son enlaces: llevan al
 * módulo de donde sale el número (o, la última, a la lista de pendientes de más abajo).
 */
export default function IndicadoresClave({ indicadores }: { indicadores: Indicador[] }) {
  if (indicadores.length === 0) return null;

  return (
    // Una columna por tarjeta en pantalla ancha, hasta siete: con Acreditación Vehículos son siete y
    // con seis columnas la última quedaba sola en una segunda fila.
    <ul
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
        indicadores.length >= 7 ? "lg:grid-cols-7" : indicadores.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-6"
      }`}
    >
      {indicadores.map((i) => (
        <li key={i.clave}>
          <Link
            href={i.href}
            data-tono={i.tono}
            className={`${TARJETA} dash-kpi group flex h-full flex-col p-3.5`}
          >
            <span className="flex items-center gap-2">
              <span
                className="dash-pastilla flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                aria-hidden
              >
                {ICONOS[i.icono]}
              </span>
              <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-gris">
                {i.etiqueta}
              </span>
            </span>

            <span className="mt-3 block text-[28px] font-extrabold leading-none tracking-tight text-tinta tabular-nums">
              {i.valor}
            </span>
            <span className="mt-1.5 block text-[11px] leading-snug text-gris">{i.ayuda}</span>

            {i.avance !== undefined && (
              <span className="mt-auto block pt-3">
                <Barrita valor={i.avance} tono={i.tono} />
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
