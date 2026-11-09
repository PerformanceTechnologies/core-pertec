"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconLayoutKanban, IconMenu2, IconMessages, IconSunHigh, type Icon } from "@tabler/icons-react";
import { useNuevosMuro } from "@/components/muro/aviso-muro";
import { EVENTO_ABRIR_MENU } from "@/lib/estilos";

// La barra de abajo del celular, como en cualquier app: lo que más se usa, al alcance del pulgar
// y con su nombre debajo del ícono. En pantallas grandes no se muestra (está el menú lateral).

function Boton({ href, etiqueta, Icono, activo, aviso }: { href: string; etiqueta: string; Icono: Icon; activo: boolean; aviso?: number }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition ${activo ? "text-naranjo" : "text-tinta/55"}`}
    >
      <span className={`grid h-7 w-12 place-items-center rounded-full transition ${activo ? "bg-naranjo/12" : ""}`}>
        <Icono size={21} stroke={activo ? 2.1 : 1.7} />
      </span>
      {etiqueta}
      {aviso ? (
        <span className="absolute right-[calc(50%-1.35rem)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-naranjo px-1 text-[9px] font-bold text-white">
          {aviso > 9 ? "9+" : aviso}
        </span>
      ) : null}
    </Link>
  );
}

export default function NavInferior({ veMiDia }: { veMiDia: boolean }) {
  const ruta = usePathname();
  const nuevos = useNuevosMuro();
  const en = (r: string) => ruta === r || ruta.startsWith(`${r}/`);
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-borde bg-crema/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <Boton href="/" etiqueta="Inicio" Icono={IconHome} activo={ruta === "/"} />
      <Boton href="/tareas" etiqueta="Tareas" Icono={IconLayoutKanban} activo={en("/tareas")} />
      <Boton href="/muro" etiqueta="Muro" Icono={IconMessages} activo={en("/muro")} aviso={en("/muro") ? 0 : nuevos} />
      {veMiDia && <Boton href="/mi-dia" etiqueta="Mi Día" Icono={IconSunHigh} activo={en("/mi-dia")} />}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_MENU))}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold text-tinta/55"
      >
        <span className="grid h-7 w-12 place-items-center rounded-full">
          <IconMenu2 size={21} stroke={1.7} />
        </span>
        Menú
      </button>
    </nav>
  );
}
