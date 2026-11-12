"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMessages, IconSunHigh } from "@tabler/icons-react";
import { InsigniaMuro, useNuevosMuro } from "@/components/muro/aviso-muro";
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
  invitado = false,
  mostrarBuzon,
  empresaActiva,
  empresasPermitidas,
}: {
  veMiDia: boolean;
  /** Invitado externo: sin Muro (es de la gente de la empresa). */
  invitado?: boolean;
  /** El buzón es de PERTEC: parado en otra empresa no se muestra. */
  mostrarBuzon: boolean;
  empresaActiva: Empresa | null;
  empresasPermitidas: Empresa[];
}) {
  const pathname = usePathname();
  const enMiDia = pathname === "/mi-dia" || pathname.startsWith("/mi-dia/");
  const enMuro = pathname === "/muro";
  // Con mensajes sin leer, el botón late en naranjo hasta que se abre el Muro.
  const muroConNuevos = useNuevosMuro() > 0 && !enMuro;

  return (
    // En el celular se monta en la barra fija de arriba (al lado del menú) y queda solo con íconos.
    <div className="z-40 flex items-center justify-end gap-1.5 max-lg:fixed max-lg:right-3 max-lg:top-[0.6875rem] lg:mb-4 lg:gap-2">
      {mostrarBuzon && <BuzonNotificaciones activa={empresaActiva} empresas={empresasPermitidas} />}
      {veMiDia && (
        <Link
          href="/mi-dia"
          className={`flex items-center gap-1.5 rounded-lg border h-[34px] px-2.5 text-sm font-medium transition max-lg:hidden ${
            enMiDia
              ? "border-naranjo/40 bg-naranjo/10 text-naranjo"
              : "border-borde bg-superficie text-tinta/75 hover:border-naranjo/40 hover:text-naranjo"
          }`}
        >
          <IconSunHigh size={16} stroke={1.75} aria-hidden />
          <span className="max-lg:sr-only">Mi Día</span>
        </Link>
      )}
      {!invitado && (
      <>
      {/* El Muro es de todos (no depende de una aplicación asignada), con sus mensajes nuevos encima. */}
      <Link
        href="/muro"
        className={`relative flex items-center gap-1.5 rounded-lg border h-[34px] px-2.5 text-sm font-medium transition max-lg:hidden ${
          enMuro
            ? "border-naranjo/40 bg-naranjo/10 text-naranjo"
            : muroConNuevos
              ? "animar-muro-nuevo border-naranjo bg-naranjo/10 font-semibold text-naranjo"
              : "border-borde bg-superficie text-tinta/75 hover:border-naranjo/40 hover:text-naranjo"
        }`}
      >
        <IconMessages size={16} stroke={1.75} aria-hidden />
        <span className="max-lg:sr-only">Muro</span>
        <InsigniaMuro chica />
      </Link>
      </>
      )}
      {/* En el celular la empresa va a la izquierda de la barra (hace de logo y de selector). */}
      <div className={`lg:static max-lg:fixed max-lg:top-[0.6875rem] ${pathname === "/" ? "max-lg:left-3" : "max-lg:left-[3.25rem]"}`}>
        <SelectorEmpresa activa={empresaActiva} permitidas={empresasPermitidas} />
      </div>
    </div>
  );
}
