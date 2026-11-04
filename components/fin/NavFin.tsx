"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBuildingBank,
  IconCalculator,
  IconChecklist,
  IconFolders,
  IconLayoutDashboard,
  IconReceipt,
  IconSettings,
  IconShoppingCart,
  IconTargetArrow,
  type Icon,
} from "@tabler/icons-react";

const BASE = "/gestion-financiera";
const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean }[] = [
  { href: BASE, etiqueta: "Resumen", Icono: IconLayoutDashboard, exacto: true },
  { href: `${BASE}/comercial`, etiqueta: "Comercial", Icono: IconTargetArrow },
  { href: `${BASE}/ventas`, etiqueta: "Ventas y cobranza", Icono: IconReceipt },
  { href: `${BASE}/compras`, etiqueta: "Compras y pagos", Icono: IconShoppingCart },
  { href: `${BASE}/tesoreria`, etiqueta: "Tesorería", Icono: IconBuildingBank },
  { href: `${BASE}/proyectos`, etiqueta: "Proyectos", Icono: IconFolders },
  { href: `${BASE}/contabilidad`, etiqueta: "Contabilidad", Icono: IconCalculator },
  { href: `${BASE}/rutinas`, etiqueta: "Rutinas", Icono: IconChecklist },
  { href: `${BASE}/configuracion`, etiqueta: "Configuración", Icono: IconSettings },
];

export default function NavFin() {
  const ruta = usePathname();
  return (
    <nav className="mb-6 -mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-borde bg-superficie p-1 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
        {PESTANAS.map(({ href, etiqueta, Icono, exacto }) => {
          const on = exacto ? ruta === href : ruta === href || ruta.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${on ? "bg-naranjo text-white shadow-sm" : "text-gris hover:bg-tinta/[0.04] hover:text-tinta"}`}
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
