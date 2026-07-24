// Sin "server-only": lo importan tanto rutas de servidor (para decidir si una
// Server Action puede ejecutarse) como componentes cliente (para decidir si
// se muestra el boton de sincronizar). La resolucion del rol en si
// (resolverRolPanelOdoo, que consulta la DB) vive en lib/panel-odoo.ts, que
// es server-only.
//
// Mismo esquema de 3 niveles que /proyectos y /cotizador (ver
// lib/permisos-cotizador.ts): rol interno de la app, independiente del rol
// admin/usuario del core. Panel Odoo es de solo lectura para todos los
// usuarios -- la unica accion mutable es forzar una sincronizacion manual,
// reservada a admin. "usuario" y "visualizador" se comportan igual hoy (ver
// solo), pero se mantienen los 3 niveles por consistencia con el resto del
// formulario de administracion de usuarios.

export type RolPanelOdoo = "admin" | "usuario" | "visualizador";

export type AccionPanelOdoo = "sincronizar";

export function puedeEnPanelOdoo(rol: RolPanelOdoo, accion: AccionPanelOdoo): boolean {
  if (rol === "admin") return true;
  return false;
}
