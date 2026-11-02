import { IconBulldozer, IconCar, IconTruck, IconTruckDelivery, type Icon } from "@tabler/icons-react";
import {
  ETIQUETA_ESTADO,
  diasHasta,
  estadoVencimiento,
  gruposPatente,
  type CategoriaModelo,
  type EstadoVehiculo,
} from "@/lib/flota-modelo";

// El vocabulario visual de Flota: la patente como placa, el estado y los vencimientos.

export const ESTILO_ESTADO: Record<EstadoVehiculo, { punto: string; fondo: string }> = {
  disponible: { punto: "bg-emerald-500", fondo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  asignado: { punto: "bg-sky-500", fondo: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  en_taller: { punto: "bg-amber-500", fondo: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  fuera_servicio: { punto: "bg-rose-500", fondo: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  baja: { punto: "bg-slate-400", fondo: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

export function ChipEstado({ estado }: { estado: EstadoVehiculo }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${ESTILO_ESTADO[estado].fondo}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ESTILO_ESTADO[estado].punto}`} />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

/**
 * La patente dibujada como la placa chilena: blanca, doble borde negro, letras condensadas,
 * el escudo con la estrella después del primer par, un punto antes del último y «CHILE» abajo.
 */
export function Patente({ patente, chica = false }: { patente: string; chica?: boolean }) {
  const grupos = gruposPatente(patente);
  return (
    <span
      className={`inline-flex shrink-0 flex-col items-center rounded-[5px] bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-950 ${
        chica ? "border border-white px-1.5 pt-0.5" : "border-2 border-white px-3 pt-1"
      }`}
      style={{ outline: "1.5px solid #0a0a0a", outlineOffset: chica ? -3 : -4 }}
      aria-label={`Patente ${grupos.join(" ")}`}
    >
      <span className={`flex items-center font-condensed font-bold leading-none tracking-tight ${chica ? "gap-0.5 text-[15px]" : "gap-1 text-[30px]"}`}>
        {grupos.map((g, i) => (
          <span key={i} className="flex items-center gap-[inherit]">
            {i > 0 && (i === 1 ? <Escudo chica={chica} /> : <span className={`rounded-full bg-neutral-950 ${chica ? "h-[3px] w-[3px]" : "h-1.5 w-1.5"}`} />)}
            {g}
          </span>
        ))}
      </span>
      <span className={`font-sans font-bold leading-none tracking-[0.4em] ${chica ? "pb-0.5 pl-[0.4em] text-[4px]" : "pb-1 pl-[0.4em] text-[7px]"}`}>CHILE</span>
    </span>
  );
}

/** El escudo de Carabineros con la estrella, el separador del primer par. */
function Escudo({ chica }: { chica: boolean }) {
  return (
    <svg viewBox="0 0 20 22" className={chica ? "h-[7px] w-[6px]" : "h-3.5 w-3"} aria-hidden>
      <path d="M2 2h16v10c0 5-4 8-8 9.5C6 20 2 17 2 12z" fill="#0a0a0a" />
      <path d="M10 5.2l1.4 3.4 3.6.3-2.8 2.3.9 3.5L10 12.8l-3.1 1.9.9-3.5L5 8.9l3.6-.3z" fill="#fff" />
    </svg>
  );
}

const ICONO_CATEGORIA: Record<CategoriaModelo, Icon> = {
  auto: IconCar, camioneta: IconCar, camion: IconTruck, furgon: IconTruckDelivery, maquinaria: IconBulldozer, otro: IconCar,
};

export function IconoVehiculo({ categoria, estado, grande = false }: { categoria: CategoriaModelo | null; estado: EstadoVehiculo; grande?: boolean }) {
  const Icono = ICONO_CATEGORIA[categoria ?? "otro"];
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${ESTILO_ESTADO[estado].fondo} ${grande ? "h-14 w-14" : "h-10 w-10"}`}>
      <Icono size={grande ? 28 : 20} stroke={1.6} />
    </span>
  );
}

/** Un vencimiento como chip: verde vigente, ámbar por vencer, rojo vencido, gris sin fecha. */
export function ChipVencimiento({ fecha, corto = false }: { fecha: string | null; corto?: boolean }) {
  const estado = estadoVencimiento(fecha);
  const dias = diasHasta(fecha);
  const tono = {
    vigente: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    por_vencer: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    vencido: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    sin_fecha: "bg-borde/60 text-gris",
  }[estado];
  const texto =
    estado === "sin_fecha" ? "Sin fecha"
    : estado === "vencido" ? `Vencido hace ${-dias!} d`
    : estado === "por_vencer" ? (dias === 0 ? "Vence hoy" : `Vence en ${dias} d`)
    : corto ? "Vigente" : `Vigente · ${new Date(fecha + "T00:00:00").toLocaleDateString("es-CL")}`;
  return <span className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${tono}`}>{texto}</span>;
}
