import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MODULOS_PANEL_ODOO, type ModuloVisiblePanelOdoo } from "./modulos-usuario";

export const NOMBRES_MODULO: Record<ModuloVisiblePanelOdoo, string> = {
  facturas: "Facturas",
  contabilidad: "Contabilidad",
  crm: "CRM",
  gastos: "Gastos",
  flota: "Flota",
  proyectos: "Proyectos",
  ventas: "Ventas y Arriendo",
  compras: "Compras",
};

// Orden global (no por usuario) -- lo configura un admin y aplica igual
// para todos, igual que aplicaciones.orden en lib/aplicaciones.ts. Un modulo
// sin fila guardada aun (recien agregado al codigo) se agrega al final en
// el orden default, en vez de desaparecer silenciosamente de la tarjeta.
export async function obtenerOrdenModulos(): Promise<ModuloVisiblePanelOdoo[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_modulos_orden")
    .select("modulo, orden")
    .order("orden", { ascending: true });

  const guardado = (data ?? [])
    .map((fila) => fila.modulo as ModuloVisiblePanelOdoo)
    .filter((m) => (MODULOS_PANEL_ODOO as readonly string[]).includes(m));

  const faltantes = MODULOS_PANEL_ODOO.filter((m) => !guardado.includes(m));
  return [...guardado, ...faltantes];
}

// Mismo patron que moverAplicacion en lib/aplicaciones.ts: renumera TODAS
// las filas (0, 1, 2...) segun la posicion resultante, en vez de solo
// intercambiar el "orden" de las dos movidas -- evita empates.
export async function moverModulo(modulo: ModuloVisiblePanelOdoo, direccion: "arriba" | "abajo"): Promise<void> {
  const orden = await obtenerOrdenModulos();
  const indice = orden.indexOf(modulo);
  if (indice === -1) return;

  const destino = direccion === "arriba" ? indice - 1 : indice + 1;
  if (destino < 0 || destino >= orden.length) return; // ya está en el extremo

  const reordenado = [...orden];
  [reordenado[indice], reordenado[destino]] = [reordenado[destino], reordenado[indice]];

  const resultados = await Promise.all(
    reordenado.map((m, i) =>
      supabaseAdmin.from("panel_odoo_modulos_orden").upsert({ modulo: m, orden: i, actualizado_en: new Date().toISOString() })
    )
  );
  const error = resultados.find((r) => r.error)?.error;
  if (error) throw new Error(error.message);
}
