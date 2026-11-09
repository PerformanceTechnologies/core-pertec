import "server-only";
import { obtenerAplicacionPorSlug } from "./aplicaciones";
import { archivarProducto, desarchivarProducto } from "./inventario";
import { puedeArchivarProductos, type RolInventario } from "./permisos-inventario";
import type { UsuarioConAcceso } from "./tipos";

// -----------------------------------------------------------------------------
//  Quién puede archivar productos del Inventario (solo servidor).
//
//  La regla en sí está en lib/permisos-inventario.ts, sin "server-only", porque las pantallas la
//  necesitan para decidir si dibujan el botón. Acá se resuelve el rol contra la base y se arma lo
//  que llaman las Server Actions: reciben a la persona de la SESIÓN —nunca un dato del formulario—
//  y verifican el permiso ANTES de tocar nada.
// -----------------------------------------------------------------------------

export const SLUG_INVENTARIO = "inventario";

const SIN_PERMISO = "[inventario] No tienes permiso para archivar ni restaurar productos. Pídeselo a un administrador.";

/**
 * El rol de esta persona dentro de Inventario.
 *
 * Por omisión "usuario": quien tiene la app pero nadie le asignó nada puede operar el módulo, no
 * archivar. Un rol nuevo no puede ampliar lo que alguien hace sin que un admin lo decida.
 */
export async function resolverRolInventario(usuario: UsuarioConAcceso): Promise<RolInventario> {
  if (usuario.rol === "admin") return "admin";
  const app = await obtenerAplicacionPorSlug(SLUG_INVENTARIO);
  if (!app) return "usuario";
  return usuario.rolesExtra[app.id] === "admin" ? "admin" : "usuario";
}

/** Si esta persona puede archivar y restaurar. Para las pantallas; la acción vuelve a comprobarlo. */
export async function puedeArchivar(usuario: UsuarioConAcceso): Promise<boolean> {
  return puedeArchivarProductos(usuario.rol, await resolverRolInventario(usuario));
}

/** Corta con un error si la persona no puede archivar. Se llama antes de cualquier escritura. */
export async function exigirPermisoDeArchivar(usuario: UsuarioConAcceso): Promise<void> {
  if (!(await puedeArchivar(usuario))) throw new Error(SIN_PERMISO);
}

/** Lo que hace la Server Action de archivar: permiso primero, y recién después se toca la base. */
export async function archivarProductoComo(usuario: UsuarioConAcceso, productoId: string): Promise<void> {
  await exigirPermisoDeArchivar(usuario);
  await archivarProducto(productoId, usuario.correo);
}

/** Lo que hace la Server Action de restaurar: mismo permiso que para archivar. */
export async function restaurarProductoComo(usuario: UsuarioConAcceso, productoId: string): Promise<void> {
  await exigirPermisoDeArchivar(usuario);
  await desarchivarProducto(productoId);
}
