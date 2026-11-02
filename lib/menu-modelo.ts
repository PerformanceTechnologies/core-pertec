// Cómo se agrupa el menú de la izquierda.
//
// Sin "server-only": lo usa la barra (cliente) y la página de cada módulo (servidor). Las
// aplicaciones siguen viniendo de la tabla `aplicaciones` con sus permisos de siempre; acá
// solo se decide en qué grupo cae cada una y con qué nombre. Se reconocen por su ruta
// (`url`), no por el slug: el slug de Postulaciones es "panel-de-postulacion-laboral" y su
// ruta /reclutamiento, y la ruta es lo que de verdad abre.
//
// Vocabulario (el mismo en el menú y en las páginas):
//   - MÓDULO: cada grupo del menú (Finanzas, CRM, Página web…). Tiene su propia página,
//     /modulos/<slug>, que muestra sus submódulos como cartillas.
//   - SUBMÓDULO: cada aplicación o pantalla que cuelga de un módulo.
//   - SECCIÓN: las pantallas de adentro de un submódulo (ver SECCIONES_DE_MODULO).

import type { Aplicacion } from "./tipos";
import { SUBPANELES_FINANZAS } from "./finanzas-subpaneles";

export type ItemDelMenu =
  | { tipo: "app"; app: Aplicacion; nombre: string }
  | { tipo: "enlace"; href: string; nombre: string; icono: string; descripcion?: string }
  | { tipo: "pronto"; nombre: string; icono: string };

export interface GrupoDelMenu {
  /** Identificador estable: es la dirección de su página (/modulos/<slug>) y la clave de su icono. */
  slug: string;
  titulo: string;
  /** Una línea para el encabezado de su página. */
  descripcion: string;
  items: ItemDelMenu[];
}

/** La dirección de la página de un módulo, con sus submódulos como cartillas. */
export function rutaDeModulo(slug: string): string {
  return `/modulos/${slug}`;
}

/**
 * Rutas que no van en el menú aunque la persona tenga la app. Mi Día no se
 * pierde: tiene su botón arriba a la derecha (ver BarraSuperior).
 */
export const RUTAS_OCULTAS = ["/proyectos", "/mi-dia"];

/**
 * Las aplicaciones que no cuelgan de ningún módulo y no van en el menú, pero SÍ en el Inicio:
 * hoy, Proyectos. Como no está en el menú, el Inicio es la única puerta que tiene: si el Inicio
 * mostrara solo módulos, quedaría inalcanzable. Mi Día no cuenta: tiene su propio botón arriba.
 */
export function appsSueltasDelInicio(apps: Aplicacion[]): Aplicacion[] {
  return apps.filter((a) => RUTAS_OCULTAS.includes(a.url) && a.url !== "/mi-dia");
}

/**
 * Las pantallas de adentro de un submódulo, para que se vean desde el menú y desde la página
 * de su módulo.
 *
 * Hasta ahora solo se llegaba a ellas desde links dentro del propio submódulo, así que quien
 * entraba por primera vez no tenía forma de saber que existían: los formatos de las ofertas,
 * las empresas emisoras del cotizador y los catálogos de precios estaban a un clic de
 * distancia y a cero pistas de distancia.
 *
 * La primera es la portada del submódulo y las demás son sus pantallas internas.
 *
 * Herramientas Finanzas no está acá a propósito, aunque también tenga pantallas adentro:
 * las suyas se conceden por usuario (ver lib/finanzas-subpaneles-usuario.ts, donde
 * "facturas-ih" además deniega por defecto), y listarlas sin consultar ese permiso
 * mostraría puertas cerradas. Su propia portada ya las presenta con su descripción.
 */
export const SECCIONES_DE_MODULO: Record<string, { href: string; nombre: string }[]> = {
  "/ofertas": [
    { href: "/ofertas", nombre: "Ofertas" },
    { href: "/ofertas/maestros", nombre: "Maestros de formato" },
    { href: "/ofertas/logos", nombre: "Logos" },
  ],
  "/pagina-web": [
    { href: "/pagina-web", nombre: "Catálogo" },
    { href: "/pagina-web/casos", nombre: "Casos de éxito" },
    { href: "/pagina-web/solicitudes", nombre: "Solicitudes" },
    { href: "/pagina-web/contacto", nombre: "Contacto" },
  ],
  "/cotizador": [
    { href: "/cotizador", nombre: "Cotizaciones" },
    { href: "/cotizador/empresas", nombre: "Empresas emisoras" },
    { href: "/cotizador/catalogos", nombre: "Catálogos de precios" },
    { href: "/cotizador/parametros", nombre: "Parámetros legales" },
  ],
};

/** Subpaneles de Finanzas que van en el menú (facturas-ih queda fuera a propósito). */
const SUBPANELES_EN_MENU = [
  { slug: "sii", href: "/finanzas/sii", nombre: "Facturas compra y venta", icono: "file-invoice" },
  { slug: "facturas-historicas", href: "/finanzas/facturas-historicas", nombre: "Históricos facturas", icono: "folder" },
];

type Plan = { slug: string; titulo: string; descripcion: string; items: Paso[] };
type Paso =
  | { ruta: string; nombre?: string }
  | { subpanel: string }
  | { pronto: string; icono: string };

const PLAN: Plan[] = [
  {
    slug: "finanzas",
    titulo: "Finanzas",
    descripcion: "Facturas del SII, rendición de gastos y facturas históricas.",
    items: [{ subpanel: "sii" }, { ruta: "/rendir-gastos" }, { subpanel: "facturas-historicas" }],
  },
  {
    slug: "crm",
    titulo: "CRM",
    descripcion: "Cotizaciones y ofertas técnicas para tus clientes.",
    items: [{ ruta: "/cotizador" }, { ruta: "/ofertas", nombre: "Ofertas técnicas" }],
  },
  {
    slug: "tareas",
    titulo: "Tareas",
    descripcion: "Tablero de tareas del equipo: por hacer, en curso y hecho.",
    items: [{ ruta: "/tareas" }],
  },
  // Tareas, Contratos e Inventario son módulos de una sola aplicación: se ven y pliegan igual que los demás.
  {
    slug: "contratos",
    titulo: "Contratos",
    descripcion: "Acreditación, logística y gastos de arranque de cada contrato.",
    items: [{ ruta: "/contratos" }],
  },
  {
    slug: "inventario",
    titulo: "Inventario",
    descripcion: "Stock, movimientos y valorización de bodega.",
    items: [{ ruta: "/inventario" }],
  },
];

/**
 * «Página web» va siempre al final del menú, justo arriba de «Administración», pase lo que pase con
 * los demás módulos (incluidas las «Otras»). Por eso no está en PLAN: armarMenu lo agrega al cierre.
 */
const PAGINA_WEB: Plan = {
  slug: "pagina-web",
  titulo: "Página web",
  descripcion: "Catálogo, casos, solicitudes y postulaciones del sitio público.",
  items: [
    // Lo que antes se hacía en pertec.cl/admin: catálogo, casos, solicitudes y contacto.
    { ruta: "/pagina-web", nombre: "Configuración" },
    { ruta: "/reclutamiento", nombre: "Postulaciones" },
  ],
};

/** Solo para el administrador del Core: va al final de todo. */
const ADMINISTRACION: GrupoDelMenu = {
  slug: "administracion",
  titulo: "Administración",
  descripcion: "Usuarios y catálogo de aplicaciones del Core.",
  items: [
    {
      tipo: "enlace",
      href: "/usuarios",
      nombre: "Usuarios",
      icono: "users",
      descripcion: "Altas, roles, aplicaciones y empresas de cada persona.",
    },
    {
      tipo: "enlace",
      href: "/aplicaciones",
      nombre: "Aplicaciones",
      icono: "settings",
      descripcion: "El catálogo de aplicaciones del Core: nombre, ícono, estado y orden.",
    },
  ],
};

/**
 * Arma los módulos con lo que la persona puede ver.
 *
 * `apps` ya viene filtrada por permiso, y `subpanelesFinanzas` son los slugs de
 * Finanzas que tiene concedidos: un ítem sin permiso no aparece. Un módulo sin
 * nada real (solo "próximamente") tampoco. Las apps que no calzan en ningún
 * módulo —las externas, una app nueva— van en «Otras», para que agregar una app
 * nunca la deje sin entrada en el menú. «Página web» cierra la lista, después de
 * «Otras», y «Administración» (solo si `admin`) va a continuación.
 */
export function armarMenu(
  apps: Aplicacion[],
  subpanelesFinanzas: string[],
  opciones: { admin?: boolean } = {},
): GrupoDelMenu[] {
  const porRuta = new Map(apps.map((a) => [a.url, a]));
  const usadas = new Set<string>(RUTAS_OCULTAS);
  const tieneFinanzas = porRuta.has("/finanzas");
  usadas.add("/finanzas");

  function armarGrupo(plan: Plan): GrupoDelMenu | null {
    const items: ItemDelMenu[] = [];
    for (const paso of plan.items) {
      if ("ruta" in paso) {
        usadas.add(paso.ruta);
        const app = porRuta.get(paso.ruta);
        if (app) items.push({ tipo: "app", app, nombre: paso.nombre ?? app.nombre });
      } else if ("subpanel" in paso) {
        const sp = SUBPANELES_EN_MENU.find((s) => s.slug === paso.subpanel);
        if (sp && tieneFinanzas && subpanelesFinanzas.includes(sp.slug)) {
          items.push({
            tipo: "enlace",
            href: sp.href,
            nombre: sp.nombre,
            icono: sp.icono,
            descripcion: SUBPANELES_FINANZAS.find((f) => f.slug === sp.slug)?.descripcion,
          });
        }
      } else {
        items.push({ tipo: "pronto", nombre: paso.pronto, icono: paso.icono });
      }
    }
    return items.some((i) => i.tipo !== "pronto")
      ? { slug: plan.slug, titulo: plan.titulo, descripcion: plan.descripcion, items }
      : null;
  }

  const grupos: GrupoDelMenu[] = [];
  for (const plan of PLAN) {
    const grupo = armarGrupo(plan);
    if (grupo) grupos.push(grupo);
  }
  // Se arma ANTES de calcular «Otras» (marca sus rutas como usadas) pero se agrega DESPUÉS: va al cierre.
  const paginaWeb = armarGrupo(PAGINA_WEB);

  const otras = apps.filter((a) => !usadas.has(a.url));
  if (otras.length > 0) {
    grupos.push({
      slug: "otras",
      titulo: "Otras",
      descripcion: "Otras aplicaciones del Core.",
      items: otras.map((app) => ({ tipo: "app", app, nombre: app.nombre })),
    });
  }
  if (paginaWeb) grupos.push(paginaWeb);
  if (opciones.admin) grupos.push(ADMINISTRACION);
  return grupos;
}
