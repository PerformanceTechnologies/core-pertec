"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean }[] = [
  { href: "/inventario", etiqueta: "Tablero", Icono: IconLayoutDashboard, exacto: true },
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
