"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconSunHigh } from "@tabler/icons-react";
import SelectorEmpresa from "@/components/SelectorEmpresa";
import type { Empresa } from "@/lib/empresas-modelo";

/**
 * Arriba a la derecha de toda página: Mi Día y el cambio de empresa.
 *
 * Mi Día salió del menú de la izquierda para estar siempre a mano, y la
 * empresa va al lado porque es el contexto de todo lo que se ve abajo.
 */
export default function BarraSuperior({
  veMiDia,
  empresaActiva,
  empresasPermitidas,
}: {
  veMiDia: boolean;
  empresaActiva: Empresa | null;
  empresasPermitidas: Empresa[];
}) {
  const pathname = usePathname();
  const enMiDia = pathname === "/mi-dia" || pathname.startsWith("/mi-dia/");

  return (
    <div className="mb-4 flex items-center justify-end gap-2">
      {veMiDia && (
        <Link
          href="/mi-dia"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
            enMiDia
              ? "border-naranjo/40 bg-naranjo/10 text-naranjo"
              : "border-borde bg-superficie text-tinta/75 hover:border-naranjo/40 hover:text-naranjo"
          }`}
        >
          <IconSunHigh size={16} stroke={1.75} aria-hidden />
          Mi Día
        </Link>
      )}
      <SelectorEmpresa activa={empresaActiva} permitidas={empresasPermitidas} />
    </div>
  );
}
