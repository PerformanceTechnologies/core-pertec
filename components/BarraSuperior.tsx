"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMessages, IconSunHigh } from "@tabler/icons-react";
import { InsigniaMuro } from "@/components/muro/aviso-muro";
import BuzonNotificaciones from "@/components/BuzonNotificaciones";
import SelectorEmpresa from "@/components/SelectorEmpresa";
import type { Empresa } from "@/lib/empresas-modelo";

/**
 * Arriba a la derecha de toda página, de izquierda a derecha: las notificaciones,
 * Mi Día, el Muro y el cambio de empresa.
 *
 * Mi Día salió del menú de la izquierda para estar siempre a mano, y las
 * notificaciones —que vivían abajo en ese menú— se vinieron a su lado. La
 * empresa va al final porque es el contexto de todo lo que se ve abajo.
 */
export default function BarraSuperior({
  veMiDia,
  mostrarBuzon,
  empresaActiva,
  empresasPermitidas,
}: {
  veMiDia: boolean;
  /** El buzón es de PERTEC: parado en otra empresa no se muestra. */
  mostrarBuzon: boolean;
  empresaActiva: Empresa | null;
  empresasPermitidas: Empresa[];
}) {
  const pathname = usePathname();
  const enMiDia = pathname === "/mi-dia" || pathname.startsWith("/mi-dia/");
  const enMuro = pathname === "/muro";

  return (
    <div className="mb-4 flex items-center justify-end gap-2">
      {mostrarBuzon && <BuzonNotificaciones />}
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
      {/* El Muro es de todos (no depende de una aplicación asignada), con sus mensajes nuevos encima. */}
      <Link
        href="/muro"
        className={`relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
          enMuro ? "border-naranjo/40 bg-naranjo/10 text-naranjo" : "border-borde bg-superficie text-tinta/75 hover:border-naranjo/40 hover:text-naranjo"
        }`}
      >
        <IconMessages size={16} stroke={1.75} aria-hidden />
        Muro
        <InsigniaMuro chica />
      </Link>
      <SelectorEmpresa activa={empresaActiva} permitidas={empresasPermitidas} />
    </div>
  );
}
