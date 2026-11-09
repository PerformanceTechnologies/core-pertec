"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePestanaALaVista } from "@/components/pestanas-a-la-vista";
import {
  IconBuildingStore,
  IconCalculator,
  IconCategory,
  IconFileInvoice,
  IconLayoutDashboard,
  IconListSearch,
  IconPackages,
  IconTableImport,
  type Icon,
} from "@tabler/icons-react";
import { RUTA_VH } from "@/lib/valorizacion-historica-modelo";

const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean; soloAdmin?: boolean }[] = [
  { href: RUTA_VH, etiqueta: "Resumen", Icono: IconLayoutDashboard, exacto: true },
  { href: `${RUTA_VH}/buscador`, etiqueta: "Buscador", Icono: IconListSearch },
  { href: `${RUTA_VH}/catalogo`, etiqueta: "Catálogo y costos", Icono: IconPackages },
  { href: `${RUTA_VH}/documentos`, etiqueta: "Documentos", Icono: IconFileInvoice },
  { href: `${RUTA_VH}/proveedores`, etiqueta: "Proveedores", Icono: IconBuildingStore },
  { href: `${RUTA_VH}/conteo`, etiqueta: "Valorizar conteo", Icono: IconCalculator },
  { href: `${RUTA_VH}/control`, etiqueta: "Categorías y control", Icono: IconCategory },
  { href: `${RUTA_VH}/importar`, etiqueta: "Cargar Excel", Icono: IconTableImport, soloAdmin: true },
];

/** Las pestañas del submódulo, como las del Inventario. El ítem y el proveedor cuentan como su lista. */
export default function NavHistorica({ esAdmin }: { esAdmin: boolean }) {
  const ruta = usePathname();
  const fila = usePestanaALaVista<HTMLElement>(ruta);
  const activa = (href: string, exacto?: boolean) =>
    exacto ? ruta === href : ruta === href || ruta.startsWith(href + "/") || (href.endsWith("/catalogo") && ruta.startsWith(`${RUTA_VH}/item`));

  return (
    <nav ref={fila} className="desliza mb-6 -mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-borde bg-superficie p-1 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
        {PESTANAS.filter((p) => !p.soloAdmin || esAdmin).map(({ href, etiqueta, Icono, exacto, soloAdmin }) => {
          const on = activa(href, exacto);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${soloAdmin ? "ml-auto" : ""} ${
                on ? "bg-naranjo text-white shadow-sm" : "text-gris hover:bg-tinta/[0.04] hover:text-tinta"
              }`}
            >
              <Icono size={16} stroke={1.75} />
              {etiqueta}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
