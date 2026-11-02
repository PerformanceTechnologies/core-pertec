// Cómo se agrupa el menú de la izquierda.
//
// Sin "server-only": lo usa la barra (cliente). Las aplicaciones siguen
// viniendo de la tabla `aplicaciones` con sus permisos de siempre; acá solo se
// decide en qué grupo cae cada una y con qué nombre. Se reconocen por su ruta
// (`url`), no por el slug: el slug de Postulaciones es
// "panel-de-postulacion-laboral" y su ruta /reclutamiento, y la ruta es lo que
// de verdad abre.

import type { Aplicacion } from "./tipos";

export type ItemDelMenu =
  | { tipo: "app"; app: Aplicacion; nombre: string }
  | { tipo: "enlace"; href: string; nombre: string; icono: string }
  | { tipo: "pronto"; nombre: string; icono: string };

export interface GrupoDelMenu {
  /** null: el ítem va suelto, sin encabezado (Contratos, Inventario). */
  titulo: string | null;
  items: ItemDelMenu[];
}

/**
 * Rutas que no van en el menú aunque la persona tenga la app. Mi Día no se
 * pierde: tiene su botón arriba a la derecha (ver BarraSuperior).
 */
export const RUTAS_OCULTAS = ["/proyectos", "/mi-dia"];

/** Subpaneles de Finanzas que van en el menú (facturas-ih queda fuera a propósito). */
const SUBPANELES_EN_MENU = [
  { slug: "sii", href: "/finanzas/sii", nombre: "Facturas compra y venta", icono: "file-invoice" },
  { slug: "facturas-historicas", href: "/finanzas/facturas-historicas", nombre: "Históricos facturas", icono: "folder" },
];

type Plan = { titulo: string | null; items: Paso[] };
type Paso =
  | { ruta: string; nombre?: string }
  | { subpanel: string }
  | { pronto: string; icono: string };

const PLAN: Plan[] = [
  {
    titulo: "Finanzas",
    items: [{ subpanel: "sii" }, { ruta: "/rendir-gastos" }, { subpanel: "facturas-historicas" }],
  },
  { titulo: "CRM", items: [{ ruta: "/cotizador" }, { ruta: "/ofertas", nombre: "Ofertas técnicas" }] },
  // Contratos e Inventario son categorías de un solo módulo: se ven y pliegan igual que las demás.
  { titulo: "Contratos", items: [{ ruta: "/contratos" }] },
  { titulo: "Inventario", items: [{ ruta: "/inventario" }] },
];

/**
 * «Página web» va siempre al final del menú, justo arriba de «Administración», pase lo que pase con
 * los demás grupos (incluidas las «Otras»). Por eso no está en PLAN: armarMenu lo agrega al cierre.
 */
const PAGINA_WEB: Plan = {
  titulo: "Página web",
  items: [
    // Lo que antes se hacía en pertec.cl/admin: catálogo, casos, solicitudes y contacto.
    { ruta: "/pagina-web", nombre: "Configuración" },
    { ruta: "/reclutamiento", nombre: "Postulaciones" },
    { pronto: "Cotizador web", icono: "file-invoice" },
  ],
};

/**
 * Arma los grupos con lo que la persona puede ver.
 *
 * `apps` ya viene filtrada por permiso, y `subpanelesFinanzas` son los slugs de
 * Finanzas que tiene concedidos: un ítem sin permiso no aparece. Un grupo sin
 * nada real (solo "próximamente") tampoco. Las apps que no calzan en ningún
 * grupo —las externas, una app nueva— van en «Otras», para que agregar una app
 * nunca la deje sin entrada en el menú. «Página web» cierra la lista, después de
 * «Otras» (y la barra pone «Administración» a continuación).
 */
export function armarMenu(apps: Aplicacion[], subpanelesFinanzas: string[]): GrupoDelMenu[] {
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
          items.push({ tipo: "enlace", href: sp.href, nombre: sp.nombre, icono: sp.icono });
        }
      } else {
        items.push({ tipo: "pronto", nombre: paso.pronto, icono: paso.icono });
      }
    }
    return items.some((i) => i.tipo !== "pronto") ? { titulo: plan.titulo, items } : null;
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
    grupos.push({ titulo: "Otras", items: otras.map((app) => ({ tipo: "app", app, nombre: app.nombre })) });
  }
  if (paginaWeb) grupos.push(paginaWeb);
  return grupos;
}
