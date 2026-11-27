import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import { sesionDeLaPeticion } from "./sesion-de-la-peticion";
import { obtenerUsuarioActivo } from "./usuarios";
import { obtenerAplicacionPorSlug } from "./aplicaciones";

// -----------------------------------------------------------------------------
//  Bodega MERMA (supabase/inventario/0012_bodega_merma_y_categorias.sql).
//
//  Su ubicación es de tipo «merma», no «interna»: como todo el Inventario cuenta solo las internas,
//  lo que se manda ahí sale solo de toda métrica (stock, valorización, tablero, reabastecimiento).
//  Acá se decide además QUIÉN la ve: solo el administrador del Core o quien tenga el rol
//  «Administrador de inventario». Para el resto, la bodega, su ubicación, sus operaciones y sus
//  movimientos no existen en ninguna pantalla.
// -----------------------------------------------------------------------------

/** Si quien hace la petición puede ver la Bodega MERMA. Sin sesión (un cron, por ejemplo): no. */
export const veoMerma = cache(async (): Promise<boolean> => {
  try {
    const session = await sesionDeLaPeticion();
    const usuario = await obtenerUsuarioActivo(session?.user?.email);
    if (!usuario) return false;
    if (usuario.rol === "admin") return true;
    const app = await obtenerAplicacionPorSlug("inventario");
    return Boolean(app && usuario.rolesExtra[app.id] === "admin");
  } catch {
    return false;
  }
});

export interface IdsMerma {
  ubicaciones: Set<string>;
  almacenes: Set<string>;
  tipos: Set<string>;
}

/** Los ids de lo que pertenece a la merma. Sin la migración: conjuntos vacíos (nada se oculta). */
export const idsMerma = cache(async (): Promise<IdsMerma> => {
  const [ubis, almas, tipos] = await Promise.all([
    supabaseAdmin.from("inv_ubicaciones").select("id, almacen_id").eq("tipo", "merma"),
    supabaseAdmin.from("inv_almacenes").select("id").eq("codigo", "MER"),
    supabaseAdmin.from("inv_tipos_operacion").select("id").in("codigo", ["MER-ENV", "MER-DEV"]),
  ]);
  const ubicaciones = new Set((ubis.data ?? []).map((u) => u.id as string));
  const almacenes = new Set([...(almas.data ?? []).map((a) => a.id as string), ...(ubis.data ?? []).map((u) => u.almacen_id as string).filter(Boolean)]);
  return { ubicaciones, almacenes, tipos: new Set((tipos.data ?? []).map((t) => t.id as string)) };
});

/** Lo que hay hoy en merma por producto: lo que entró menos lo que salió, en movimientos hechos. */
export async function contenidoDeMerma(): Promise<{ productoId: string; nombre: string; sku: string | null; cantidad: number; valor: number }[]> {
  const { ubicaciones } = await idsMerma();
  if (ubicaciones.size === 0) return [];
  const ids = [...ubicaciones];
  const [entran, salen] = await Promise.all([
    supabaseAdmin.from("inv_movimientos").select("producto_id, cantidad").eq("estado", "hecho").in("ubicacion_destino_id", ids).limit(10000),
    supabaseAdmin.from("inv_movimientos").select("producto_id, cantidad").eq("estado", "hecho").in("ubicacion_origen_id", ids).limit(10000),
  ]);
  const saldo = new Map<string, number>();
  for (const m of entran.data ?? []) saldo.set(m.producto_id, (saldo.get(m.producto_id) ?? 0) + Number(m.cantidad));
  for (const m of salen.data ?? []) saldo.set(m.producto_id, (saldo.get(m.producto_id) ?? 0) - Number(m.cantidad));
  const conSaldo = [...saldo].filter(([, c]) => Math.abs(c) > 1e-9);
  if (conSaldo.length === 0) return [];
  const { data: prods } = await supabaseAdmin.from("inv_productos").select("id, nombre, sku, costo").in("id", conSaldo.map(([id]) => id));
  const porId = new Map((prods ?? []).map((p) => [p.id as string, p]));
  return conSaldo
    .map(([productoId, cantidad]) => {
      const p = porId.get(productoId);
      return { productoId, nombre: (p?.nombre as string) ?? "—", sku: (p?.sku as string | null) ?? null, cantidad: Math.round(cantidad * 1e4) / 1e4, valor: Math.round(cantidad * Number(p?.costo ?? 0)) };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
