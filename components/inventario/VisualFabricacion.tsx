import {
  IconBox,
  IconBuildingFactory2,
  IconHammer,
  IconReceipt2,
  IconTruckDelivery,
  type Icon,
} from "@tabler/icons-react";
import {
  ETIQUETA_ESTADO_FABRICACION,
  ETIQUETA_GRUPO,
  GRUPOS_COSTO,
  composicion,
  formatearMontoFino,
  formatearPct,
  type EstadoFabricacion,
  type GrupoCosto,
} from "@/lib/fabricacion-modelo";

// El vocabulario visual de Fabricación: un ícono y un color por tipo de costo, el chip de estado y la
// barra que muestra de qué está hecho el costo. Vive aparte para que la lista y la ficha se vean igual.

export const ESTILO_GRUPO: Record<GrupoCosto, { Icono: Icon; tono: string; barra: string }> = {
  material: { Icono: IconBox, tono: "bg-orange-500/12 text-orange-700 dark:text-orange-300", barra: "bg-orange-500" },
  mano_obra: { Icono: IconHammer, tono: "bg-teal-500/12 text-teal-700 dark:text-teal-300", barra: "bg-teal-500" },
  maquinaria: { Icono: IconBuildingFactory2, tono: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300", barra: "bg-indigo-500" },
  servicio: { Icono: IconTruckDelivery, tono: "bg-sky-500/12 text-sky-700 dark:text-sky-300", barra: "bg-sky-500" },
  otro: { Icono: IconReceipt2, tono: "bg-amber-500/12 text-amber-700 dark:text-amber-300", barra: "bg-amber-500" },
};

export function IconoGrupo({ grupo, chico = false }: { grupo: GrupoCosto; chico?: boolean }) {
  const { Icono, tono } = ESTILO_GRUPO[grupo];
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${tono} ${chico ? "h-8 w-8" : "h-10 w-10"}`} title={ETIQUETA_GRUPO[grupo]}>
      <Icono size={chico ? 16 : 19} stroke={1.75} />
    </span>
  );
}

const PUNTO_ESTADO: Record<EstadoFabricacion, string> = {
  borrador: "bg-slate-400",
  activo: "bg-emerald-500",
  archivado: "bg-amber-500",
};

export function ChipEstadoFabricacion({ estado }: { estado: EstadoFabricacion }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-borde bg-superficie px-2.5 py-1 text-[11px] font-semibold text-tinta">
      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_ESTADO[estado]}`} />
      {ETIQUETA_ESTADO_FABRICACION[estado]}
    </span>
  );
}

/**
 * La barra de composición: un tramo de color por tipo de costo, proporcional a lo que pesa, con la
 * leyenda debajo (en dos columnas en el celular). Sin ítems no dibuja nada.
 */
export function BarraComposicion({ porGrupo }: { porGrupo: Record<GrupoCosto, number> }) {
  const partes = composicion(porGrupo);
  if (partes.length === 0) return null;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-tinta/[0.06]" role="img" aria-label={`Composición del costo: ${partes.map((p) => `${ETIQUETA_GRUPO[p.grupo]} ${formatearPct(p.pct)}`).join(", ")}`}>
        {partes.map((p) => (
          <span key={p.grupo} className={ESTILO_GRUPO[p.grupo].barra} style={{ width: `${p.pct}%` }} title={`${ETIQUETA_GRUPO[p.grupo]}: ${formatearPct(p.pct)}`} />
        ))}
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:flex sm:flex-wrap">
        {GRUPOS_COSTO.filter((g) => porGrupo[g] > 0).map((g) => {
          const p = partes.find((x) => x.grupo === g)!;
          return (
            <li key={g} className="flex items-center gap-1.5 text-gris">
              <span className={`h-2 w-2 shrink-0 rounded-full ${ESTILO_GRUPO[g].barra}`} />
              <span className="truncate">{ETIQUETA_GRUPO[g]}</span>
              <span className="font-semibold tabular-nums text-tinta">{formatearPct(p.pct)}</span>
              <span className="hidden tabular-nums text-gris-suave lg:inline">{formatearMontoFino(p.monto)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
