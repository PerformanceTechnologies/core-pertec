import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const MODULOS_PANEL_ODOO = [
  "facturas",
  "contabilidad",
  "crm",
  "gastos",
  "flota",
  "proyectos",
  "ventas",
  "compras",
] as const;
export type ModuloVisiblePanelOdoo = (typeof MODULOS_PANEL_ODOO)[number];

// Filas guardadas tal cual, sin default -- lo usa el formulario de admin
// para saber que checkboxes marcar (un array vacio ahi significa "sin
// restriccion", distinto de "restringido a 0 modulos", que no es un estado
// que este formulario permita crear).
export async function obtenerModulosGuardados(usuarioId: string): Promise<ModuloVisiblePanelOdoo[]> {
  const { data } = await supabaseAdmin
    .from("usuario_odoo_modulos")
    .select("modulo")
    .eq("usuario_id", usuarioId);
  return (data ?? []).map((fila) => fila.modulo as ModuloVisiblePanelOdoo);
}

// Sin filas para el usuario = ve todos los modulos (acceso total por defecto
// una vez que el admin le asigno la app Panel Odoo). Solo restringe si el
// admin marco explicitamente un subconjunto. Lo usa la pagina del panel
// (efecto real), a diferencia de obtenerModulosGuardados (estado crudo).
export async function obtenerModulosVisibles(usuarioId: string): Promise<ModuloVisiblePanelOdoo[]> {
  const guardados = await obtenerModulosGuardados(usuarioId);
  return guardados.length === 0 ? [...MODULOS_PANEL_ODOO] : guardados;
}

// Reemplazo completo (borra todo y reinserta), igual que
// reemplazarAsignaciones en lib/usuarios.ts para usuario_aplicaciones.
export async function reemplazarModulosOdoo(usuarioId: string, modulos: string[]): Promise<void> {
  await supabaseAdmin.from("usuario_odoo_modulos").delete().eq("usuario_id", usuarioId);

  const modulosValidos = modulos.filter((m): m is ModuloVisiblePanelOdoo =>
    (MODULOS_PANEL_ODOO as readonly string[]).includes(m)
  );

  // Si el admin dejo todos los checkboxes marcados, no vale la pena guardar
  // filas de restriccion -- se comporta igual que "sin filas" (ver arriba).
  if (modulosValidos.length === 0 || modulosValidos.length === MODULOS_PANEL_ODOO.length) return;

  const { error } = await supabaseAdmin
    .from("usuario_odoo_modulos")
    .insert(modulosValidos.map((modulo) => ({ usuario_id: usuarioId, modulo })));

  if (error) throw new Error(error.message);
}
