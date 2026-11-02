"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCar,
  IconChartBar,
  IconFileText,
  IconLayoutKanban,
  IconSettings,
  IconTool,
  type Icon,
} from "@tabler/icons-react";

const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean }[] = [
  { href: "/flota", etiqueta: "Tablero", Icono: IconLayoutKanban, exacto: true },
  { href: "/flota/vehiculos", etiqueta: "Vehículos", Icono: IconCar },
  { href: "/flota/servicios", etiqueta: "Servicios", Icono: IconTool },
  { href: "/flota/contratos", etiqueta: "Contratos", Icono: IconFileText },
  { href: "/flota/costos", etiqueta: "Costos", Icono: IconChartBar },
  { href: "/flota/configuracion", etiqueta: "Configuración", Icono: IconSettings },
];

/** Las pestañas del módulo, igual que las del Inventario. */
export default function NavFlota() {
  const ruta = usePathname();
  const activa = (href: string, exacto?: boolean) => (exacto ? ruta === href : ruta === href || ruta.startsWith(href + "/"));

  return (
    <nav className="mb-6 -mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-borde bg-superficie p-1 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
        {PESTANAS.map(({ href, etiqueta, Icono, exacto }) => {
          const on = activa(href, exacto);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
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
