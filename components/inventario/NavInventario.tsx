"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePestanaALaVista } from "@/components/pestanas-a-la-vista";
import {
  IconAdjustmentsHorizontal,
  IconArrowsExchange,
  IconChartPie,
  IconLayoutDashboard,
  IconMapPin,
  IconPackage,
  IconRefreshAlert,
  IconSettings,
  IconTableImport,
  type Icon,
} from "@tabler/icons-react";

// El Tablero no va acá: es el botón junto al título «Inventario» (BotonTablero, abajo).
const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean }[] = [
  { href: "/inventario/productos", etiqueta: "Productos", Icono: IconPackage },
  { href: "/inventario/operaciones", etiqueta: "Operaciones", Icono: IconArrowsExchange },
  { href: "/inventario/ajustes", etiqueta: "Ajustes", Icono: IconAdjustmentsHorizontal },
  { href: "/inventario/reabastecimiento", etiqueta: "Reabastecimiento", Icono: IconRefreshAlert },
  { href: "/inventario/valorizacion", etiqueta: "Valorización", Icono: IconChartPie },
  { href: "/inventario/ubicaciones", etiqueta: "Ubicaciones", Icono: IconMapPin },
  { href: "/inventario/importar", etiqueta: "Carga masiva", Icono: IconTableImport },
  { href: "/inventario/configuracion", etiqueta: "Configuración", Icono: IconSettings },
];

/** Las pestañas del módulo: una barra con íconos que se desplaza de lado en pantallas angostas. */
export default function NavInventario() {
  const ruta = usePathname();
  const fila = usePestanaALaVista<HTMLElement>(ruta);
  // Fabricación es su propio submódulo en el menú lateral, no una pestaña de Stock y bodegas: ahí
  // estas pestañas no van.
  const enFabricacion = ruta.startsWith("/inventario/fabricacion");
  const activa = (href: string, exacto?: boolean) => (exacto ? ruta === href : ruta === href || ruta.startsWith(href + "/"));

  if (enFabricacion) return null;

  return (
    <nav ref={fila} className="desliza mb-6 -mx-1 overflow-x-auto px-1 pb-1">
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

/** «Tablero», arriba junto al título del módulo (fuera de la fila de pestañas). */
export function BotonTablero() {
  const ruta = usePathname();
  if (ruta.startsWith("/inventario/fabricacion")) return null;
  const on = ruta === "/inventario";
  return (
    <Link
      href="/inventario"
      aria-current={on ? "page" : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
        on ? "bg-naranjo/10 text-naranjo ring-1 ring-naranjo/30" : "bg-tinta/[0.05] text-gris hover:bg-naranjo/10 hover:text-naranjo"
      }`}
    >
      <IconLayoutDashboard size={14} stroke={1.9} />
      Tablero
    </Link>
  );
}
