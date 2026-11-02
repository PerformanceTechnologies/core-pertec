import { IconBulldozer, IconCar, IconTruck, IconTruckDelivery, type Icon } from "@tabler/icons-react";
import {
  ETIQUETA_ESTADO,
  diasHasta,
  estadoVencimiento,
  formatearPatente,
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

/** La patente dibujada como placa chilena: blanca, borde oscuro, letras grandes. */
export function Patente({ patente, chica = false }: { patente: string; chica?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border-2 border-tinta/80 bg-white font-mono font-extrabold tracking-wider text-neutral-900 shadow-sm ${
        chica ? "px-1.5 py-0.5 text-[11px]" : "px-2.5 py-1 text-sm"
      }`}
    >
      {formatearPatente(patente)}
    </span>
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
