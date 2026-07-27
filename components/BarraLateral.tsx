"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconMenu2,
  IconX,
  IconLayoutDashboard,
  IconUsers,
  IconSettings2,
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconLogout,
  IconSearch,
} from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import { cerrarSesionAction } from "@/app/(protegido)/cerrar-sesion";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import type { Aplicacion, Rol } from "@/lib/tipos";

const CLAVE_COLAPSADA = "core-sidebar-colapsada";
const EVENTO_COLAPSADA = "core-sidebar-colapsada-cambio";
const ANCHO_COLAPSADO = 76;
const CONSULTA_DESKTOP = "(min-width: 64rem)"; // debe calzar con el breakpoint lg: de Tailwind

// localStorage no dispara el evento "storage" en la misma pestaña que escribe,
// así que además de escuchar cambios de otras pestañas, disparamos un evento
// propio al alternar para que useSyncExternalStore vuelva a leer acá mismo.
function suscribirseColapsada(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENTO_COLAPSADA, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENTO_COLAPSADA, callback);
  };
}
function leerColapsada() {
  return localStorage.getItem(CLAVE_COLAPSADA) === "1";
}
function leerColapsadaServidor() {
  return false;
}

function suscribirseDesktop(callback: () => void) {
  const mq = window.matchMedia(CONSULTA_DESKTOP);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function leerEsDesktop() {
  return window.matchMedia(CONSULTA_DESKTOP).matches;
}
function leerEsDesktopServidor() {
  return false;
}

function esRutaActiva(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function iniciales(correo: string) {
  const nombre = correo.split("@")[0] ?? "";
  const partes = nombre.split(/[.\-_]/).filter(Boolean);
  const letras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letras.join("") || "?";
}

function clasesItem(activo: boolean, colapsado: boolean) {
  const base = "group flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition";
  const layout = colapsado ? "justify-center px-0" : "border-l-[3px] pl-[7px] pr-2.5";
  if (activo) {
    const estado = colapsado ? "bg-naranjo/10 text-naranjo" : "border-naranjo bg-naranjo/10 text-naranjo";
    return `${base} ${layout} ${estado}`;
  }
  const estado = colapsado
    ? "text-tinta/70 hover:bg-naranjo/10 hover:text-naranjo"
    : "border-transparent text-tinta/75 hover:bg-naranjo/10 hover:text-naranjo";
  return `${base} ${layout} ${estado}`;
}

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
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const pathname = usePathname();
  const esAdmin = rol === "admin";

  // Ambas usan useSyncExternalStore (no useState+useEffect) para que el
  // snapshot del servidor (siempre false) coincida con el primer render del
  // cliente y no haya hydration mismatch; React ya se encarga de re-leer tras
  // el montaje sin que el componente dispare un setState manual.
  const colapsada = useSyncExternalStore(suscribirseColapsada, leerColapsada, leerColapsadaServidor);
  const esDesktop = useSyncExternalStore(suscribirseDesktop, leerEsDesktop, leerEsDesktopServidor);
  // El colapso es una preferencia de desktop; en el drawer mobile siempre se
  // ve expandido aunque quede guardada como colapsada.
  const colapsado = colapsada && esDesktop;

  // El layout no se remonta entre navegaciones (RSC), así que sin esto el
  // menú se queda abierto tapando la página nueva después de tocar un link.
  useEffect(() => {
    setAbierta(false);
    setBuscadorAbierto(false);
  }, [pathname]);

  // Atajo global Ctrl+K / Cmd+K para abrir el buscador desde cualquier
  // página del área protegida (BarraLateral se monta una sola vez).
  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setBuscadorAbierto(true);
      }
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, []);

  function alternarColapsada() {
    localStorage.setItem(CLAVE_COLAPSADA, colapsada ? "0" : "1");
    window.dispatchEvent(new Event(EVENTO_COLAPSADA));
  }

  const contenido = (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-3 px-5 py-5 ${colapsado ? "lg:justify-center lg:px-3" : ""}`}>
        <Image
          src="/logo-pertec.png"
          alt="Performance Technologies — PERTEC"
          width={220}
          height={170}
          className="h-10 w-auto object-contain"
          priority
        />
        {!colapsado && (
          <span className="font-condensed text-base font-bold uppercase text-tinta">Core PERTEC</span>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto pb-4 ${colapsado ? "lg:px-2" : "px-3"}`}>
        <EnlaceNav
          href="/"
          activo={esRutaActiva("/", pathname)}
          icono={<IconLayoutDashboard size={18} stroke={1.75} />}
          colapsado={colapsado}
        >
          Dashboard
        </EnlaceNav>

        {colapsado ? (
          <div className="mx-1 mb-2 mt-6 border-t border-borde" />
        ) : (
          <p className="mt-6 mb-1 flex items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/45">
            <span className="h-[2px] w-3 shrink-0 rounded-full bg-naranjo/70" />
            Tus aplicaciones
          </p>
        )}
        <div className="mt-1 flex flex-col gap-0.5">
          {apps.length === 0 && !colapsado && (
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

            if (deshabilitada) {
              return (
                <span
                  key={app.id}
                  title={colapsado ? `${app.nombre} (en mantención)` : undefined}
                  className={`flex cursor-not-allowed items-center gap-2.5 rounded-lg py-2 text-sm text-tinta/35 ${
                    colapsado ? "justify-center px-0" : "px-2.5"
                  }`}
                >
                  <Icono size={17} stroke={1.75} aria-hidden />
                  {!colapsado && (
                    <>
                      <span className="flex-1 truncate">{app.nombre}</span>
                      <span className="shrink-0 rounded-full bg-gris/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gris">
                        Mantención
                      </span>
                    </>
                  )}
                </span>
              );
            }

            const activa = esRutaActiva(href, pathname);
            const clases = clasesItem(activa, colapsado);
            const titulo = colapsado ? app.nombre : undefined;

            if (app.tipo === "interna") {
              return (
                <Link key={app.id} href={href} title={titulo} className={clases}>
                  <Icono size={17} stroke={1.75} aria-hidden />
                  {!colapsado && <span className="truncate">{app.nombre}</span>}
                </Link>
              );
            }

            return (
              <a key={app.id} href={href} title={titulo} className={clases}>
                <Icono size={17} stroke={1.75} aria-hidden />
                {!colapsado && <span className="truncate">{app.nombre}</span>}
              </a>
            );
          })}
        </div>

        {esAdmin && (
          <>
            {colapsado ? (
              <div className="mx-1 mb-2 mt-6 border-t border-borde" />
            ) : (
              <p className="mt-6 mb-1 flex items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/45">
                <span className="h-[2px] w-3 shrink-0 rounded-full bg-naranjo/70" />
                Administración
              </p>
            )}
            <div className="mt-1 flex flex-col gap-0.5">
              <EnlaceNav
                href="/usuarios"
                activo={esRutaActiva("/usuarios", pathname)}
                icono={<IconUsers size={18} stroke={1.75} />}
                colapsado={colapsado}
              >
                Usuarios
              </EnlaceNav>
              <EnlaceNav
                href="/aplicaciones"
                activo={esRutaActiva("/aplicaciones", pathname)}
                icono={<IconSettings2 size={18} stroke={1.75} />}
                colapsado={colapsado}
              >
                Aplicaciones
              </EnlaceNav>
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-borde px-3 py-3">
        {colapsado ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setBuscadorAbierto(true)}
              title="Buscar"
              className="rounded-lg p-2 text-tinta/45 transition hover:bg-naranjo/10 hover:text-naranjo"
            >
              <IconSearch size={16} stroke={1.75} />
            </button>
            <div
              title={correo}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-naranjo/15 text-xs font-bold uppercase text-naranjo"
            >
              {iniciales(correo)}
            </div>
            <form action={cerrarSesionAction}>
              <button
                type="submit"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="rounded-lg p-2 text-tinta/40 transition hover:bg-naranjo/10 hover:text-naranjo"
              >
                <IconLogout size={16} stroke={1.75} />
              </button>
            </form>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setBuscadorAbierto(true)}
              title="Buscar"
              className="mb-3 flex w-full items-center gap-2.5 rounded-lg border border-borde px-2.5 py-2 text-tinta/45 transition hover:border-naranjo/30 hover:text-naranjo"
            >
              <IconSearch size={16} stroke={1.75} className="shrink-0" />
              <span className="flex-1 text-left text-sm">Buscar</span>
              <span className="shrink-0 rounded border border-borde px-1.5 py-0.5 text-[10px] font-semibold text-tinta/35">
                Ctrl K
              </span>
            </button>

            <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-naranjo/15 text-xs font-bold uppercase text-naranjo">
                {iniciales(correo)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-tinta">{correo}</p>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-teal">
                  {esAdmin ? "Administrador" : "Usuario"}
                </span>
              </div>
              <form action={cerrarSesionAction}>
                <button
                  type="submit"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                  className="shrink-0 rounded-lg p-2 text-tinta/40 transition hover:bg-naranjo/10 hover:text-naranjo"
                >
                  <IconLogout size={16} stroke={1.75} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-borde bg-crema/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        {pathname === "/" ? (
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
        ) : (
          <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-tinta">
            <IconArrowLeft size={18} stroke={2} />
            Volver al Core
          </Link>
        )}
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
        style={colapsado ? { width: ANCHO_COLAPSADO } : undefined}
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-borde bg-crema shadow-[4px_0_16px_-8px_rgba(23,20,17,0.15)] transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:translate-x-0 ${
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

        <button
          type="button"
          onClick={alternarColapsada}
          title={colapsada ? "Expandir menú" : "Colapsar menú"}
          aria-label={colapsada ? "Expandir menú" : "Colapsar menú"}
          className="absolute -right-3 top-16 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-borde bg-crema text-tinta/50 shadow-sm transition hover:border-naranjo/40 hover:text-naranjo lg:flex"
        >
          {colapsada ? <IconChevronRight size={14} stroke={2} /> : <IconChevronLeft size={14} stroke={2} />}
        </button>

        {contenido}
      </aside>

      {buscadorAbierto && (
        <BuscadorGlobal alCerrar={() => setBuscadorAbierto(false)} apps={apps} esAdmin={esAdmin} />
      )}
    </>
  );
}

function EnlaceNav({
  href,
  activo,
  icono,
  colapsado,
  children,
}: {
  href: string;
  activo: boolean;
  icono: ReactNode;
  colapsado: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} title={colapsado ? String(children) : undefined} className={clasesItem(activo, colapsado)}>
      {icono}
      {!colapsado && <span className="truncate">{children}</span>}
    </Link>
  );
}
