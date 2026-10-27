import "server-only";
import { exigirAccesoApp, verificarAccesoAppApi } from "@/lib/autorizacion";
import { obtenerAplicacionPorSlug } from "@/lib/aplicaciones";
import type { UsuarioConAcceso } from "@/lib/tipos";
import { type RolRendidor } from "@/lib/permisos-rendidor";

// La resolución del rol de Rendir Gastos contra la base. Las reglas de qué
// puede hacer cada rol están en lib/permisos-rendidor.ts, sin "server-only",
// porque las necesita también el navegador para decidir qué mostrar.

export const SLUG_APP = "rendir-gastos";

/**
 * El rol de esta persona dentro de Rendir Gastos.
 *
 * Por omisión "usuario": quien tiene la app pero nadie le asignó nada ve lo
 * suyo, que es el comportamiento que el módulo tuvo siempre. Un rol nuevo no
 * puede ampliar lo que alguien ve sin que un admin lo decida.
 */
export async function resolverRolRendidor(usuario: UsuarioConAcceso): Promise<RolRendidor> {
  if (usuario.rol === "admin") return "administrador";
  const app = await obtenerAplicacionPorSlug(SLUG_APP);
  if (!app) return "usuario";
  return usuario.rolesExtra[app.id] === "administrador" ? "administrador" : "usuario";
}

export interface AccesoRendidor {
  usuario: UsuarioConAcceso;
  rol: RolRendidor;
}

/** Guard para páginas y Server Actions: sesión, acceso a la app y rol resuelto. */
export async function exigirAccesoRendidor(): Promise<AccesoRendidor> {
  const usuario = await exigirAccesoApp(SLUG_APP);
  return { usuario, rol: await resolverRolRendidor(usuario) };
}

/**
 * Lo mismo para Route Handlers: en vez de redirigir devuelve el status.
 *
 * Mismo molde que verificarAccesoAppApi, al que envuelve, para que una ruta no
 * tenga que acordarse de resolver el rol por su cuenta — que es justo lo que se
 * olvida y deja un agujero.
 */
export async function verificarAccesoRendidorApi(): Promise<
  { usuario: null; rol: null; status: 401 | 403; error: string } | (AccesoRendidor & { status: null; error: null })
> {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) return { usuario: null, rol: null, status: acceso.status, error: acceso.error };
  return {
    usuario: acceso.usuario,
    rol: await resolverRolRendidor(acceso.usuario),
    status: null,
    error: null,
  };
}

