"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
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
import { armarMenu } from "@/lib/menu-modelo";
import { logoCompletoDe, logoDe, type Empresa } from "@/lib/empresas-modelo";
import { CLAVE_TEMA, EVENTO_TEMA } from "@/lib/tema";
import { cerrarSesionAction } from "@/app/(protegido)/cerrar-sesion";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import BuzonNotificaciones from "@/components/BuzonNotificaciones";
import { BARRA_FIJA } from "@/lib/estilos";
import type { Aplicacion, Rol } from "@/lib/tipos";
import type { ContratoDelMenu } from "@/lib/contratos/contratos";

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
 * Herramientas Finanzas no está acá a propósito, aunque también tenga pantallas adentro:
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
  contratos = [],
  mostrarBuzon = true,
  empresaActiva = null,
  subpanelesFinanzas = [],
}: {
  correo: string;
  rol: Rol;
  apps: Aplicacion[];
  /** Los contratos, para el submenú de «Contratos». */
  contratos?: ContratoDelMenu[];
  mostrarBuzon?: boolean;
  /** La empresa activa: su logo va arriba del menú. */
  empresaActiva?: Empresa | null;
  /** Los subpaneles de Finanzas que la persona tiene concedidos, para el grupo «Finanzas». */
  subpanelesFinanzas?: string[];
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
  const grupos = armarMenu(apps, subpanelesFinanzas);
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
  // El ancho de la barra, publicado como variable CSS.
  //
  // Hace falta porque la barra es FIJA: sale del flujo, así que el contenido no se
  // corre solo y hay que decirle cuánto espacio dejar (ver HUECO_DE_BARRA en
  // lib/estilos.ts). Va por una variable en <html> y no por props porque el <main> lo
  // dibuja el layout en el servidor y esto se decide acá, en el navegador. El valor
  // por omisión —16rem, el ancho expandido— está en globals.css, así que el primer
  // dibujo ya es correcto para quien no la tiene colapsada.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ancho-barra",
      colapsado ? `${ANCHO_COLAPSADO}px` : "16rem",
    );
  }, [colapsado]);

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
        <LogoDeEmpresa empresa={empresaActiva} colapsado={colapsado} tema={tema} />
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

        {apps.length === 0 && !colapsado && (
          <p className="mt-6 px-2.5 py-2 text-xs text-tinta/40">Sin aplicaciones asignadas</p>
        )}
        {grupos.map((grupo, i) => (
          <div key={grupo.titulo ?? `suelto-${i}`}>
            {colapsado ? (
              <div className="mx-1 mb-2 mt-4 border-t border-borde" />
            ) : grupo.titulo ? (
              <p className="mt-5 mb-1 flex items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/45">
                <span className="h-[2px] w-3 shrink-0 rounded-full bg-naranjo/70" />
                {grupo.titulo}
              </p>
            ) : (
              <div className="mt-4" />
            )}
            <div className="mt-1 flex flex-col gap-0.5">
              {grupo.items.map((item) => {
                if (item.tipo === "pronto") {
                  const Icono = obtenerIcono(item.icono);
                  return (
                    <span
                      key={item.nombre}
                      title={colapsado ? `${item.nombre} (próximamente)` : undefined}
                      className={`flex cursor-default items-center gap-2.5 rounded-lg py-2 text-sm text-tinta/35 ${
                        colapsado ? "justify-center px-0" : "px-2.5"
                      }`}
                    >
                      <Icono size={17} stroke={1.75} aria-hidden />
                      {!colapsado && (
                        <>
                          <span className="flex-1 truncate">{item.nombre}</span>
                          <span className="shrink-0 rounded-full bg-gris/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gris">
                            Pronto
                          </span>
                        </>
                      )}
                    </span>
                  );
                }
                if (item.tipo === "enlace") {
                  const Icono = obtenerIcono(item.icono);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={colapsado ? item.nombre : undefined}
                      className={clasesItem(esRutaActiva(item.href, pathname), colapsado)}
                    >
                      <Icono size={17} stroke={1.75} aria-hidden />
                      {!colapsado && <span className="truncate">{item.nombre}</span>}
                    </Link>
                  );
                }
                const { app, nombre } = item;
const Icono = obtenerIcono(app.icono);
                const deshabilitada = app.estado === "mantenimiento";
                const href =
                  app.tipo === "interna" ? app.url : app.url.startsWith("http") ? app.url : `https://${app.url}`;

                if (deshabilitada) {
                  return (
                    <span
                      key={app.id}
                      title={colapsado ? `${nombre} (en mantención)` : undefined}
                      className={`flex cursor-not-allowed items-center gap-2.5 rounded-lg py-2 text-sm text-tinta/35 ${
                        colapsado ? "justify-center px-0" : "px-2.5"
                      }`}
                    >
                      <Icono size={17} stroke={1.75} aria-hidden />
                      {!colapsado && (
                        <>
                          <span className="flex-1 truncate">{nombre}</span>
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
                const titulo = [nombre, app.descripcion].filter(Boolean).join(" — ");
                const secciones = SECCIONES_DE_MODULO[href] ?? [];

                if (app.tipo === "interna") {
                  return (
                    <div key={app.id}>
                      <Link href={href} title={titulo} className={clases}>
                        <Icono size={17} stroke={1.75} aria-hidden />
                        {!colapsado && <span className="truncate">{nombre}</span>}
                      </Link>
                      {/* Plegado no hay lugar para esto, y desplegarlo al pasar el mouse
                          taparía el resto del menú. */}
                      {activa && !colapsado && secciones.length > 0 && (
                        <SeccionesDelModulo secciones={secciones} base={href} pathname={pathname} />
                      )}
                      {activa && !colapsado && href === "/contratos" && (
                        <SubmenuDeContratos contratos={contratos} pathname={pathname} />
                      )}
                    </div>
                  );
                }

                return (
                  <a key={app.id} href={href} title={titulo} className={clases}>
                    <Icono size={17} stroke={1.75} aria-hidden />
                    {!colapsado && <span className="truncate">{nombre}</span>}
                  </a>
                );
              })}
            </div>
          </div>
        ))}

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

      {mostrarBuzon && (
        <div className="border-t border-borde px-3 py-2">
          <BuzonNotificaciones colapsado={colapsado} />
        </div>
      )}

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
          <div className="flex h-8 items-center [&_img]:!h-7">
            <LogoDeEmpresa empresa={empresaActiva} colapsado={false} tema={tema} />
          </div>
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
        className={`${BARRA_FIJA} border-r border-borde bg-crema shadow-[4px_0_16px_-8px_rgba(23,20,17,0.15)] ${
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

/**
 * Los contratos, colgando de «Contratos»: cada uno con su logo, y el que está abierto desplegado
 * con su Dashboard y su Carpeta de arranque, de la que cuelgan todos sus módulos.
 *
 * Es el mismo dibujo que las pantallas del Cotizador (una línea a la izquierda, texto chico), un
 * nivel más hondo por cada nivel del contrato.
 */
function SubmenuDeContratos({ contratos, pathname }: { contratos: ContratoDelMenu[]; pathname: string }) {
  const ruta = decodeURIComponent(pathname);
  const [, , abierto] = ruta.split("/");

  if (contratos.length === 0) {
    return (
      <div className="mb-1 ml-[18px] mt-0.5 border-l border-borde pl-2">
        <Link href="/contratos" className="block truncate rounded-md px-2 py-1 text-[12px] text-tinta/45 hover:text-naranjo">
          Sin contratos todavía
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-1 ml-[18px] mt-0.5 flex flex-col border-l border-borde pl-2">
      {contratos.map((c) => {
        const esAbierto = c.slug === abierto;
        return (
          <div key={c.slug}>
            <Link
              href={`/contratos/${c.slug}`}
              className={`flex items-center gap-2 truncate rounded-md px-2 py-1 text-[12px] transition ${
                esAbierto ? "font-semibold text-naranjo" : "text-tinta/60 hover:text-naranjo"
              } ${c.activo ? "" : "opacity-60"}`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px]">
                {c.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ícono de 16 px servido por el propio core
                  <img src={c.logo} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                )}
              </span>
              <span className="truncate">{c.nombre}</span>
            </Link>
            {esAbierto && <SeccionesDelContrato slug={c.slug} ruta={ruta} />}
          </div>
        );
      })}
    </div>
  );
}

/** Lo de adentro de un contrato: su Carpeta de arranque, con los módulos colgando. El Dashboard se abre desde «Status general». */
function SeccionesDelContrato({ slug, ruta }: { slug: string; ruta: string }) {
  const base = `/contratos/${slug}`;
  const modulos = [
    { href: `${base}/DOCUMENTOS GENERALES`, enlace: `${base}/DOCUMENTOS%20GENERALES`, nombre: "Documentos generales" },
    { href: `${base}/acreditacion`, enlace: `${base}/acreditacion`, nombre: "Acreditación Personas" },
    { href: `${base}/acreditacion-vehiculos`, enlace: `${base}/acreditacion-vehiculos`, nombre: "Acreditación Vehículos" },
    { href: `${base}/logistica`, enlace: `${base}/logistica`, nombre: "Logística" },
    { href: `${base}/gastos-arranque`, enlace: `${base}/gastos-arranque`, nombre: "Gastos de arranque" },
  ];
  const enDashboard = esRutaActiva(`${base}/dashboard`, ruta);
  const moduloActivo = modulos.find((m) => esRutaActiva(m.href, ruta));
  // La carpeta de arranque es la portada del contrato y todo lo que no sea el Dashboard ni un módulo
  // (las carpetas de SharePoint de primer nivel).
  const enCarpeta = !enDashboard && !moduloActivo;
  // En el Dashboard no se marca nada: no está en el menú.

  const clase = (activo: boolean) =>
    `block truncate rounded-md px-2 py-1 text-[12px] transition ${
      activo ? "font-medium text-naranjo" : "text-tinta/55 hover:text-naranjo"
    }`;

  return (
    <div className="mb-1 ml-[9px] mt-0.5 flex flex-col border-l border-borde pl-2">
      <Link href={base} className={clase(enCarpeta)}>
        Carpeta de arranque
      </Link>
      <div className="mb-1 ml-[9px] flex flex-col border-l border-borde pl-2">
        {modulos.map((m) => (
          <Link key={m.href} href={m.enlace} className={clase(m === moduloActivo)}>
            {m.nombre}
          </Link>
        ))}
      </div>
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

/**
 * Arriba del menú, el logo de la empresa activa (ya no el de Core PERTEC).
 * Plegado va solo el ícono. Sin migración corrida no hay empresa: va PERTEC.
 */
function LogoDeEmpresa({
  empresa,
  colapsado,
  tema,
}: {
  empresa: Empresa | null;
  colapsado: boolean;
  tema: "light" | "dark";
}) {
  const slug = empresa?.slug ?? "pertec";
  const nombre = empresa?.nombre ?? "Performance Technologies";
  const completo = logoCompletoDe(slug);
  const icono = logoDe({ slug, logo: empresa?.logo ?? null });

  if (colapsado || !completo) {
    if (icono) {
      // eslint-disable-next-line @next/next/no-img-element -- logo servido por el propio core
      return <img src={icono} alt={nombre} className={colapsado ? "h-10 w-auto object-contain" : "h-9 w-auto object-contain"} />;
    }
    return colapsado ? (
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-tinta/10 text-sm font-bold text-tinta/70">
        {nombre.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </span>
    ) : (
      <span className="font-condensed text-lg font-bold uppercase leading-tight text-tinta">{nombre}</span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo servido por el propio core
    <img
      src={tema === "dark" ? completo.oscuro : completo.claro}
      alt={nombre}
      // El de Zeus es un emblema (dibujo arriba, nombre abajo): pegado a la izquierda
      // se veía descentrado, así que va al medio. El de PERTEC es horizontal y se lee desde la izquierda.
      className={slug === "pertec" ? "h-9 w-auto object-contain" : "mx-auto h-14 w-auto object-contain"}
    />
  );
}
