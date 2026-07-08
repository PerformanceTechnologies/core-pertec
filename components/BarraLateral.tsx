"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMenu2, IconX, IconLayoutDashboard, IconUsers, IconSettings2 } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import { cerrarSesionAction } from "@/app/(protegido)/cerrar-sesion";
import type { Aplicacion, Rol } from "@/lib/tipos";

export default function BarraLateral({
  correo,
  rol,
  apps,
}: {
  correo: string;
  rol: Rol;
  apps: Aplicacion[];
}) {
  const [abierta, setAbierta] = useState(false);
  const pathname = usePathname();
  const esAdmin = rol === "admin";

  const contenido = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <Image
          src="/logo-pertec.png"
          alt="Performance Technologies — PERTEC"
          width={220}
          height={170}
          className="h-10 w-auto object-contain"
          priority
        />
        <span className="font-condensed text-base font-bold uppercase text-tinta">Core PERTEC</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <EnlaceNav
          href="/"
          activo={pathname === "/"}
          icono={<IconLayoutDashboard size={18} stroke={1.75} />}
        >
          Dashboard
        </EnlaceNav>

        <p className="mt-5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/40">
          Tus aplicaciones
        </p>
        <div className="mt-1 flex flex-col gap-0.5">
          {apps.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-tinta/40">Sin aplicaciones asignadas</p>
          )}
          {apps.map((app) => {
            const Icono = obtenerIcono(app.icono);
            const deshabilitada = app.estado === "mantenimiento";
            const href =
              app.tipo === "interna"
                ? app.url
                : app.url.startsWith("http")
                  ? app.url
                  : `https://${app.url}`;
            const clases =
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-tinta/75 transition hover:bg-naranjo/10 hover:text-naranjo";

            if (deshabilitada) {
              return (
                <span
                  key={app.id}
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-tinta/35"
                >
                  <Icono size={17} stroke={1.75} aria-hidden />
                  {app.nombre}
                </span>
              );
            }

            if (app.tipo === "interna") {
              return (
                <Link key={app.id} href={href} className={clases}>
                  <Icono size={17} stroke={1.75} aria-hidden />
                  {app.nombre}
                </Link>
              );
            }

            return (
              <a key={app.id} href={href} className={clases}>
                <Icono size={17} stroke={1.75} aria-hidden />
                {app.nombre}
              </a>
            );
          })}
        </div>

        {esAdmin && (
          <>
            <p className="mt-5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/40">
              Administración
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
              <EnlaceNav
                href="/usuarios"
                activo={pathname.startsWith("/usuarios")}
                icono={<IconUsers size={18} stroke={1.75} />}
              >
                Usuarios
              </EnlaceNav>
              <EnlaceNav
                href="/aplicaciones"
                activo={pathname.startsWith("/aplicaciones")}
                icono={<IconSettings2 size={18} stroke={1.75} />}
              >
                Aplicaciones
              </EnlaceNav>
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-borde px-4 py-4">
        <p className="truncate text-xs text-tinta/60">{correo}</p>
        <span className="mt-1 inline-block rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-teal">
          {esAdmin ? "Administrador" : "Usuario"}
        </span>
        <form action={cerrarSesionAction} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-tinta/70 transition hover:border-naranjo/40 hover:text-naranjo"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-borde bg-crema/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-2">
          <Image
            src="/logo-pertec.png"
            alt="Performance Technologies — PERTEC"
            width={220}
            height={170}
            className="h-8 w-auto object-contain"
          />
          <span className="font-condensed text-sm font-bold uppercase text-tinta">Core PERTEC</span>
        </div>
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label="Abrir menú"
          className="rounded-lg border border-borde p-2 text-tinta/70"
        >
          <IconMenu2 size={18} stroke={1.75} />
        </button>
      </div>

      {abierta && (
        <div
          className="fixed inset-0 z-50 bg-black/40 lg:hidden"
          onClick={() => setAbierta(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-borde bg-crema transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:translate-x-0 ${
          abierta ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setAbierta(false)}
          aria-label="Cerrar menú"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-tinta/50 lg:hidden"
        >
          <IconX size={18} stroke={1.75} />
        </button>
        {contenido}
      </aside>
    </>
  );
}

function EnlaceNav({
  href,
  activo,
  icono,
  children,
}: {
  href: string;
  activo: boolean;
  icono: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
        activo ? "bg-naranjo/10 text-naranjo" : "text-tinta/75 hover:bg-tinta/5"
      }`}
    >
      {icono}
      {children}
    </Link>
  );
}
