import "server-only";
import { redirect } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerAplicacionPorSlug } from "@/lib/aplicaciones";
import type { UsuarioConAcceso } from "@/lib/tipos";
import { puedeEnPanelOdoo, type AccionPanelOdoo, type RolPanelOdoo } from "@/lib/panel-odoo/permisos";
import { obtenerModulosVisibles, type ModuloVisiblePanelOdoo } from "@/lib/panel-odoo/modulos-usuario";

const SLUG_APP = "panel-odoo";

export async function resolverRolPanelOdoo(usuario: UsuarioConAcceso): Promise<RolPanelOdoo> {
  if (usuario.rol === "admin") return "admin";
  const app = await obtenerAplicacionPorSlug(SLUG_APP);
  if (!app) return "visualizador";
  return (usuario.rolesExtra[app.id] as RolPanelOdoo) ?? "visualizador";
}

// Guard estandar para la pagina y las Server Actions de Panel Odoo: valida
// sesion + acceso a la app, resuelve el rol interno y los modulos visibles
// para este usuario. Si se pasa `accion`, redirige cuando el rol no alcanza
// -- las Server Actions siempre deben pasarla, ocultar un boton en la UI no
// es una barrera de seguridad (mismo comentario que lib/cotizador.ts).
export async function exigirAccesoPanelOdoo(
  accion?: AccionPanelOdoo
): Promise<{ usuario: UsuarioConAcceso; rol: RolPanelOdoo; modulosVisibles: ModuloVisiblePanelOdoo[] }> {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const rol = await resolverRolPanelOdoo(usuario);
  if (accion && !puedeEnPanelOdoo(rol, accion)) redirect("/panel-odoo");
  const modulosVisibles = await obtenerModulosVisibles(usuario.id);
  return { usuario, rol, modulosVisibles };
}
