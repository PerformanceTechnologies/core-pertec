// Sin "server-only": este archivo lo importan tanto rutas de servidor como
// componentes cliente (para decidir qué botones mostrar). La data en sí
// vive en lib/proyectos.ts, que sí es server-only.

// Rol interno del panel de proyectos — independiente del rol del core
// (admin/usuario). Cada app maneja sus propios permisos internos, y este
// panel ya traía su propio esquema de 3 niveles desde pertec.cl/panel.
export type RolPanel = "admin" | "usuario" | "visualizador";

export type AccionPanel =
  | "create_objetivo"
  | "edit_objetivo"
  | "toggle_objetivo"
  | "delete_objetivo"
  | "comentar"
  | "run_checklist";

const ACCIONES_USUARIO: AccionPanel[] = [
  "create_objetivo",
  "edit_objetivo",
  "toggle_objetivo",
  "delete_objetivo",
  "comentar",
  "run_checklist",
];

export function puedeEnPanel(rol: RolPanel, accion: AccionPanel): boolean {
  if (rol === "admin") return true;
  if (rol === "usuario") return ACCIONES_USUARIO.includes(accion);
  return false;
}
