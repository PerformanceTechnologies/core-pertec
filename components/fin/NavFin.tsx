"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePestanaALaVista } from "@/components/pestanas-a-la-vista";
import { DialogosFin } from "./dialogos";
import {
  IconBuildingBank,
  IconCalculator,
  IconChecklist,
  IconFolders,
  IconLayoutDashboard,
  IconSettings,
  type Icon,
} from "@tabler/icons-react";

const BASE = "/gestion-financiera";
const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean; ayuda: string }[] = [
  { href: BASE, etiqueta: "Resumen", Icono: IconLayoutDashboard, exacto: true, ayuda: "La foto de hoy: caja, lo que te deben, lo que debes y lo urgente" },
  { href: `${BASE}/tesoreria`, etiqueta: "Tesorería", Icono: IconBuildingBank, ayuda: "Banco diario, factoring y flujo de caja" },
  { href: `${BASE}/proyectos`, etiqueta: "Proyectos", Icono: IconFolders, ayuda: "Cuánto se vendió, gastó y ganó en cada proyecto" },
  { href: `${BASE}/contabilidad`, etiqueta: "Contabilidad", Icono: IconCalculator, ayuda: "Libros, IVA del mes, asientos y cierre" },
  { href: `${BASE}/rutinas`, etiqueta: "Rutinas", Icono: IconChecklist, ayuda: "Qué revisar cada día, semana y mes" },
  { href: `${BASE}/configuracion`, etiqueta: "Configuración", Icono: IconSettings, ayuda: "Cuentas, parámetros, categorías y clientes" },
];

export default function NavFin() {
  const ruta = usePathname();
  const fila = usePestanaALaVista<HTMLElement>(ruta);
  return (
    <nav ref={fila} className="desliza mb-6 -mx-1 overflow-x-auto px-1 pb-1">
      <DialogosFin />
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-borde bg-superficie p-1 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
        {PESTANAS.map(({ href, etiqueta, Icono, exacto, ayuda }) => {
          const on = exacto ? ruta === href : ruta === href || ruta.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              title={ayuda}
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
