import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Las tablas de caché de Panel Odoo que se limpian por odoo_id. */
type TablaConOdooId =
  | "panel_odoo_facturas"
  | "panel_odoo_ventas"
  | "panel_odoo_compras"
  | "panel_odoo_crm_leads"
  | "panel_odoo_gastos"
  | "panel_odoo_fondos_gasto"
  | "panel_odoo_flota"
  | "panel_odoo_flota_documentos"
  | "panel_odoo_proyectos"
  | "panel_odoo_tareas";

/**
 * Borra de la caché lo que Odoo ya no devuelve.
 *
 * El upsert por sí solo nunca limpia: un registro borrado en Odoo —o excluido
 * por el filtro de la consulta, como una orden cancelada o un lead archivado—
 * se quedaba en la caché para siempre y el panel lo seguía contando. Así
 * apareció un proyecto "Plan Harris" duplicado con sus cinco tareas, que en Odoo
 * ya no existía: el panel decía 4 proyectos y 18 tareas donde había 3 y 12.
 *
 * `topeAlcanzado` es el seguro contra el borrado masivo. Los syncs piden con un
 * `limit`, así que si la consulta lo alcanza, lo que falta puede ser tanto algo
 * borrado en Odoo como algo que simplemente no vino en esa página — y no hay
 * forma de distinguirlos. En ese caso NO se borra nada: es mejor una caché con
 * filas viejas que una caché con la mitad de los datos.
 *
 * Vive acá y no en cada sync porque ya estaba escrita dos veces (flota y
 * gastos), y esta clase de función es justo la que no conviene tener duplicada:
 * el día que alguien le agregue un resguardo, tiene que valer para todas.
 */
export async function eliminarNoVigentes(
  tabla: TablaConOdooId,
  idsVigentes: number[],
  opciones: { topeAlcanzado?: boolean } = {},
): Promise<void> {
  if (opciones.topeAlcanzado) return;

  const query = supabaseAdmin.from(tabla).delete();
  // Sin ids vigentes se borra todo: odoo_id siempre es positivo, así que -1
  // nunca coincide con una fila real y `neq` alcanza a todas.
  const { error } =
    idsVigentes.length > 0
      ? await query.not("odoo_id", "in", `(${idsVigentes.join(",")})`)
      : await query.neq("odoo_id", -1);
  if (error) throw new Error(error.message);
}
