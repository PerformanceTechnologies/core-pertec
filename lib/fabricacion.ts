import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import {
  calcularCosto,
  type EstadoFabricacion,
  type GrupoCosto,
  type ItemCosto,
  type ProductoFabricado,
  type ResumenCosto,
} from "./fabricacion-modelo";

// -----------------------------------------------------------------------------
//  Capa de datos de Fabricación (solo servidor).
//
//  Dos tablas: inv_fab_productos (el producto fabricado y sus parámetros) e inv_fab_items (su receta de
//  costos). Los cálculos no se guardan: se hacen al leer con calcularCosto(), así el costo que se ve
//  siempre sale de los ítems actuales y no hay una cifra «guardada» que pueda quedar vieja.
// -----------------------------------------------------------------------------

const T = { productos: "inv_fab_productos", items: "inv_fab_items", catalogo: "inv_productos" } as const;
export const MIGRACION_FABRICACION = "supabase/inventario/0010_fabricacion.sql";

/** Tope de ítems por receta: una ficha con miles de filas es un error de carga, no una receta. */
export const MAX_ITEMS_POR_FICHA = 200;

/* eslint-disable @typescript-eslint/no-explicit-any */
const aItem = (r: any): ItemCosto => ({
  id: r.id, fabricacionId: r.fabricacion_id, grupo: r.grupo, descripcion: r.descripcion, productoId: r.producto_id ?? null,
  unidad: r.unidad ?? "un", cantidad: Number(r.cantidad), costoUnitario: Number(r.costo_unitario),
  mermaPct: Number(r.merma_pct), orden: Number(r.orden ?? 0), nota: r.nota ?? null,
});

const aFabricacion = (r: any): ProductoFabricado => ({
  id: r.id, codigo: r.codigo ?? null, nombre: r.nombre, descripcion: r.descripcion ?? null, unidadId: r.unidad_id ?? null,
  productoId: r.producto_id ?? null, rendimiento: Number(r.rendimiento), indirectosPct: Number(r.indirectos_pct),
  margenPct: Number(r.margen_pct), precioVenta: Number(r.precio_venta), estado: r.estado, notas: r.notas ?? null,
  creadoPor: r.creado_por ?? null, creadoEn: r.creado_en, actualizadoEn: r.actualizado_en,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

type ErrorSupabase = { message: string; code?: string } | null;

/** Si el error es «la tabla no existe», la migración todavía no se corrió. */
function faltaMigracion(error: ErrorSupabase): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /inv_fab_(productos|items)/.test(error.message) && /(does not exist|schema cache|not find)/i.test(error.message);
}

function revienta(contexto: string, error: ErrorSupabase): void {
  if (!error) return;
  if (faltaMigracion(error)) throw new Error(`[inventario] Fabricación todavía no está activada en la base: corre ${MIGRACION_FABRICACION}.`);
  if (error.code === "23505") throw new Error("[inventario] Ya existe un producto fabricado con ese código.");
  throw new Error(`[inventario] ${contexto}: ${error.message}`);
}

export type FabricacionConCosto = ProductoFabricado & { resumen: ResumenCosto; cantidadItems: number };

function conCosto(f: ProductoFabricado, items: ItemCosto[]): FabricacionConCosto {
  return { ...f, cantidadItems: items.length, resumen: calcularCosto(items, f) };
}

/** Si la base ya tiene las tablas de Fabricación. Para mostrar un aviso en vez de un error. */
export async function fabricacionDisponible(): Promise<boolean> {
  const { error } = await supabaseAdmin.from(T.productos).select("id", { head: true, count: "exact" }).limit(1);
  return !faltaMigracion(error);
}

/** Todas las fichas con su costo calculado. Por omisión sin las archivadas. */
export async function listarFabricaciones(incluirArchivadas = false): Promise<FabricacionConCosto[]> {
  let q = supabaseAdmin.from(T.productos).select("*").order("nombre");
  if (!incluirArchivadas) q = q.neq("estado", "archivado");
  const { data, error } = await q;
  revienta("listar productos fabricados", error);
  const fichas = (data ?? []).map(aFabricacion);
  if (fichas.length === 0) return [];

  const { data: filas, error: errItems } = await supabaseAdmin.from(T.items).select("*").in("fabricacion_id", fichas.map((f) => f.id));
  revienta("leer los ítems de costo", errItems);
  const porFicha = new Map<string, ItemCosto[]>();
  for (const f of (filas ?? []).map(aItem)) porFicha.set(f.fabricacionId, [...(porFicha.get(f.fabricacionId) ?? []), f]);
  return fichas.map((f) => conCosto(f, porFicha.get(f.id) ?? []));
}

export async function contarFabricacionesArchivadas(): Promise<number> {
  const { count, error } = await supabaseAdmin.from(T.productos).select("id", { count: "exact", head: true }).eq("estado", "archivado");
  return error ? 0 : count ?? 0;
}

/** Una ficha con sus ítems (ordenados por grupo y orden) y su costo. null si no existe. */
export async function obtenerFabricacion(id: string): Promise<{ ficha: FabricacionConCosto; items: ItemCosto[] } | null> {
  const { data, error } = await supabaseAdmin.from(T.productos).select("*").eq("id", id).maybeSingle();
  revienta("leer el producto fabricado", error);
  if (!data) return null;
  const { data: filas, error: errItems } = await supabaseAdmin.from(T.items).select("*").eq("fabricacion_id", id).order("orden").order("creado_en");
  revienta("leer los ítems de costo", errItems);
  const items = (filas ?? []).map(aItem);
  return { ficha: conCosto(aFabricacion(data), items), items };
}

export type DatosFabricacion = {
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  unidadId: string | null;
  productoId: string | null;
  rendimiento: number;
  indirectosPct: number;
  margenPct: number;
  precioVenta: number;
  notas: string | null;
};

const aFila = (d: DatosFabricacion) => ({
  codigo: d.codigo, nombre: d.nombre, descripcion: d.descripcion, unidad_id: d.unidadId, producto_id: d.productoId,
  rendimiento: d.rendimiento, indirectos_pct: d.indirectosPct, margen_pct: d.margenPct, precio_venta: d.precioVenta, notas: d.notas,
});

export async function crearFabricacion(d: DatosFabricacion, porCorreo: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from(T.productos).insert({ ...aFila(d), estado: "borrador", creado_por: porCorreo }).select("id").single();
  revienta("crear el producto fabricado", error);
  return data!.id;
}

export async function actualizarFabricacion(id: string, d: DatosFabricacion): Promise<void> {
  const { data, error } = await supabaseAdmin.from(T.productos).update({ ...aFila(d), actualizado_en: new Date().toISOString() }).eq("id", id).select("id");
  revienta("guardar el producto fabricado", error);
  if ((data ?? []).length === 0) throw new Error("[inventario] Ese producto fabricado ya no existe.");
}

/** Borrador ⇄ Activo. Archivar y restaurar van aparte porque tienen permiso propio. */
export async function cambiarEstado(id: string, estado: Exclude<EstadoFabricacion, "archivado">): Promise<void> {
  const { data: actual, error: errLeer } = await supabaseAdmin.from(T.productos).select("estado").eq("id", id).maybeSingle();
  revienta("leer el estado", errLeer);
  if (!actual) throw new Error("[inventario] Ese producto fabricado ya no existe.");
  if (actual.estado === "archivado") throw new Error("[inventario] Está archivado: restáuralo antes de cambiarle el estado.");
  if (estado === "activo") {
    const { count, error } = await supabaseAdmin.from(T.items).select("id", { count: "exact", head: true }).eq("fabricacion_id", id);
    revienta("contar ítems", error);
    if (!count) throw new Error("[inventario] Agrega al menos un ítem de costo antes de activar la ficha.");
  }
  const { error } = await supabaseAdmin.from(T.productos).update({ estado, actualizado_en: new Date().toISOString() }).eq("id", id);
  revienta("cambiar el estado", error);
}

export async function archivarFabricacion(id: string, porCorreo: string): Promise<void> {
  const ahora = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from(T.productos)
    .update({ estado: "archivado", archivado_en: ahora, archivado_por: porCorreo, actualizado_en: ahora })
    .eq("id", id).neq("estado", "archivado").select("id");
  revienta("archivar el producto fabricado", error);
  if ((data ?? []).length === 0) throw new Error("[inventario] Ese producto fabricado ya está archivado o no existe.");
}

/** Lo restaura como borrador: tiene que volver a revisarse antes de activarlo. */
export async function restaurarFabricacion(id: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from(T.productos)
    .update({ estado: "borrador", archivado_en: null, archivado_por: null, actualizado_en: new Date().toISOString() })
    .eq("id", id).eq("estado", "archivado").select("id");
  revienta("restaurar el producto fabricado", error);
  if ((data ?? []).length === 0) throw new Error("[inventario] Ese producto fabricado no está archivado.");
}

/** Copia la ficha y todos sus ítems como borrador nuevo («… (copia)»). Sirve para variantes de un producto. */
export async function duplicarFabricacion(id: string, porCorreo: string): Promise<string> {
  const origen = await obtenerFabricacion(id);
  if (!origen) throw new Error("[inventario] Ese producto fabricado ya no existe.");
  const { ficha, items } = origen;
  const nuevoId = await crearFabricacion(
    {
      codigo: null, // el código es único: la copia nace sin él y se le pone el suyo
      nombre: `${ficha.nombre} (copia)`.slice(0, 120),
      descripcion: ficha.descripcion, unidadId: ficha.unidadId, productoId: null,
      rendimiento: ficha.rendimiento, indirectosPct: ficha.indirectosPct, margenPct: ficha.margenPct,
      precioVenta: ficha.precioVenta, notas: ficha.notas,
    },
    porCorreo,
  );
  if (items.length > 0) {
    const { error } = await supabaseAdmin.from(T.items).insert(
      items.map((i) => ({
        fabricacion_id: nuevoId, grupo: i.grupo, descripcion: i.descripcion, producto_id: i.productoId, unidad: i.unidad,
        cantidad: i.cantidad, costo_unitario: i.costoUnitario, merma_pct: i.mermaPct, orden: i.orden, nota: i.nota,
      })),
    );
    if (error) {
      // Una ficha a medias es peor que ninguna: se deshace.
      await supabaseAdmin.from(T.productos).delete().eq("id", nuevoId);
      revienta("copiar los ítems", error);
    }
  }
  return nuevoId;
}

// ---------- Ítems --------------------------------------------------------------

export type DatosItem = {
  grupo: GrupoCosto;
  descripcion: string;
  productoId: string | null;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  mermaPct: number;
  nota: string | null;
};

const aFilaItem = (d: DatosItem) => ({
  grupo: d.grupo, descripcion: d.descripcion, producto_id: d.productoId, unidad: d.unidad, cantidad: d.cantidad,
  costo_unitario: d.costoUnitario, merma_pct: d.mermaPct, nota: d.nota,
});

async function exigirFichaEditable(fabricacionId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from(T.productos).select("estado").eq("id", fabricacionId).maybeSingle();
  revienta("leer el producto fabricado", error);
  if (!data) throw new Error("[inventario] Ese producto fabricado ya no existe.");
  if (data.estado === "archivado") throw new Error("[inventario] Está archivado: restáuralo para modificar su costo.");
}

export async function agregarItem(fabricacionId: string, d: DatosItem): Promise<string> {
  await exigirFichaEditable(fabricacionId);
  const { data: existentes, error: errCuenta } = await supabaseAdmin.from(T.items).select("orden").eq("fabricacion_id", fabricacionId).order("orden", { ascending: false }).limit(MAX_ITEMS_POR_FICHA + 1);
  revienta("contar ítems", errCuenta);
  if ((existentes ?? []).length >= MAX_ITEMS_POR_FICHA) throw new Error(`[inventario] Una ficha admite hasta ${MAX_ITEMS_POR_FICHA} ítems.`);
  const orden = (existentes?.[0]?.orden ?? 0) + 1;
  const { data, error } = await supabaseAdmin.from(T.items).insert({ ...aFilaItem(d), fabricacion_id: fabricacionId, orden }).select("id").single();
  revienta("agregar el ítem", error);
  await tocar(fabricacionId);
  return data!.id;
}

export async function actualizarItem(fabricacionId: string, itemId: string, d: DatosItem): Promise<void> {
  await exigirFichaEditable(fabricacionId);
  // El filtro por ficha evita que un id suelto modifique el ítem de OTRA ficha.
  const { data, error } = await supabaseAdmin.from(T.items)
    .update({ ...aFilaItem(d), actualizado_en: new Date().toISOString() })
    .eq("id", itemId).eq("fabricacion_id", fabricacionId).select("id");
  revienta("guardar el ítem", error);
  if ((data ?? []).length === 0) throw new Error("[inventario] Ese ítem ya no existe.");
  await tocar(fabricacionId);
}

export async function eliminarItem(fabricacionId: string, itemId: string): Promise<void> {
  await exigirFichaEditable(fabricacionId);
  const { error } = await supabaseAdmin.from(T.items).delete().eq("id", itemId).eq("fabricacion_id", fabricacionId);
  revienta("quitar el ítem", error);
  await tocar(fabricacionId);
}

/**
 * Trae el costo actual del catálogo a cada ítem enlazado a un producto de Inventario. Devuelve cuántos
 * ítems cambiaron. Es una acción explícita: el costo de una ficha no se mueve solo cuando cambia el
 * catálogo, porque una cotización ya hecha con ese costo no tiene que cambiar de un día para otro.
 */
export async function actualizarCostosDesdeInventario(fabricacionId: string): Promise<number> {
  await exigirFichaEditable(fabricacionId);
  const { data: filas, error } = await supabaseAdmin.from(T.items).select("id, producto_id, costo_unitario").eq("fabricacion_id", fabricacionId).not("producto_id", "is", null);
  revienta("leer los ítems enlazados", error);
  const enlazados = filas ?? [];
  if (enlazados.length === 0) return 0;
  const { data: productos, error: errProd } = await supabaseAdmin.from(T.catalogo).select("id, costo").in("id", [...new Set(enlazados.map((i) => i.producto_id as string))]);
  revienta("leer el costo del catálogo", errProd);
  const costo = new Map((productos ?? []).map((p) => [p.id as string, Number(p.costo)]));

  let cambiados = 0;
  for (const i of enlazados) {
    const nuevo = costo.get(i.producto_id as string);
    if (nuevo === undefined || nuevo === Number(i.costo_unitario)) continue;
    const { error: errUp } = await supabaseAdmin.from(T.items).update({ costo_unitario: nuevo, actualizado_en: new Date().toISOString() }).eq("id", i.id);
    revienta("actualizar un costo", errUp);
    cambiados++;
  }
  if (cambiados > 0) await tocar(fabricacionId);
  return cambiados;
}

async function tocar(fabricacionId: string): Promise<void> {
  await supabaseAdmin.from(T.productos).update({ actualizado_en: new Date().toISOString() }).eq("id", fabricacionId);
}

// ---------- Apoyo para los formularios ---------------------------------------------

export type ProductoDeCatalogo = { id: string; nombre: string; sku: string | null; costo: number; unidad: string };

/** Los productos del catálogo que se pueden usar como material: activos y que no son servicios. */
export async function productosParaMateriales(): Promise<ProductoDeCatalogo[]> {
  const [productos, unidades] = await Promise.all([
    supabaseAdmin.from(T.catalogo).select("id, nombre, sku, costo, unidad_id").eq("activo", true).neq("tipo", "servicio").order("nombre"),
    supabaseAdmin.from("inv_unidades").select("id, abreviacion"),
  ]);
  if (productos.error) throw new Error(`[inventario] leer el catálogo: ${productos.error.message}`);
  const abrev = new Map((unidades.data ?? []).map((u) => [u.id as string, u.abreviacion as string]));
  return (productos.data ?? []).map((p) => ({
    id: p.id, nombre: p.nombre, sku: p.sku ?? null, costo: Number(p.costo), unidad: abrev.get(p.unidad_id as string) ?? "un",
  }));
}

/** Los productos activos del catálogo que aún no están enlazados a una ficha: candidatos a «producto terminado». */
export async function productosTerminadosDisponibles(incluir?: string | null): Promise<{ id: string; nombre: string; sku: string | null }[]> {
  const [productos, usados] = await Promise.all([
    supabaseAdmin.from(T.catalogo).select("id, nombre, sku").eq("activo", true).neq("tipo", "servicio").order("nombre"),
    supabaseAdmin.from(T.productos).select("producto_id").not("producto_id", "is", null),
  ]);
  if (productos.error) throw new Error(`[inventario] leer el catálogo: ${productos.error.message}`);
  const ocupados = new Set((usados.data ?? []).map((u) => u.producto_id as string));
  return (productos.data ?? [])
    .filter((p) => !ocupados.has(p.id) || p.id === incluir)
    .map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku ?? null }));
}
