"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePestanaALaVista } from "@/components/pestanas-a-la-vista";
import { IconAlertTriangle, IconBuildingBank, IconFiles, IconPackageExport, type Icon } from "@tabler/icons-react";

const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean }[] = [
  { href: "/repositorio-legal", etiqueta: "Sociedades", Icono: IconBuildingBank, exacto: true },
  { href: "/repositorio-legal/documentos", etiqueta: "Documentos", Icono: IconFiles },
  { href: "/repositorio-legal/vencimientos", etiqueta: "Vencimientos", Icono: IconAlertTriangle },
  { href: "/repositorio-legal/solicitudes", etiqueta: "Solicitudes", Icono: IconPackageExport },
];

/** Las pestañas del módulo, igual que las de Flota e Inventario. */
export default function NavRepositorio() {
  const ruta = usePathname();
  const fila = usePestanaALaVista<HTMLElement>(ruta);
  const activa = (href: string, exacto?: boolean) => (exacto ? ruta === href || ruta.startsWith(`${href}/sociedades`) : ruta === href || ruta.startsWith(href + "/"));
  return (
    <nav ref={fila} className="desliza mb-6 -mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-borde bg-superficie p-1 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
        {PESTANAS.map(({ href, etiqueta, Icono, exacto }) => {
          const on = activa(href, exacto);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${on ? "bg-naranjo text-white shadow-sm" : "text-gris hover:bg-tinta/[0.04] hover:text-tinta"}`}>
              <Icono size={16} stroke={1.75} />
              {etiqueta}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
