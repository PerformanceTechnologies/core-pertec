import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import {
  disponible,
  redondear,
  siguienteReferencia,
  sugerenciaDeReposicion,
  valorizar,
  type Almacen,
  type Categoria,
  type ClaseOperacion,
  type Lote,
  type Movimiento,
  type Producto,
  type Quant,
  type Regla,
  type Transferencia,
  type TipoOperacion,
  type Ubicacion,
  type Unidad,
} from "./inventario-modelo";

// -----------------------------------------------------------------------------
//  Capa de datos y lógica del Inventario (solo servidor).
//
//  Lee y escribe las tablas inv_*. Las mutaciones que cambian stock —reservar,
//  validar, cancelar— delegan en las funciones PL/pgSQL del motor (migración
//  0046), para que cada una sea una sola transacción. Acá arriba solo se arma el
//  documento y se llama al motor.
// -----------------------------------------------------------------------------

const T = {
  unidades: "inv_unidades",
  categorias: "inv_categorias",
  productos: "inv_productos",
  almacenes: "inv_almacenes",
  ubicaciones: "inv_ubicaciones",
  tiposOperacion: "inv_tipos_operacion",
  lotes: "inv_lotes",
  transferencias: "inv_transferencias",
  movimientos: "inv_movimientos",
  quants: "inv_quants",
  reglas: "inv_reglas_reabastecimiento",
} as const;

// ---------- Mapeos fila (snake_case) → dominio (camelCase) --------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const aUnidad = (r: any): Unidad => ({ id: r.id, nombre: r.nombre, abreviacion: r.abreviacion, activo: r.activo });
const aCategoria = (r: any): Categoria => ({ id: r.id, nombre: r.nombre });
const aAlmacen = (r: any): Almacen => ({ id: r.id, nombre: r.nombre, codigo: r.codigo });

const aProducto = (r: any): Producto => ({
  id: r.id, sku: r.sku, nombre: r.nombre, descripcion: r.descripcion,
  categoriaId: r.categoria_id, unidadId: r.unidad_id, tipo: r.tipo, seguimiento: r.seguimiento,
  costo: Number(r.costo), precio: Number(r.precio), activo: r.activo,
});

const aUbicacion = (r: any): Ubicacion => ({
  id: r.id, nombre: r.nombre, codigo: r.codigo, tipo: r.tipo, padreId: r.padre_id,
  almacenId: r.almacen_id, esStockPrincipal: r.es_stock_principal, activo: r.activo,
});

const aTipoOperacion = (r: any): TipoOperacion => ({
  id: r.id, nombre: r.nombre, codigo: r.codigo, clase: r.clase, almacenId: r.almacen_id,
  ubicacionOrigenId: r.ubicacion_origen_id, ubicacionDestinoId: r.ubicacion_destino_id,
  prefijo: r.prefijo, correlativo: r.correlativo, activo: r.activo,
});

const aLote = (r: any): Lote => ({
  id: r.id, productoId: r.producto_id, nombre: r.nombre, fechaVencimiento: r.fecha_vencimiento, creadoEn: r.creado_en,
});

const aTransferencia = (r: any): Transferencia => ({
  id: r.id, referencia: r.referencia, tipoOperacionId: r.tipo_operacion_id, clase: r.clase,
  ubicacionOrigenId: r.ubicacion_origen_id, ubicacionDestinoId: r.ubicacion_destino_id, estado: r.estado,
  contraparte: r.contraparte, nota: r.nota, fechaProgramada: r.fecha_programada,
  fechaValidacion: r.fecha_validacion, creadoPor: r.creado_por, creadoEn: r.creado_en,
});

const aMovimiento = (r: any): Movimiento => ({
  id: r.id, transferenciaId: r.transferencia_id, productoId: r.producto_id, unidadId: r.unidad_id,
  loteId: r.lote_id, ubicacionOrigenId: r.ubicacion_origen_id, ubicacionDestinoId: r.ubicacion_destino_id,
  cantidad: Number(r.cantidad), cantidadHecha: r.cantidad_hecha == null ? null : Number(r.cantidad_hecha),
  costoUnitario: r.costo_unitario == null ? null : Number(r.costo_unitario), estado: r.estado,
});

const aQuant = (r: any): Quant => ({
  id: r.id, productoId: r.producto_id, ubicacionId: r.ubicacion_id, loteId: r.lote_id,
  cantidad: Number(r.cantidad), reservado: Number(r.reservado),
});

const aRegla = (r: any): Regla => ({
  id: r.id, productoId: r.producto_id, ubicacionId: r.ubicacion_id,
  minimo: Number(r.minimo), maximo: Number(r.maximo), activo: r.activo,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function revienta(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`[inventario] ${contexto}: ${error.message}`);
}

// =============================================================================
//  CATÁLOGOS
// =============================================================================

export async function listarUnidades(): Promise<Unidad[]> {
  const { data, error } = await supabaseAdmin.from(T.unidades).select("*").order("nombre");
  revienta("listar unidades", error);
  return (data ?? []).map(aUnidad);
}

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabaseAdmin.from(T.categorias).select("*").order("nombre");
  revienta("listar categorías", error);
  return (data ?? []).map(aCategoria);
}

export async function listarAlmacenes(): Promise<Almacen[]> {
  const { data, error } = await supabaseAdmin.from(T.almacenes).select("*").order("nombre");
  revienta("listar almacenes", error);
  return (data ?? []).map(aAlmacen);
}

export async function listarUbicaciones(incluirInactivas = false): Promise<Ubicacion[]> {
  let q = supabaseAdmin.from(T.ubicaciones).select("*").order("tipo").order("nombre");
  if (!incluirInactivas) q = q.eq("activo", true);
  const { data, error } = await q;
  revienta("listar ubicaciones", error);
  return (data ?? []).map(aUbicacion);
}

export async function listarTiposOperacion(): Promise<TipoOperacion[]> {
  const { data, error } = await supabaseAdmin.from(T.tiposOperacion).select("*").eq("activo", true).order("clase");
  revienta("listar tipos de operación", error);
  return (data ?? []).map(aTipoOperacion);
}

// =============================================================================
//  PRODUCTOS y STOCK
// =============================================================================

export interface ProductoConStock extends Producto {
  /** Cantidad a mano sumando todas las ubicaciones internas. */
  aMano: number;
  /** Disponible = a mano - reservado. */
  disponible: number;
  valor: number;
}

/** Productos con su stock total (solo cuenta ubicaciones internas). */
export async function listarProductosConStock(): Promise<ProductoConStock[]> {
  const [productos, quants, internas] = await Promise.all([
    supabaseAdmin.from(T.productos).select("*").eq("activo", true).order("nombre"),
    supabaseAdmin.from(T.quants).select("producto_id, ubicacion_id, cantidad, reservado"),
    idsInternos(),
  ]);
  revienta("listar productos", productos.error);
  revienta("leer quants", quants.error);

  const porProducto = new Map<string, { aMano: number; reservado: number }>();
  for (const q of quants.data ?? []) {
    if (!internas.has(q.ubicacion_id)) continue;
    const acc = porProducto.get(q.producto_id) ?? { aMano: 0, reservado: 0 };
    acc.aMano += Number(q.cantidad);
    acc.reservado += Number(q.reservado);
    porProducto.set(q.producto_id, acc);
  }

  return (productos.data ?? []).map((r) => {
    const p = aProducto(r);
    const s = porProducto.get(p.id) ?? { aMano: 0, reservado: 0 };
    const aMano = redondear(s.aMano);
    return { ...p, aMano, disponible: disponible({ cantidad: s.aMano, reservado: s.reservado }), valor: valorizar(aMano, p.costo) };
  });
}

/** Conjunto de ids de ubicaciones internas (las que cuentan como stock propio). */
async function idsInternos(): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from(T.ubicaciones).select("id").eq("tipo", "interna");
  return new Set((data ?? []).map((u) => u.id as string));
}

export interface StockPorUbicacion {
  ubicacion: Ubicacion;
  cantidad: number;
  reservado: number;
}

export interface FichaProducto {
  producto: Producto;
  stock: StockPorUbicacion[];
  aMano: number;
  lotes: Lote[];
  reglas: Regla[];
  movimientos: (Movimiento & { referencia: string; fecha: string; estadoTransferencia: string })[];
}

export async function obtenerFichaProducto(id: string): Promise<FichaProducto | null> {
  const { data: prodRow, error } = await supabaseAdmin.from(T.productos).select("*").eq("id", id).maybeSingle();
  revienta("obtener producto", error);
  if (!prodRow) return null;
  const producto = aProducto(prodRow);

  const [quants, ubicaciones, lotes, reglas, movs] = await Promise.all([
    supabaseAdmin.from(T.quants).select("*").eq("producto_id", id),
    listarUbicaciones(),
    supabaseAdmin.from(T.lotes).select("*").eq("producto_id", id).order("creado_en", { ascending: false }),
    supabaseAdmin.from(T.reglas).select("*").eq("producto_id", id),
    supabaseAdmin
      .from(T.movimientos)
      .select("*, inv_transferencias!inner(referencia, estado, creado_en)")
      .eq("producto_id", id)
      .order("creado_en", { ascending: false })
      .limit(40),
  ]);

  const porUbi = new Map((ubicaciones).map((u) => [u.id, u]));
  const stock: StockPorUbicacion[] = (quants.data ?? [])
    .map(aQuant)
    .map((q) => ({ ubicacion: porUbi.get(q.ubicacionId)!, cantidad: q.cantidad, reservado: q.reservado }))
    .filter((s) => s.ubicacion && s.ubicacion.tipo === "interna" && (s.cantidad !== 0 || s.reservado !== 0));

  const aMano = redondear(stock.reduce((t, s) => t + s.cantidad, 0));

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const movimientos = (movs.data ?? []).map((r: any) => ({
    ...aMovimiento(r),
    referencia: r.inv_transferencias?.referencia ?? "",
    fecha: r.inv_transferencias?.creado_en ?? r.creado_en,
    estadoTransferencia: r.inv_transferencias?.estado ?? "",
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { producto, stock, aMano, lotes: (lotes.data ?? []).map(aLote), reglas: (reglas.data ?? []).map(aRegla), movimientos };
}

export async function listarLotes(productoId: string): Promise<Lote[]> {
  const { data, error } = await supabaseAdmin.from(T.lotes).select("*").eq("producto_id", productoId).order("nombre");
  revienta("listar lotes", error);
  return (data ?? []).map(aLote);
}

// =============================================================================
//  TRANSFERENCIAS
// =============================================================================

export interface FiltroTransferencias {
  clase?: ClaseOperacion;
  estado?: string;
}

export async function listarTransferencias(filtro: FiltroTransferencias = {}): Promise<Transferencia[]> {
  let q = supabaseAdmin.from(T.transferencias).select("*").order("creado_en", { ascending: false }).limit(200);
  if (filtro.clase) q = q.eq("clase", filtro.clase);
  if (filtro.estado) q = q.eq("estado", filtro.estado);
  const { data, error } = await q;
  revienta("listar transferencias", error);
  return (data ?? []).map(aTransferencia);
}

export interface DetalleTransferencia {
  transferencia: Transferencia;
  movimientos: Movimiento[];
}

export async function obtenerTransferencia(id: string): Promise<DetalleTransferencia | null> {
  const { data: t, error } = await supabaseAdmin.from(T.transferencias).select("*").eq("id", id).maybeSingle();
  revienta("obtener transferencia", error);
  if (!t) return null;
  const { data: m } = await supabaseAdmin.from(T.movimientos).select("*").eq("transferencia_id", id).order("creado_en");
  return { transferencia: aTransferencia(t), movimientos: (m ?? []).map(aMovimiento) };
}

export interface LineaNueva {
  productoId: string;
  cantidad: number;
  unidadId?: string | null;
  loteId?: string | null;
}

/**
 * Crea una transferencia en borrador con sus líneas. Toma origen/destino del
 * tipo de operación (o de los que se pasen), y numera el documento con el
 * correlativo del tipo.
 */
export async function crearTransferencia(datos: {
  tipoOperacionId: string;
  contraparte?: string | null;
  nota?: string | null;
  fechaProgramada?: string | null;
  ubicacionOrigenId?: string | null;
  ubicacionDestinoId?: string | null;
  creadoPor?: string | null;
  lineas: LineaNueva[];
}): Promise<string> {
  const { data: tipoRow, error: errTipo } = await supabaseAdmin
    .from(T.tiposOperacion).select("*").eq("id", datos.tipoOperacionId).maybeSingle();
  revienta("leer tipo de operación", errTipo);
  if (!tipoRow) throw new Error("[inventario] tipo de operación inexistente");
  const tipo = aTipoOperacion(tipoRow);

  const origen = datos.ubicacionOrigenId ?? tipo.ubicacionOrigenId;
  const destino = datos.ubicacionDestinoId ?? tipo.ubicacionDestinoId;
  if (!origen || !destino) throw new Error("[inventario] falta ubicación de origen o destino");
  if (datos.lineas.length === 0) throw new Error("[inventario] la transferencia necesita al menos una línea");

  // Numeración: subimos el correlativo del tipo y usamos el nuevo número.
  const referencia = siguienteReferencia(tipo.prefijo, tipo.correlativo);
  const { error: errCorr } = await supabaseAdmin
    .from(T.tiposOperacion).update({ correlativo: tipo.correlativo + 1 }).eq("id", tipo.id).eq("correlativo", tipo.correlativo);
  revienta("numerar transferencia", errCorr);

  const { data: creada, error: errT } = await supabaseAdmin
    .from(T.transferencias)
    .insert({
      referencia,
      tipo_operacion_id: tipo.id,
      clase: tipo.clase,
      ubicacion_origen_id: origen,
      ubicacion_destino_id: destino,
      contraparte: datos.contraparte ?? null,
      nota: datos.nota ?? null,
      fecha_programada: datos.fechaProgramada ?? null,
      creado_por: datos.creadoPor ?? null,
    })
    .select("id")
    .single();
  revienta("crear transferencia", errT);

  const filas = datos.lineas.map((l) => ({
    transferencia_id: creada!.id,
    producto_id: l.productoId,
    unidad_id: l.unidadId ?? null,
    lote_id: l.loteId ?? null,
    ubicacion_origen_id: origen,
    ubicacion_destino_id: destino,
    cantidad: l.cantidad,
  }));
  const { error: errM } = await supabaseAdmin.from(T.movimientos).insert(filas);
  revienta("crear líneas", errM);

  return creada!.id;
}

export async function reservarTransferencia(id: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("inv_reservar_transferencia", { p_id: id });
  revienta("reservar transferencia", error);
}

export async function validarTransferencia(id: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("inv_validar_transferencia", { p_id: id });
  revienta("validar transferencia", error);
}

export async function cancelarTransferencia(id: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("inv_cancelar_transferencia", { p_id: id });
  revienta("cancelar transferencia", error);
}

// =============================================================================
//  AJUSTE DE INVENTARIO
// =============================================================================

/**
 * Ajusta la cantidad a mano de un producto en una ubicación a un conteo real,
 * creando y validando una transferencia contra la ubicación de ajuste. Si sobra
 * stock, sale hacia Ajustes; si falta, entra desde Ajustes.
 */
export async function ajustarInventario(datos: {
  productoId: string;
  ubicacionId: string;
  loteId?: string | null;
  cantidadContada: number;
  creadoPor?: string | null;
}): Promise<{ referencia: string; diferencia: number } | null> {
  let consultaQuant = supabaseAdmin
    .from(T.quants).select("cantidad")
    .eq("producto_id", datos.productoId).eq("ubicacion_id", datos.ubicacionId);
  consultaQuant = datos.loteId ? consultaQuant.eq("lote_id", datos.loteId) : consultaQuant.is("lote_id", null);

  const [{ data: ubiAjuste }, { data: tipoAjuste }, { data: quant }] = await Promise.all([
    supabaseAdmin.from(T.ubicaciones).select("id").eq("tipo", "ajuste").eq("activo", true).limit(1).maybeSingle(),
    supabaseAdmin.from(T.tiposOperacion).select("*").eq("clase", "ajuste").eq("activo", true).limit(1).maybeSingle(),
    consultaQuant.maybeSingle(),
  ]);
  if (!ubiAjuste || !tipoAjuste) throw new Error("[inventario] falta la ubicación o el tipo de operación de ajuste");

  const actual = Number(quant?.cantidad ?? 0);
  const diferencia = redondear(datos.cantidadContada - actual);
  if (diferencia === 0) return null;

  // Sobra (diferencia<0): stock → Ajustes. Falta (diferencia>0): Ajustes → stock.
  const origen = diferencia > 0 ? (ubiAjuste.id as string) : datos.ubicacionId;
  const destino = diferencia > 0 ? datos.ubicacionId : (ubiAjuste.id as string);

  const tipo = aTipoOperacion(tipoAjuste);
  const referencia = siguienteReferencia(tipo.prefijo, tipo.correlativo);
  await supabaseAdmin.from(T.tiposOperacion).update({ correlativo: tipo.correlativo + 1 }).eq("id", tipo.id);

  const { data: creada, error } = await supabaseAdmin
    .from(T.transferencias)
    .insert({
      referencia, tipo_operacion_id: tipo.id, clase: "ajuste",
      ubicacion_origen_id: origen, ubicacion_destino_id: destino,
      nota: "Ajuste de inventario", creado_por: datos.creadoPor ?? null,
    })
    .select("id").single();
  revienta("crear ajuste", error);

  await supabaseAdmin.from(T.movimientos).insert({
    transferencia_id: creada!.id, producto_id: datos.productoId, lote_id: datos.loteId ?? null,
    ubicacion_origen_id: origen, ubicacion_destino_id: destino, cantidad: Math.abs(diferencia),
  });
  await validarTransferencia(creada!.id);
  return { referencia, diferencia };
}

// =============================================================================
//  TABLERO, REABASTECIMIENTO y VALORIZACIÓN
// =============================================================================

export interface Tablero {
  productos: number;
  valorInventario: number;
  bajoMinimo: number;
  transferenciasPendientes: number;
  recientes: (Transferencia & { nLineas: number })[];
}

export async function tablero(): Promise<Tablero> {
  const [productos, pendientes, recientes, reab] = await Promise.all([
    listarProductosConStock(),
    supabaseAdmin.from(T.transferencias).select("id", { count: "exact", head: true }).in("estado", ["borrador", "listo"]),
    supabaseAdmin.from(T.transferencias).select("*").order("creado_en", { ascending: false }).limit(8),
    reporteReabastecimiento(),
  ]);

  const valorInventario = redondear(productos.reduce((t, p) => t + p.valor, 0));
  const recientesIds = (recientes.data ?? []).map((r) => r.id);
  const conteos = await conteoLineas(recientesIds);

  return {
    productos: productos.length,
    valorInventario,
    bajoMinimo: reab.length,
    transferenciasPendientes: pendientes.count ?? 0,
    recientes: (recientes.data ?? []).map((r) => ({ ...aTransferencia(r), nLineas: conteos.get(r.id) ?? 0 })),
  };
}

async function conteoLineas(transferenciaIds: string[]): Promise<Map<string, number>> {
  if (transferenciaIds.length === 0) return new Map();
  const { data } = await supabaseAdmin.from(T.movimientos).select("transferencia_id").in("transferencia_id", transferenciaIds);
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.transferencia_id, (m.get(r.transferencia_id) ?? 0) + 1);
  return m;
}

export interface FilaReabastecimiento {
  producto: Producto;
  ubicacion: Ubicacion;
  disponible: number;
  minimo: number;
  maximo: number;
  sugerido: number;
}

/** Productos cuyo disponible cayó bajo su mínimo, con cuánto reponer. */
export async function reporteReabastecimiento(): Promise<FilaReabastecimiento[]> {
  const [reglas, productos, ubicaciones, quants] = await Promise.all([
    supabaseAdmin.from(T.reglas).select("*").eq("activo", true),
    supabaseAdmin.from(T.productos).select("*").eq("activo", true),
    listarUbicaciones(),
    supabaseAdmin.from(T.quants).select("producto_id, ubicacion_id, cantidad, reservado"),
  ]);

  const prodPorId = new Map((productos.data ?? []).map((r) => [r.id, aProducto(r)]));
  const ubiPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  // Sumamos todos los lotes de un mismo (producto, ubicación).
  const dispPorClave = new Map<string, number>();
  for (const q of quants.data ?? []) {
    const clave = `${q.producto_id}|${q.ubicacion_id}`;
    const acum = dispPorClave.get(clave) ?? 0;
    dispPorClave.set(clave, acum + disponible({ cantidad: Number(q.cantidad), reservado: Number(q.reservado) }));
  }

  const filas: FilaReabastecimiento[] = [];
  for (const r of (reglas.data ?? []).map(aRegla)) {
    const producto = prodPorId.get(r.productoId);
    const ubicacion = ubiPorId.get(r.ubicacionId);
    if (!producto || !ubicacion) continue;
    const disp = dispPorClave.get(`${r.productoId}|${r.ubicacionId}`) ?? 0;
    const sugerido = sugerenciaDeReposicion(disp, r);
    if (sugerido <= 0) continue;
    filas.push({ producto, ubicacion, disponible: disp, minimo: r.minimo, maximo: r.maximo, sugerido });
  }
  return filas.sort((a, b) => b.sugerido - a.sugerido);
}

export interface FilaValorizacion {
  producto: Producto;
  aMano: number;
  costo: number;
  valor: number;
}

export async function valorizacion(): Promise<{ filas: FilaValorizacion[]; total: number }> {
  const productos = await listarProductosConStock();
  const filas = productos
    .filter((p) => p.tipo === "almacenable")
    .map((p) => ({ producto: p, aMano: p.aMano, costo: p.costo, valor: p.valor }))
    .sort((a, b) => b.valor - a.valor);
  const total = redondear(filas.reduce((t, f) => t + f.valor, 0));
  return { filas, total };
}

// =============================================================================
//  ESCRITURAS DE CATÁLOGO (CRUD simple)
// =============================================================================

export async function crearProducto(d: {
  nombre: string; sku?: string | null; descripcion?: string | null; categoriaId?: string | null;
  unidadId?: string | null; tipo?: string; seguimiento?: string; costo?: number; precio?: number;
}): Promise<string> {
  const { data, error } = await supabaseAdmin.from(T.productos).insert({
    nombre: d.nombre, sku: d.sku || null, descripcion: d.descripcion || null, categoria_id: d.categoriaId || null,
    unidad_id: d.unidadId || null, tipo: d.tipo || "almacenable", seguimiento: d.seguimiento || "ninguno",
    costo: d.costo ?? 0, precio: d.precio ?? 0,
  }).select("id").single();
  revienta("crear producto", error);
  return data!.id;
}

export async function actualizarProducto(id: string, d: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from(T.productos)
    .update({ ...d, actualizado_en: new Date().toISOString() }).eq("id", id);
  revienta("actualizar producto", error);
}

export async function desactivarProducto(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.productos).update({ activo: false }).eq("id", id);
  revienta("desactivar producto", error);
}

export async function crearCategoria(nombre: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.categorias).insert({ nombre });
  revienta("crear categoría", error);
}

export async function crearUnidad(nombre: string, abreviacion: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.unidades).insert({ nombre, abreviacion });
  revienta("crear unidad", error);
}

export async function crearUbicacion(d: { nombre: string; tipo: string; codigo?: string | null; almacenId?: string | null; padreId?: string | null }): Promise<void> {
  const { error } = await supabaseAdmin.from(T.ubicaciones).insert({
    nombre: d.nombre, tipo: d.tipo, codigo: d.codigo || null, almacen_id: d.almacenId || null, padre_id: d.padreId || null,
  });
  revienta("crear ubicación", error);
}

export async function crearAlmacen(nombre: string, codigo: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.almacenes).insert({ nombre, codigo });
  revienta("crear almacén", error);
}

export async function crearLote(productoId: string, nombre: string, fechaVencimiento?: string | null): Promise<string> {
  const { data, error } = await supabaseAdmin.from(T.lotes)
    .insert({ producto_id: productoId, nombre, fecha_vencimiento: fechaVencimiento || null }).select("id").single();
  revienta("crear lote", error);
  return data!.id;
}

export async function guardarRegla(d: { productoId: string; ubicacionId: string; minimo: number; maximo: number }): Promise<void> {
  const { error } = await supabaseAdmin.from(T.reglas).upsert(
    { producto_id: d.productoId, ubicacion_id: d.ubicacionId, minimo: d.minimo, maximo: d.maximo, activo: true },
    { onConflict: "producto_id,ubicacion_id" },
  );
  revienta("guardar regla", error);
}

export async function eliminarRegla(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.reglas).delete().eq("id", id);
  revienta("eliminar regla", error);
}
