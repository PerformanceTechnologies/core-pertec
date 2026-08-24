"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
  IconSun,
  IconMoon,
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

const CLAVE_TEMA = "core-tema";
const EVENTO_TEMA = "core-tema-cambio";

// Mismo patrón que colapsada: localStorage no avisa a la misma pestaña que
// escribe, así que se dispara un evento propio para que useSyncExternalStore
// vuelva a leer acá mismo.
function suscribirseTema(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENTO_TEMA, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENTO_TEMA, callback);
  };
}
function leerTema(): "light" | "dark" {
  return localStorage.getItem(CLAVE_TEMA) === "dark" ? "dark" : "light";
}
function leerTemaServidor(): "light" | "dark" {
  return "light";
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

/**
 * Las pantallas de adentro de un módulo, para que se vean desde el menú.
 *
 * Hasta ahora solo se llegaba a ellas desde links dentro del propio módulo, así
 * que quien entraba por primera vez no tenía forma de saber que existían: los
 * formatos de las ofertas, las empresas emisoras del cotizador y los catálogos de
 * precios estaban a un clic de distancia y a cero pistas de distancia.
 *
 * Solo se dibujan cuando el módulo está abierto: el menú tiene que decir dónde
 * estás parado, no listar todo lo que hay.
 *
 * Panel Finanzas no está acá a propósito, aunque también tenga pantallas adentro:
 * las suyas se conceden por usuario (ver lib/finanzas-subpaneles-usuario.ts, donde
 * "facturas-ih" además deniega por defecto), y listarlas sin consultar ese permiso
 * mostraría puertas cerradas. Su propia portada ya las presenta con su descripción.
 */
const SECCIONES_DE_MODULO: Record<string, { href: string; nombre: string }[]> = {
  "/ofertas": [
    { href: "/ofertas", nombre: "Ofertas" },
    { href: "/ofertas/maestros", nombre: "Maestros de formato" },
    { href: "/ofertas/logos", nombre: "Logos" },
  ],
  "/cotizador": [
    { href: "/cotizador", nombre: "Cotizaciones" },
    { href: "/cotizador/empresas", nombre: "Empresas emisoras" },
    { href: "/cotizador/catalogos", nombre: "Catálogos de precios" },
    { href: "/cotizador/parametros", nombre: "Parámetros legales" },
  ],
};

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
  // "Abierta desde" en vez de un booleano + efecto que lo resetea: al
  // guardar el pathname vigente cuando se abre, "abierta"/"buscadorAbierto"
  // se derivan comparando contra el pathname actual en cada render, así que
  // se cierran solos apenas cambia la ruta (por cualquier vía: un link del
  // nav, una tarjeta del dashboard, un resultado del buscador, atrás/adelante
  // del navegador) sin necesitar un useEffect que llame setState.
  const [abiertaDesde, setAbiertaDesde] = useState<string | null>(null);
  const [buscadorAbiertoDesde, setBuscadorAbiertoDesde] = useState<string | null>(null);
  const pathname = usePathname();
  const esAdmin = rol === "admin";
  const abierta = abiertaDesde === pathname;
  const buscadorAbierto = buscadorAbiertoDesde === pathname;

  function abrirMenu() {
    setAbiertaDesde(pathname);
  }
  function cerrarMenu() {
    setAbiertaDesde(null);
  }
  // useCallback (no una función plana) porque el atajo Ctrl+K la usa dentro
  // de un efecto: así su referencia solo cambia junto con "pathname" y ese
  // efecto no tiene que re-registrar el listener en cada render.
  const abrirBuscador = useCallback(() => {
    setBuscadorAbiertoDesde(pathname);
  }, [pathname]);
  function cerrarBuscador() {
    setBuscadorAbiertoDesde(null);
  }

  // Ambas usan useSyncExternalStore (no useState+useEffect) para que el
  // snapshot del servidor (siempre false) coincida con el primer render del
  // cliente y no haya hydration mismatch; React ya se encarga de re-leer tras
  // el montaje sin que el componente dispare un setState manual.
  const colapsada = useSyncExternalStore(suscribirseColapsada, leerColapsada, leerColapsadaServidor);
  const esDesktop = useSyncExternalStore(suscribirseDesktop, leerEsDesktop, leerEsDesktopServidor);
  const tema = useSyncExternalStore(suscribirseTema, leerTema, leerTemaServidor);
  // El colapso es una preferencia de desktop; en el drawer mobile siempre se
  // ve expandido aunque quede guardada como colapsada.
  const colapsado = colapsada && esDesktop;

  // Sincroniza el atributo que globals.css usa para pintar el tema oscuro.
  // No guarda estado de React, solo refleja "tema" hacia afuera -- uso
  // legítimo de efecto (el script sin-flash de app/layout.tsx ya deja esto
  // bien en el primer paint; esto solo lo mantiene al cambiar en caliente).
  useEffect(() => {
    if (tema === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }, [tema]);

  // Atajo global Ctrl+K / Cmd+K para abrir el buscador desde cualquier
  // página del área protegida.
  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        abrirBuscador();
      }
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abrirBuscador]);

  function alternarColapsada() {
    localStorage.setItem(CLAVE_COLAPSADA, colapsada ? "0" : "1");
    window.dispatchEvent(new Event(EVENTO_COLAPSADA));
  }

  function alternarTema() {
    localStorage.setItem(CLAVE_TEMA, tema === "dark" ? "light" : "dark");
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }

  const contenido = (
    <div className="flex h-full flex-col">
      <div className={`flex items-center px-5 py-5 ${colapsado ? "lg:justify-center lg:px-3" : ""}`}>
        {colapsado ? (
          <Image
            src="/logo-pertec.png"
            alt="Performance Technologies — PERTEC"
            width={220}
            height={170}
            className="h-10 w-auto object-contain"
            priority
          />
        ) : (
          <Image
            src="/corepertec.png"
            alt="Core PERTEC"
            width={927}
            height={324}
            className="h-8 w-auto object-contain"
            priority
          />
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
              app.tipo === "interna" ? app.url : app.url.startsWith("http") ? app.url : `https://${app.url}`;

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
            // La descripción de la app, en el tooltip: "Panel Odoo" o "Cotizador"
            // no dicen mucho de afuera, y el dato ya está cargado.
            const titulo = [app.nombre, app.descripcion].filter(Boolean).join(" — ");
            const secciones = SECCIONES_DE_MODULO[href] ?? [];

            if (app.tipo === "interna") {
              return (
                <div key={app.id}>
                  <Link href={href} title={titulo} className={clases}>
                    <Icono size={17} stroke={1.75} aria-hidden />
                    {!colapsado && <span className="truncate">{app.nombre}</span>}
                  </Link>
                  {/* Plegado no hay lugar para esto, y desplegarlo al pasar el mouse
                      taparía el resto del menú. */}
                  {activa && !colapsado && secciones.length > 0 && (
                    <SeccionesDelModulo secciones={secciones} base={href} pathname={pathname} />
                  )}
                </div>
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
              onClick={abrirBuscador}
              title="Buscar"
              className="rounded-lg p-2 text-tinta/45 transition hover:bg-naranjo/10 hover:text-naranjo"
            >
              <IconSearch size={16} stroke={1.75} />
            </button>
            <button
              type="button"
              onClick={alternarTema}
              title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className="rounded-lg p-2 text-tinta/45 transition hover:bg-naranjo/10 hover:text-naranjo"
            >
              {tema === "dark" ? <IconSun size={16} stroke={1.75} /> : <IconMoon size={16} stroke={1.75} />}
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
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={abrirBuscador}
                title="Buscar"
                className="flex flex-1 items-center gap-2.5 rounded-lg border border-borde px-2.5 py-2 text-tinta/45 transition hover:border-naranjo/30 hover:text-naranjo"
              >
                <IconSearch size={16} stroke={1.75} className="shrink-0" />
                <span className="flex-1 text-left text-sm">Buscar</span>
                <span className="shrink-0 rounded border border-borde px-1.5 py-0.5 text-[10px] font-semibold text-tinta/35">
                  Ctrl K
                </span>
              </button>
              <button
                type="button"
                onClick={alternarTema}
                title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                className="shrink-0 rounded-lg border border-borde p-2 text-tinta/45 transition hover:border-naranjo/30 hover:text-naranjo"
              >
                {tema === "dark" ? <IconSun size={16} stroke={1.75} /> : <IconMoon size={16} stroke={1.75} />}
              </button>
            </div>

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
          <Image
            src="/corepertec.png"
            alt="Core PERTEC"
            width={927}
            height={324}
            className="h-7 w-auto object-contain"
          />
        ) : (
          <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold text-tinta">
            <IconArrowLeft size={18} stroke={2} />
            Volver al Core
          </Link>
        )}
        <button
          type="button"
          onClick={abrirMenu}
          aria-label="Abrir menú"
          className="rounded-lg border border-borde p-2 text-tinta/70"
        >
          <IconMenu2 size={18} stroke={1.75} />
        </button>
      </div>

      {abierta && <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={cerrarMenu} />}

      <aside
        style={colapsado ? { width: ANCHO_COLAPSADO } : undefined}
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-borde bg-crema shadow-[4px_0_16px_-8px_rgba(23,20,17,0.15)] transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:translate-x-0 ${
          abierta ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={cerrarMenu}
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

      {buscadorAbierto && <BuscadorGlobal alCerrar={cerrarBuscador} apps={apps} esAdmin={esAdmin} />}
    </>
  );
}

/**
 * Las pantallas del módulo abierto, colgando de él.
 *
 * La primera es la portada del módulo y las demás son sus pantallas internas. Se
 * marca activa la interna que calce, y si no calza ninguna, la portada: sin eso,
 * "Ofertas" quedaba encendida también estando en Maestros, porque su ruta es
 * prefijo de todas las de adentro.
 */
function SeccionesDelModulo({
  secciones,
  base,
  pathname,
}: {
  secciones: { href: string; nombre: string }[];
  base: string;
  pathname: string;
}) {
  const interna = secciones.find((s) => s.href !== base && esRutaActiva(s.href, pathname));
  const activa = interna?.href ?? base;

  return (
    <div className="mb-1 ml-[18px] mt-0.5 flex flex-col border-l border-borde pl-2">
      {secciones.map((seccion) => (
        <Link
          key={seccion.href}
          href={seccion.href}
          className={`truncate rounded-md px-2 py-1 text-[12px] transition ${
            seccion.href === activa ? "font-medium text-naranjo" : "text-tinta/55 hover:text-naranjo"
          }`}
        >
          {seccion.nombre}
        </Link>
      ))}
    </div>
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
    <Link
      href={href}
      title={colapsado ? String(children) : undefined}
      className={clasesItem(activo, colapsado)}
    >
      {icono}
      {!colapsado && <span className="truncate">{children}</span>}
    </Link>
  );
}
