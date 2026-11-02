"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconMenu2,
  IconX,
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconLogout,
  IconSearch,
  IconSun,
  IconMoon,
  type Icon,
} from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import { iconoDeModulo, IconoInicio } from "@/lib/iconos-menu";
import {
  armarMenu,
  rutaDeModulo,
  SECCIONES_DE_MODULO,
  type GrupoDelMenu,
  type ItemDelMenu,
} from "@/lib/menu-modelo";
import { logoCompletoDe, logoDe, type Empresa } from "@/lib/empresas-modelo";
import { CLAVE_TEMA, EVENTO_TEMA } from "@/lib/tema";
import { cerrarSesionAction } from "@/app/(protegido)/cerrar-sesion";
import BuscadorGlobal from "@/components/BuscadorGlobal";
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

// ── Estilos compartidos del menú ────────────────────────────────────────────
//
// Tres niveles, que se distinguen a propósito por TRES cosas a la vez (no solo por el color):
//   1. MÓDULO (Finanzas, CRM…): ficha con ícono, mayúsculas condensadas, nombre que lleva a su página.
//   2. SUBMÓDULO (una aplicación): cuelga de una línea guía, texto normal, ícono chico.
//   3. SECCIÓN (una pantalla de adentro): una línea guía más hondo, texto más chico, sin ícono.
// Todo se anima con las mismas dos duraciones (150 ms los colores, 200 ms lo que se despliega) y
// con `motion-reduce` se apaga: es movimiento que explica un cambio de estado, no decoración.

const FOCO = "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-naranjo";
const TRANSICION = "transition-colors duration-150 ease-out motion-reduce:transition-none";
const ROTULO_MODULO = "truncate font-condensed text-[13px] font-bold uppercase tracking-[0.08em]";

/** Los controles que reparten el estado desplegado/plegado del menú. */
interface Despliegue {
  /** ¿Está abierto? `porDefecto` manda mientras la persona no lo haya tocado. */
  abierto: (clave: string, porDefecto: boolean) => boolean;
  alternar: (clave: string, porDefecto: boolean) => void;
  /** Abre sin alternar: lo que hace tocar el nombre de un módulo. */
  abrir: (clave: string) => void;
}

export interface PropsBarraLateral {
  correo: string;
  rol: Rol;
  apps: Aplicacion[];
  /** Los contratos, para el submenú de «Contratos». */
  contratos?: ContratoDelMenu[];
  /** La empresa activa: su logo va arriba del menú. */
  empresaActiva?: Empresa | null;
  /** Los subpaneles de Finanzas que la persona tiene concedidos, para el módulo «Finanzas». */
  subpanelesFinanzas?: string[];
}

/**
 * La barra lateral. Lee la ruta del navegador y se la pasa a BarraLateralVista, que es la que
 * dibuja: así la vista se puede montar en cualquier ruta (pruebas visuales) sin simular el router.
 */
export default function BarraLateral(props: PropsBarraLateral) {
  const pathname = usePathname();
  return <BarraLateralVista {...props} pathname={pathname} />;
}

export function BarraLateralVista({
  correo,
  rol,
  apps,
  contratos = [],
  empresaActiva = null,
  subpanelesFinanzas = [],
  pathname,
}: PropsBarraLateral & { pathname: string }) {
  // "Abierta desde" en vez de un booleano + efecto que lo resetea: al
  // guardar el pathname vigente cuando se abre, "abierta"/"buscadorAbierto"
  // se derivan comparando contra el pathname actual en cada render, así que
  // se cierran solos apenas cambia la ruta (por cualquier vía: un link del
  // nav, una tarjeta del dashboard, un resultado del buscador, atrás/adelante
  // del navegador) sin necesitar un useEffect que llame setState.
  const [abiertaDesde, setAbiertaDesde] = useState<string | null>(null);
  const [buscadorAbiertoDesde, setBuscadorAbiertoDesde] = useState<string | null>(null);
  const esAdmin = rol === "admin";
  const grupos = armarMenu(apps, subpanelesFinanzas, { admin: esAdmin });
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

  // Qué está desplegado, por clave (`modulo:<slug>`, `app:<ruta>`, `contrato:<slug>`). Arranca
  // vacío: al cargar, todos los módulos aparecen minimizados. Lo que la persona toca queda
  // guardado acá y manda sobre el valor por omisión, de modo que el botón de plegar SIEMPRE
  // funciona, incluso en lo que contiene la página abierta. Es estado de React y no de
  // localStorage a propósito: la barra vive en el layout, así que navegar entre páginas no lo
  // pierde, pero recargar vuelve a dejar todo minimizado.
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const despliegue: Despliegue = {
    abierto: (clave, porDefecto) => tocados[clave] ?? porDefecto,
    alternar: (clave, porDefecto) => setTocados((t) => ({ ...t, [clave]: !(t[clave] ?? porDefecto) })),
    abrir: (clave) => setTocados((t) => (t[clave] ? t : { ...t, [clave]: true })),
  };

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
        <LogoDeEmpresa empresa={empresaActiva} colapsado={colapsado} tema={tema} />
      </div>

      {/* El desvanecido de arriba y abajo avisa que la lista sigue cuando no cabe entera. El
          padding de arriba (pt-3) es del mismo alto que el desvanecido: así el primer renglón
          nunca queda debajo de él. */}
      <nav
        aria-label="Principal"
        className={`flex-1 overflow-y-auto pb-4 pt-3 [scrollbar-color:var(--color-borde)_transparent] [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%_-_16px),transparent)] ${
          colapsado ? "lg:px-2" : "px-3"
        }`}
      >
        {colapsado ? (
          <NavegacionColapsada grupos={grupos} pathname={pathname} />
        ) : (
          <>
            <FilaDeInicio activa={esRutaActiva("/", pathname)} />

            {apps.length === 0 && (
              <p className="mt-6 px-2.5 py-2 text-xs text-tinta/40">Sin aplicaciones asignadas</p>
            )}

            <div className="mt-3 flex flex-col gap-1">
              {grupos.map((grupo) => (
                <Modulo
                  key={grupo.slug}
                  grupo={grupo}
                  pathname={pathname}
                  contratos={contratos}
                  despliegue={despliegue}
                  // Administración se separa del resto: es de otra naturaleza (configura el Core).
                  separado={grupo.slug === "administracion"}
                />
              ))}
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
              className={`rounded-xl p-2 text-tinta/45 hover:bg-naranjo/10 hover:text-naranjo ${TRANSICION} ${FOCO}`}
            >
              <IconSearch size={16} stroke={1.75} />
            </button>
            <button
              type="button"
              onClick={alternarTema}
              title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className={`rounded-xl p-2 text-tinta/45 hover:bg-naranjo/10 hover:text-naranjo ${TRANSICION} ${FOCO}`}
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
                className={`rounded-xl p-2 text-tinta/40 hover:bg-naranjo/10 hover:text-naranjo ${TRANSICION} ${FOCO}`}
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
                className={`flex flex-1 items-center gap-2.5 rounded-xl border border-borde bg-superficie/60 px-2.5 py-2 text-tinta/45 hover:border-naranjo/30 hover:text-naranjo ${TRANSICION} ${FOCO}`}
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
                className={`shrink-0 rounded-xl border border-borde bg-superficie/60 p-2 text-tinta/45 hover:border-naranjo/30 hover:text-naranjo ${TRANSICION} ${FOCO}`}
              >
                {tema === "dark" ? <IconSun size={16} stroke={1.75} /> : <IconMoon size={16} stroke={1.75} />}
              </button>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
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
                  className={`shrink-0 rounded-xl p-2 text-tinta/40 hover:bg-naranjo/10 hover:text-naranjo ${TRANSICION} ${FOCO}`}
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
        className={`${BARRA_FIJA} border-r border-borde bg-crema shadow-[4px_0_24px_-12px_rgba(23,20,17,0.18)] ${
          abierta ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* El resplandor de la marca de la empresa activa, arriba: es lo que hace que se lea como
            una barra con carácter y no como una lista pegada al borde. Va detrás de todo. */}
        <div aria-hidden className="barra-brillo pointer-events-none absolute inset-x-0 top-0 -z-10 h-56" />

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
 * Una región que se pliega con animación.
 *
 * Anima `grid-template-rows` (0fr → 1fr) y no `height`: así no hace falta medir el contenido y
 * el navegador resuelve el alto real. Plegada queda `inert`, que la saca del orden del teclado y
 * de los lectores de pantalla: sin eso se podría tabular a links que no se ven.
 */
function Colapsable({ abierto, id, children }: { abierto: boolean; id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!abierto}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
        abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** El id de la región que controla un botón de plegar, a partir de la clave del menú. */
function idDeRegion(clave: string) {
  return `region-${clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/** La flechita que pliega y despliega. SIEMPRE alterna: el valor por omisión solo manda hasta el primer toque. */
function BotonDeDespliegue({
  abierto,
  clave,
  etiqueta,
  alAlternar,
}: {
  abierto: boolean;
  clave: string;
  etiqueta: string;
  alAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={alAlternar}
      aria-expanded={abierto}
      aria-controls={idDeRegion(clave)}
      aria-label={`${abierto ? "Plegar" : "Desplegar"} ${etiqueta}`}
      className={`mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-tinta/35 hover:bg-tinta/[0.07] hover:text-tinta/70 ${TRANSICION} ${FOCO}`}
    >
      <IconChevronDown
        size={15}
        stroke={2}
        aria-hidden
        className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${abierto ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

/**
 * La ficha del ícono de un módulo: un cuadrado redondeado. Es lo que dice "esto es un módulo"
 * de un vistazo, y lo que no tienen los submódulos (que llevan el ícono suelto).
 *
 *  - `activa`: la página abierta ES esta (la portada del módulo, o Inicio): ficha llena.
 *  - `resaltada`: la página abierta cuelga de este módulo: ficha teñida.
 */
function Ficha({ icono: Icono, activa, resaltada = false }: { icono: Icon; activa: boolean; resaltada?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 motion-reduce:transition-none ${
        activa
          ? "bg-naranjo text-white shadow-sm shadow-naranjo/30"
          : resaltada
            ? "bg-naranjo/15 text-naranjo"
            : "bg-tinta/[0.06] text-tinta/60 group-hover/fila:bg-naranjo/10 group-hover/fila:text-naranjo"
      }`}
    >
      <Icono size={16} stroke={1.9} aria-hidden />
    </span>
  );
}

/** «Inicio»: la portada del Core. Misma ficha y mismo rótulo que un módulo, para que se lea del mismo nivel. */
function FilaDeInicio({ activa }: { activa: boolean }) {
  return (
    <Link
      href="/"
      aria-current={activa ? "page" : undefined}
      className={`group/fila flex items-center gap-2.5 rounded-xl py-2 pl-1.5 pr-2.5 lg:py-1.5 ${TRANSICION} ${FOCO} ${
        activa ? "bg-naranjo/10" : "hover:bg-tinta/[0.04]"
      }`}
    >
      <Ficha icono={IconoInicio} activa={activa} />
      <span className={`${ROTULO_MODULO} ${activa ? "text-naranjo" : "text-tinta/80"}`}>Inicio</span>
    </Link>
  );
}

/**
 * Un MÓDULO del menú: su nombre lleva a su página (con los submódulos como cartillas) y,
 * además, abre su lista acá. La flecha de la derecha solo pliega o despliega, sin navegar.
 */
function Modulo({
  grupo,
  pathname,
  contratos,
  despliegue,
  separado,
}: {
  grupo: GrupoDelMenu;
  pathname: string;
  contratos: ContratoDelMenu[];
  despliegue: Despliegue;
  separado: boolean;
}) {
  const clave = `modulo:${grupo.slug}`;
  const ruta = rutaDeModulo(grupo.slug);
  const enPortada = pathname === ruta;
  // La página abierta cuelga de este módulo. Plegado, el módulo se marca igual: si no, no habría
  // cómo saber dónde está uno parado sin desplegar todo.
  const conActiva = grupo.items.some(
    (it) =>
      (it.tipo === "enlace" && esRutaActiva(it.href, pathname)) ||
      (it.tipo === "app" && it.app.tipo === "interna" && esRutaActiva(it.app.url, pathname)),
  );
  const abierto = despliegue.abierto(clave, false);
  const Icono = iconoDeModulo(grupo.slug);

  return (
    <div className={separado ? "mt-3 border-t border-borde pt-4" : undefined}>
      <div
        className={`group/fila flex items-center rounded-xl ${TRANSICION} ${
          enPortada ? "bg-naranjo/10" : "hover:bg-tinta/[0.04]"
        }`}
      >
        <Link
          href={ruta}
          onClick={() => despliegue.abrir(clave)}
          aria-current={enPortada ? "page" : undefined}
          title={grupo.descripcion}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pl-1.5 pr-1 lg:py-1.5 ${FOCO}`}
        >
          <Ficha icono={Icono} activa={enPortada} resaltada={conActiva} />
          <span className={`${ROTULO_MODULO} ${enPortada || conActiva ? "text-naranjo" : "text-tinta/80"}`}>
            {grupo.titulo}
          </span>
        </Link>
        <BotonDeDespliegue
          abierto={abierto}
          clave={clave}
          etiqueta={grupo.titulo}
          alAlternar={() => despliegue.alternar(clave, false)}
        />
      </div>

      <Colapsable abierto={abierto} id={idDeRegion(clave)}>
        {/* La línea guía queda justo debajo del centro de la ficha del módulo: de ahí "cuelgan" los submódulos. */}
        <div className="ml-[19px] flex flex-col gap-0.5 border-l border-borde pb-1 pl-2 pt-1">
          {grupo.items.map((item) => (
            <Submodulo
              key={itemClave(item)}
              item={item}
              pathname={pathname}
              contratos={contratos}
              despliegue={despliegue}
            />
          ))}
        </div>
      </Colapsable>
    </div>
  );
}

function itemClave(item: ItemDelMenu) {
  return item.tipo === "app" ? item.app.id : item.tipo === "enlace" ? item.href : `pronto-${item.nombre}`;
}

/**
 * El fondo, el marcador y el enlace de una fila de submódulo. El marcador naranjo sobre la línea
 * guía (barrita de 3 px) es lo que dice "estás acá": crece desde el centro al activarse.
 */
function FilaDeSubmodulo({
  activa,
  href,
  externo = false,
  titulo,
  icono: Icono,
  nombre,
  extra,
}: {
  activa: boolean;
  href: string;
  externo?: boolean;
  titulo?: string;
  icono: Icon;
  nombre: string;
  /** Lo que va a la derecha de la fila (la flechita de plegar). */
  extra?: ReactNode;
}) {
  const clasesEnlace = `group/item flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-[13px] lg:py-1.5 ${FOCO} ${
    activa ? "font-semibold text-naranjo" : "font-medium text-tinta/70 group-hover/fila:text-tinta"
  }`;
  const contenido = (
    <>
      <Icono
        size={16}
        stroke={1.75}
        aria-hidden
        className={`shrink-0 transition-colors duration-150 motion-reduce:transition-none ${
          activa ? "" : "text-tinta/45 group-hover/item:text-naranjo"
        }`}
      />
      <span className="truncate">{nombre}</span>
    </>
  );
  return (
    <div
      className={`group/fila relative flex items-center rounded-lg ${TRANSICION} ${
        activa ? "bg-naranjo/10" : "hover:bg-tinta/[0.04]"
      }`}
    >
      <span
        aria-hidden
        className={`absolute -left-[10px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-naranjo transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${
          activa ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
        }`}
      />
      {externo ? (
        <a href={href} title={titulo} className={clasesEnlace}>
          {contenido}
        </a>
      ) : (
        <Link href={href} title={titulo} aria-current={activa ? "page" : undefined} className={clasesEnlace}>
          {contenido}
        </Link>
      )}
      {extra}
    </div>
  );
}

/** Una fila que no se puede abrir (próximamente, en mantención): sin enlace, apagada y con su insignia. */
function FilaApagada({ icono: Icono, nombre, insignia, titulo }: { icono: Icon; nombre: string; insignia: string; titulo: string }) {
  return (
    <span
      title={titulo}
      className="flex cursor-default items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-[13px] text-tinta/35 lg:py-1.5"
    >
      <Icono size={16} stroke={1.75} aria-hidden className="shrink-0" />
      <span className="flex-1 truncate">{nombre}</span>
      <span className="shrink-0 rounded-full bg-gris/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gris">
        {insignia}
      </span>
    </span>
  );
}

/** Un SUBMÓDULO: una aplicación o pantalla que cuelga de un módulo. Si tiene pantallas adentro, se pliega. */
function Submodulo({
  item,
  pathname,
  contratos,
  despliegue,
}: {
  item: ItemDelMenu;
  pathname: string;
  contratos: ContratoDelMenu[];
  despliegue: Despliegue;
}) {
  if (item.tipo === "pronto") {
    return <FilaApagada icono={obtenerIcono(item.icono)} nombre={item.nombre} insignia="Pronto" titulo={`${item.nombre} (próximamente)`} />;
  }

  if (item.tipo === "enlace") {
    return (
      <FilaDeSubmodulo
        activa={esRutaActiva(item.href, pathname)}
        href={item.href}
        titulo={item.descripcion ? `${item.nombre} — ${item.descripcion}` : item.nombre}
        icono={obtenerIcono(item.icono)}
        nombre={item.nombre}
      />
    );
  }

  const { app, nombre } = item;
  const Icono = obtenerIcono(app.icono);
  if (app.estado === "mantenimiento") {
    return <FilaApagada icono={Icono} nombre={nombre} insignia="Mantención" titulo={`${nombre} (en mantención)`} />;
  }

  const href = app.tipo === "interna" ? app.url : app.url.startsWith("http") ? app.url : `https://${app.url}`;
  // La descripción de la app, en el tooltip: "Rendir Gastos" o "Cotizador" no dicen mucho de
  // afuera, y el dato ya está cargado.
  const titulo = [nombre, app.descripcion].filter(Boolean).join(" — ");
  const activa = esRutaActiva(href, pathname);

  if (app.tipo !== "interna") {
    return <FilaDeSubmodulo activa={false} href={href} externo titulo={titulo} icono={Icono} nombre={nombre} />;
  }

  const secciones = SECCIONES_DE_MODULO[href] ?? [];
  const esContratos = href === "/contratos";
  const tieneHijos = secciones.length > 0 || esContratos;
  if (!tieneHijos) {
    return <FilaDeSubmodulo activa={activa} href={href} titulo={titulo} icono={Icono} nombre={nombre} />;
  }

  // Abierto por omisión solo si es donde está la persona; después manda lo que toque.
  const clave = `app:${href}`;
  const abierto = despliegue.abierto(clave, activa);
  return (
    <div>
      <FilaDeSubmodulo
        activa={activa}
        href={href}
        titulo={titulo}
        icono={Icono}
        nombre={nombre}
        extra={
          <BotonDeDespliegue
            abierto={abierto}
            clave={clave}
            etiqueta={nombre}
            alAlternar={() => despliegue.alternar(clave, activa)}
          />
        }
      />
      <Colapsable abierto={abierto} id={idDeRegion(clave)}>
        {esContratos ? (
          <SubmenuDeContratos contratos={contratos} pathname={pathname} despliegue={despliegue} />
        ) : (
          <SeccionesDelSubmodulo secciones={secciones} base={href} pathname={pathname} />
        )}
      </Colapsable>
    </div>
  );
}

/** El estilo de una SECCIÓN (el nivel más hondo): texto chico, sin ícono, con su propia línea guía. */
function claseDeSeccion(activa: boolean) {
  return `relative block truncate rounded-md py-1 pl-1.5 pr-1.5 text-[12px] ${TRANSICION} ${FOCO} ${
    activa ? "bg-naranjo/10 font-semibold text-naranjo" : "text-tinta/55 hover:bg-tinta/[0.04] hover:text-naranjo"
  }`;
}

/**
 * Las pantallas del submódulo, colgando de él.
 *
 * La primera es la portada del submódulo y las demás son sus pantallas internas. Se marca activa
 * la interna que calce, y si no calza ninguna, la portada: sin eso, "Ofertas" quedaba encendida
 * también estando en Maestros, porque su ruta es prefijo de todas las de adentro.
 */
function SeccionesDelSubmodulo({
  secciones,
  base,
  pathname,
}: {
  secciones: { href: string; nombre: string }[];
  base: string;
  pathname: string;
}) {
  const interna = secciones.find((s) => s.href !== base && esRutaActiva(s.href, pathname));
  // Solo se marca alguna si la persona está dentro del submódulo: afuera, ninguna.
  const activa = esRutaActiva(base, pathname) ? (interna?.href ?? base) : null;

  return (
    <div className="mb-1 ml-[13px] mt-0.5 flex flex-col gap-px border-l border-borde pl-2">
      {secciones.map((seccion) => (
        <Link
          key={seccion.href}
          href={seccion.href}
          title={seccion.nombre}
          aria-current={seccion.href === activa ? "page" : undefined}
          className={claseDeSeccion(seccion.href === activa)}
        >
          {seccion.nombre}
        </Link>
      ))}
    </div>
  );
}

/**
 * Los contratos, colgando de «Contratos»: cada uno con su logo, y el que está abierto desplegado
 * con su Carpeta de arranque, de la que cuelgan todos sus módulos. Cada contrato se pliega solo.
 *
 * Es el mismo dibujo que las secciones de los demás submódulos (una línea a la izquierda, texto
 * chico), un nivel más hondo por cada nivel del contrato.
 */
function SubmenuDeContratos({
  contratos,
  pathname,
  despliegue,
}: {
  contratos: ContratoDelMenu[];
  pathname: string;
  despliegue: Despliegue;
}) {
  const ruta = decodeURIComponent(pathname);
  // Solo dentro de /contratos/<contrato>/…: en otra ruta ningún contrato está "abierto".
  const abierto = ruta.startsWith("/contratos/") ? ruta.split("/")[2] : undefined;

  if (contratos.length === 0) {
    return (
      <div className="mb-1 ml-[13px] mt-0.5 border-l border-borde pl-2">
        <Link href="/contratos" className={claseDeSeccion(false)}>
          Sin contratos todavía
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-1 ml-[13px] mt-0.5 flex flex-col gap-px border-l border-borde pl-2">
      {contratos.map((c) => {
        const esAbierto = c.slug === abierto;
        const clave = `contrato:${c.slug}`;
        const desplegado = despliegue.abierto(clave, esAbierto);
        return (
          <div key={c.slug}>
            <div
              className={`group/fila flex items-center rounded-md ${TRANSICION} ${
                esAbierto ? "bg-naranjo/10" : "hover:bg-tinta/[0.04]"
              } ${c.activo ? "" : "opacity-60"}`}
            >
              <Link
                href={`/contratos/${c.slug}`}
                aria-current={esAbierto ? "page" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-1.5 pr-1 text-[12px] ${FOCO} ${
                  esAbierto ? "font-semibold text-naranjo" : "text-tinta/60 group-hover/fila:text-naranjo"
                }`}
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
              <BotonDeDespliegue
                abierto={desplegado}
                clave={clave}
                etiqueta={c.nombre}
                alAlternar={() => despliegue.alternar(clave, esAbierto)}
              />
            </div>
            <Colapsable abierto={desplegado} id={idDeRegion(clave)}>
              <SeccionesDelContrato slug={c.slug} ruta={ruta} />
            </Colapsable>
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
  const dentro = esRutaActiva(base, ruta);
  const enDashboard = esRutaActiva(`${base}/dashboard`, ruta);
  const moduloActivo = modulos.find((m) => esRutaActiva(m.href, ruta));
  // La carpeta de arranque es la portada del contrato y todo lo que no sea el Dashboard ni un módulo
  // (las carpetas de SharePoint de primer nivel). Solo se marca si la persona está en ESTE contrato.
  const enCarpeta = dentro && !enDashboard && !moduloActivo;
  // En el Dashboard no se marca nada: no está en el menú.

  return (
    <div className="mb-1 ml-[9px] mt-0.5 flex flex-col gap-px border-l border-borde pl-1.5">
      <Link href={base} className={claseDeSeccion(enCarpeta)}>
        Carpeta de arranque
      </Link>
      <div className="mb-1 ml-[6px] flex flex-col gap-px border-l border-borde pl-1.5">
        {modulos.map((m) => (
          <Link key={m.href} href={m.enlace} title={m.nombre} className={claseDeSeccion(dentro && m === moduloActivo)}>
            {m.nombre}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * El menú con la barra en modo íconos: sin títulos que plegar, cada módulo es un tramo separado
 * por una línea y sus submódulos van como íconos sueltos (el nombre sale en el tooltip). Para
 * ver las cartillas de un módulo, se expande la barra.
 */
function NavegacionColapsada({ grupos, pathname }: { grupos: GrupoDelMenu[]; pathname: string }) {
  const clases = (activo: boolean) =>
    `group flex items-center justify-center rounded-xl py-2 ${TRANSICION} ${FOCO} ${
      activo ? "bg-naranjo/10 text-naranjo" : "text-tinta/70 hover:bg-naranjo/10 hover:text-naranjo"
    }`;
  const inicio = esRutaActiva("/", pathname);

  return (
    <div className="flex flex-col gap-0.5">
      <Link href="/" title="Inicio" aria-label="Inicio" aria-current={inicio ? "page" : undefined} className={clases(inicio)}>
        <IconoInicio size={18} stroke={1.75} aria-hidden />
      </Link>
      {grupos.map((grupo) => (
        <div key={grupo.slug} className="flex flex-col gap-0.5">
          <div className="mx-1 mb-1 mt-3 border-t border-borde" />
          {grupo.items.map((item) => {
            if (item.tipo === "pronto") {
              const Icono = obtenerIcono(item.icono);
              return (
                <span
                  key={item.nombre}
                  title={`${item.nombre} (próximamente)`}
                  className="flex cursor-default items-center justify-center py-2 text-tinta/35"
                >
                  <Icono size={17} stroke={1.75} aria-hidden />
                </span>
              );
            }
            if (item.tipo === "enlace") {
              const Icono = obtenerIcono(item.icono);
              const activo = esRutaActiva(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.nombre}
                  aria-label={item.nombre}
                  aria-current={activo ? "page" : undefined}
                  className={clases(activo)}
                >
                  <Icono size={17} stroke={1.75} aria-hidden />
                </Link>
              );
            }
            const { app, nombre } = item;
            const Icono = obtenerIcono(app.icono);
            if (app.estado === "mantenimiento") {
              return (
                <span
                  key={app.id}
                  title={`${nombre} (en mantención)`}
                  className="flex cursor-not-allowed items-center justify-center py-2 text-tinta/35"
                >
                  <Icono size={17} stroke={1.75} aria-hidden />
                </span>
              );
            }
            const href = app.tipo === "interna" ? app.url : app.url.startsWith("http") ? app.url : `https://${app.url}`;
            const titulo = [nombre, app.descripcion].filter(Boolean).join(" — ");
            if (app.tipo !== "interna") {
              return (
                <a key={app.id} href={href} title={titulo} aria-label={nombre} className={clases(false)}>
                  <Icono size={17} stroke={1.75} aria-hidden />
                </a>
              );
            }
            const activo = esRutaActiva(href, pathname);
            return (
              <Link
                key={app.id}
                href={href}
                title={titulo}
                aria-label={nombre}
                aria-current={activo ? "page" : undefined}
                className={clases(activo)}
              >
                <Icono size={17} stroke={1.75} aria-hidden />
              </Link>
            );
          })}
        </div>
      ))}
    </div>
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
      // Los tres son horizontales (emblema a la izquierda, nombre a la derecha) y se
      // leen desde la izquierda, a la misma altura.
      className="h-9 w-auto object-contain"
    />
  );
}
