import "server-only";
import type { Aplicacion, UsuarioConAcceso } from "./tipos";
import { SUBPANELES_FINANZAS } from "./finanzas-subpaneles";
import { obtenerSubpanelesFinanzasGuardados, subpanelFinanzasPermitido } from "./finanzas-subpaneles-usuario";

// Lo que hace falta para armar el menú de UNA persona (ver armarMenu en menu-modelo.ts). Lo usan
// el layout, que dibuja la barra lateral, y la página de cada módulo, que dibuja lo mismo como
// cartillas: las dos tienen que ver exactamente las mismas puertas.

/** Las aplicaciones que esta persona puede ver: el admin todas, el resto las que tiene asignadas. */
export function filtrarAppsDelUsuario(todas: Aplicacion[], usuario: UsuarioConAcceso): Aplicacion[] {
  return usuario.rol === "admin" ? todas : todas.filter((app) => usuario.aplicacionIds.includes(app.id));
}

/** Los slugs de los subpaneles de Finanzas que cuelgan del módulo «Finanzas» para esta persona. */
export async function subpanelesFinanzasDelMenu(
  usuario: UsuarioConAcceso,
  apps: Aplicacion[],
): Promise<string[]> {
  // Misma regla que su portada: el admin ve todos; el resto, lo que tiene concedido (y solo si tiene la app).
  const guardados =
    usuario.rol === "admin" || !apps.some((app) => app.slug === "finanzas")
      ? []
      : await obtenerSubpanelesFinanzasGuardados(usuario.id);
  return SUBPANELES_FINANZAS.filter(
    (sp) => usuario.rol === "admin" || subpanelFinanzasPermitido(sp.slug, guardados),
  ).map((sp) => sp.slug);
}
