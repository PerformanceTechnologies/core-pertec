"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePestanaALaVista } from "@/components/pestanas-a-la-vista";
import { IconAlertTriangle, IconFiles, IconLayoutDashboard, IconPackageExport, type Icon } from "@tabler/icons-react";

const PESTANAS: { href: string; etiqueta: string; Icono: Icon; exacto?: boolean; ayuda: string }[] = [
  { href: "/repositorio-legal", etiqueta: "Resumen", Icono: IconLayoutDashboard, exacto: true, ayuda: "La foto de hoy: documentos clave por sociedad, vencidos y lo que falta" },
  { href: "/repositorio-legal/documentos", etiqueta: "Documentos", Icono: IconFiles, ayuda: "Todos los documentos, con buscador y filtros" },
  { href: "/repositorio-legal/vencimientos", etiqueta: "Vencimientos", Icono: IconAlertTriangle, ayuda: "Lo vencido y lo por vencer, para renovarlo" },
  { href: "/repositorio-legal/solicitudes", etiqueta: "Solicitudes", Icono: IconPackageExport, ayuda: "Paquetes enviados a bancos, mutuales y abogados" },
];

/** Las pestañas del módulo, igual que las de Flota e Inventario. */
export default function NavRepositorio() {
  const ruta = usePathname();
  const fila = usePestanaALaVista<HTMLElement>(ruta);
  const activa = (href: string, exacto?: boolean) => (exacto ? ruta === href || ruta.startsWith(`${href}/sociedades`) : ruta === href || ruta.startsWith(href + "/"));
  return (
    <nav ref={fila} className="desliza mb-6 -mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-borde bg-superficie p-1 shadow-[0_1px_2px_rgba(23,20,17,0.04)]">
        {PESTANAS.map(({ href, etiqueta, Icono, exacto, ayuda }) => {
          const on = activa(href, exacto);
          return (
            <Link key={href} href={href} title={ayuda} aria-current={on ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${on ? "bg-naranjo text-white shadow-sm" : "text-gris hover:bg-tinta/[0.04] hover:text-tinta"}`}>
              <Icono size={16} stroke={1.75} />
              {etiqueta}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
