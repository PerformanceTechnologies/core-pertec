import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { borrarArchivos, enlaceTemporal, guardarArchivo } from "./archivos/almacen";
import { nombreUnico } from "./archivos/sharepoint-core";
import { carpetaCertificado, carpetaFotosProducto } from "./archivos/carpetas";
import {
  disponible,
  pronosticado,
  redondear,
  siguienteReferencia,
  sugerenciaDeReposicion,
  valorizar,
  MAX_FOTOS_PRODUCTO,
  type Almacen,
  type FotoGuardada,
  type FotoProducto,
  type Categoria,
  type ClaseOperacion,
  type LineaValor,
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
  id: r.id, sku: r.sku, nombre: r.nombre, marca: r.marca ?? null, descripcion: r.descripcion,
  categoriaId: r.categoria_id, unidadId: r.unidad_id, tipo: r.tipo, seguimiento: r.seguimiento,
  costo: Number(r.costo), metodoCosto: r.metodo_costo ?? "estandar", precio: Number(r.precio), activo: r.activo,
  ubicacionId: r.ubicacion_id ?? null, requiereCertificacion: Boolean(r.requiere_certificacion),
  certificadoNombre: r.certificado_nombre ?? null, tieneCertificado: Boolean(r.certificado_ruta),
  certificadoVence: r.certificado_vence ?? null, fechaVencimiento: r.fecha_vencimiento ?? null,
  cantidadFotos: Array.isArray(r.fotos) ? r.fotos.length : 0,
  estadoOperativo: r.estado_operativo === "no_operativo" ? "no_operativo" : "operativo",
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
  backorderDe: r.backorder_de ?? null,
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
  /** Lo que llega en recepciones aún no validadas. */
  entrante: number;
  /** Lo que sale en entregas aún no validadas. */
  saliente: number;
  /** a mano + entrante - saliente. */
  pronosticado: number;
  valor: number;
}

/** Productos con su stock total (solo cuenta ubicaciones internas). */
export async function listarProductosConStock(): Promise<ProductoConStock[]> {
  const [productos, quants, internas, pendientes] = await Promise.all([
    supabaseAdmin.from(T.productos).select("*").eq("activo", true).order("nombre"),
    supabaseAdmin.from(T.quants).select("producto_id, ubicacion_id, cantidad, reservado"),
    idsInternos(),
    supabaseAdmin
      .from(T.movimientos)
      .select("producto_id, ubicacion_origen_id, ubicacion_destino_id, cantidad, inv_transferencias!inner(estado)")
      .eq("estado", "borrador")
      .in("inv_transferencias.estado", ["borrador", "listo"]),
  ]);
  revienta("leer movimientos pendientes", pendientes.error);
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

  // Entra lo que va de fuera hacia stock propio; sale lo que va de stock hacia fuera.
  const flujo = new Map<string, { entrante: number; saliente: number }>();
  for (const m of pendientes.data ?? []) {
    const desdeStock = internas.has(m.ubicacion_origen_id);
    const haciaStock = internas.has(m.ubicacion_destino_id);
    if (desdeStock === haciaStock) continue;
    const acc = flujo.get(m.producto_id) ?? { entrante: 0, saliente: 0 };
    if (haciaStock) acc.entrante += Number(m.cantidad);
    else acc.saliente += Number(m.cantidad);
    flujo.set(m.producto_id, acc);
  }

  return (productos.data ?? []).map((r) => {
    const p = aProducto(r);
    const s = porProducto.get(p.id) ?? { aMano: 0, reservado: 0 };
    const f = flujo.get(p.id) ?? { entrante: 0, saliente: 0 };
    const aMano = redondear(s.aMano);
    return {
      ...p, aMano, disponible: disponible({ cantidad: s.aMano, reservado: s.reservado }),
      entrante: redondear(f.entrante), saliente: redondear(f.saliente),
      pronosticado: pronosticado(aMano, f.entrante, f.saliente), valor: valorizar(aMano, p.costo),
    };
  });
}

/**
 * Lo que hay hoy de cada producto en cada ubicación interna, con clave «producto|ubicación».
 * Lo usan los asistentes de operación y ajuste para mostrar el stock mientras se completa.
 */
export async function mapaDeStock(): Promise<Record<string, { aMano: number; disponible: number }>> {
  const [quants, internas] = await Promise.all([
    supabaseAdmin.from(T.quants).select("producto_id, ubicacion_id, cantidad, reservado"),
    idsInternos(),
  ]);
  revienta("leer quants", quants.error);
  const mapa: Record<string, { aMano: number; disponible: number }> = {};
  for (const q of quants.data ?? []) {
    if (!internas.has(q.ubicacion_id)) continue;
    const clave = `${q.producto_id}|${q.ubicacion_id}`;
    const acc = mapa[clave] ?? { aMano: 0, disponible: 0 };
    acc.aMano = redondear(acc.aMano + Number(q.cantidad));
    acc.disponible = redondear(acc.disponible + disponible({ cantidad: Number(q.cantidad), reservado: Number(q.reservado) }));
    mapa[clave] = acc;
  }
  return mapa;
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
  /** Costo de compra por unidad; en recepciones alimenta el costo promedio. */
  costoUnitario?: number | null;
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
    costo_unitario: l.costoUnitario ?? null,
  }));
  const { error: errM } = await supabaseAdmin.from(T.movimientos).insert(filas);
  revienta("crear líneas", errM);

  return creada!.id;
}

export async function reservarTransferencia(id: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("inv_reservar_transferencia", { p_id: id });
  revienta("reservar transferencia", error);
}

/**
 * Valida una transferencia. `hechas` (id de línea → cantidad) permite una
 * entrega parcial: lo que falte queda en un backorder, cuyo id se devuelve.
 */
export async function validarTransferencia(id: string, hechas?: Record<string, number>): Promise<string | null> {
  // Sin entrega parcial no se manda p_hechas: así también funciona con la función de la
  // migración 0001 si la 0002 todavía no se corrió en la base.
  const parametros = hechas ? { p_id: id, p_hechas: hechas } : { p_id: id };
  const { data, error } = await supabaseAdmin.rpc("inv_validar_transferencia", parametros);
  if (error && hechas && /Could not find the function/i.test(error.message)) {
    throw new Error("[inventario] La entrega parcial necesita la migración supabase/inventario/0002_inventario_odoo.sql en la base.");
  }
  revienta("validar transferencia", error);
  return (data as string | null) ?? null;
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
  try {
    await validarTransferencia(creada!.id);
  } catch (e) {
    // Si no se pudo validar, el ajuste no queda colgando en borrador: se borra (con su línea).
    await supabaseAdmin.from(T.transferencias).delete().eq("id", creada!.id);
    throw e;
  }
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
  /** null: el mínimo general, que mira todas las bodegas juntas. */
  ubicacion: Ubicacion | null;
  disponible: number;
  minimo: number;
  maximo: number;
  sugerido: number;
}

// ---------- Mínimo general (para todos los productos) -------------------------

export interface MinimoGeneral {
  minimo: number;
  maximo: number;
}

/** El aviso de stock bajo que vale para todos los productos sin mínimo propio. Sin la tabla: 0 (no avisa). */
export async function leerMinimoGeneral(): Promise<MinimoGeneral> {
  const { data, error } = await supabaseAdmin.from("inv_configuracion").select("minimo_general, maximo_general").eq("id", 1).maybeSingle();
  if (error || !data) return { minimo: 0, maximo: 0 };
  return { minimo: Number(data.minimo_general) || 0, maximo: Number(data.maximo_general) || 0 };
}

export async function guardarMinimoGeneral(d: MinimoGeneral): Promise<void> {
  const { error } = await supabaseAdmin
    .from("inv_configuracion")
    .upsert({ id: 1, minimo_general: d.minimo, maximo_general: d.maximo, actualizado_en: new Date().toISOString() });
  if (error && /inv_configuracion/.test(error.message)) throw new Error("[inventario] Falta la tabla de configuración: corre el SQL del mínimo general.");
  revienta("guardar el mínimo general", error);
}

/**
 * Productos bajo su mínimo, con cuánto reponer. Los que tienen mínimo propio (en su ficha) se
 * miran bodega por bodega; el resto usa el mínimo general, sumando todas las bodegas.
 */
export async function reporteReabastecimiento(): Promise<FilaReabastecimiento[]> {
  const [reglas, productos, ubicaciones, quants, general] = await Promise.all([
    supabaseAdmin.from(T.reglas).select("*").eq("activo", true),
    supabaseAdmin.from(T.productos).select("*").eq("activo", true),
    listarUbicaciones(),
    supabaseAdmin.from(T.quants).select("producto_id, ubicacion_id, cantidad, reservado"),
    leerMinimoGeneral(),
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

  if (general.minimo > 0) {
    const conReglaPropia = new Set((reglas.data ?? []).map((r) => String(r.producto_id)));
    const internas = new Set(ubicaciones.filter((u) => u.tipo === "interna").map((u) => u.id));
    const totalPorProducto = new Map<string, number>();
    for (const [clave, disp] of dispPorClave) {
      const [productoId, ubicacionId] = clave.split("|");
      if (internas.has(ubicacionId)) totalPorProducto.set(productoId, (totalPorProducto.get(productoId) ?? 0) + disp);
    }
    for (const producto of prodPorId.values()) {
      if (producto.tipo !== "almacenable" || conReglaPropia.has(producto.id)) continue;
      const disp = totalPorProducto.get(producto.id) ?? 0;
      const sugerido = sugerenciaDeReposicion(disp, general);
      if (sugerido <= 0) continue;
      filas.push({ producto, ubicacion: null, disponible: disp, minimo: general.minimo, maximo: Math.max(general.maximo, general.minimo), sugerido });
    }
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

/**
 * Cada cantidad a mano en una ubicación interna, valorizada al costo del producto. La
 * «bodega» es el almacén de la ubicación (o la ubicación misma si no tiene almacén).
 */
export async function lineasDeValor(): Promise<LineaValor[]> {
  const [quants, productos, categorias, ubicaciones, almacenes] = await Promise.all([
    supabaseAdmin.from(T.quants).select("producto_id, ubicacion_id, cantidad").neq("cantidad", 0),
    supabaseAdmin.from(T.productos).select("id, nombre, sku, categoria_id, costo, tipo").eq("activo", true).eq("tipo", "almacenable"),
    listarCategorias(),
    listarUbicaciones(),
    listarAlmacenes(),
  ]);
  revienta("leer quants", quants.error);
  revienta("leer productos", productos.error);
  const prod = new Map((productos.data ?? []).map((p) => [p.id as string, p]));
  const cat = new Map(categorias.map((c) => [c.id, c.nombre]));
  const ubi = new Map(ubicaciones.map((u) => [u.id, u]));
  const alm = new Map(almacenes.map((a) => [a.id, a]));

  const lineas: LineaValor[] = [];
  for (const q of quants.data ?? []) {
    const p = prod.get(q.producto_id as string);
    const u = ubi.get(q.ubicacion_id as string);
    if (!p || !u || u.tipo !== "interna") continue;
    const a = u.almacenId ? alm.get(u.almacenId) : undefined;
    const cantidad = Number(q.cantidad);
    const costo = Number(p.costo);
    lineas.push({
      productoId: p.id as string, nombre: p.nombre as string, sku: (p.sku as string | null) ?? null,
      categoria: p.categoria_id ? cat.get(p.categoria_id as string) ?? "Sin categoría" : "Sin categoría",
      bodegaId: a?.id ?? u.id, bodega: a?.nombre ?? u.nombre,
      cantidad, costo, valor: valorizar(cantidad, costo),
    });
  }
  return lineas;
}

// =============================================================================
//  ESCRITURAS DE CATÁLOGO (CRUD simple)
// =============================================================================

export async function crearProducto(d: {
  nombre: string; sku?: string | null; marca?: string | null; descripcion?: string | null; categoriaId?: string | null;
  unidadId?: string | null; tipo?: string; seguimiento?: string; costo?: number; precio?: number; metodoCosto?: string;
  ubicacionId?: string | null; requiereCertificacion?: boolean; certificadoVence?: string | null; fechaVencimiento?: string | null;
  estadoOperativo?: string;
}): Promise<string> {
  const { data, error } = await supabaseAdmin.from(T.productos).insert({
    nombre: d.nombre, sku: d.sku || null, ...(d.marca ? { marca: d.marca } : {}), descripcion: d.descripcion || null, categoria_id: d.categoriaId || null,
    unidad_id: d.unidadId || null, tipo: d.tipo || "almacenable", seguimiento: d.seguimiento || "ninguno",
    costo: d.costo ?? 0, precio: d.precio ?? 0, metodo_costo: d.metodoCosto || "promedio",
    ubicacion_id: d.ubicacionId || null, requiere_certificacion: d.requiereCertificacion ?? false,
    certificado_vence: d.certificadoVence || null, fecha_vencimiento: d.fechaVencimiento || null,
    estado_operativo: d.estadoOperativo || "operativo",
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

/** Cuántos productos (activos o no) usa cada categoría, para avisar antes de borrarla. */
export async function productosPorCategoria(): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin.from(T.productos).select("categoria_id").not("categoria_id", "is", null);
  revienta("contar productos por categoría", error);
  const cuenta = new Map<string, number>();
  for (const p of data ?? []) cuenta.set(p.categoria_id as string, (cuenta.get(p.categoria_id as string) ?? 0) + 1);
  return cuenta;
}

/** Borra la categoría. Sus productos no se tocan: quedan «sin categoría» (on delete set null). */
export async function eliminarCategoria(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.categorias).delete().eq("id", id);
  revienta("eliminar categoría", error);
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

// =============================================================================
//  CERTIFICADO DEL PRODUCTO (bucket privado "inventario")
// =============================================================================

const BUCKET_INV = "inventario";

/** Sube (o reemplaza) el certificado de un producto; el anterior se borra después de guardar. */
export async function guardarCertificado(productoId: string, contenido: Buffer, extension: string, tipo: string, nombre: string): Promise<void> {
  const { data: antes } = await supabaseAdmin.from(T.productos).select("certificado_ruta, nombre, sku").eq("id", productoId).maybeSingle();
  const ruta = await guardarArchivo({
    carpeta: carpetaCertificado({ id: productoId, nombre: antes?.nombre as string | undefined, sku: antes?.sku as string | undefined }),
    nombre: nombreUnico(nombre, extension),
    contenido,
    tipo,
    respaldo: { bucket: BUCKET_INV, ruta: `certificados/${productoId}/${crypto.randomUUID()}.${extension}` },
  });
  const { error } = await supabaseAdmin.from(T.productos)
    .update({ certificado_ruta: ruta, certificado_nombre: nombre.slice(0, 200), actualizado_en: new Date().toISOString() })
    .eq("id", productoId);
  if (error) {
    await borrarArchivos(BUCKET_INV, [ruta]);
    revienta("guardar certificado", error);
  }
  if (antes?.certificado_ruta) await borrarArchivos(BUCKET_INV, [antes.certificado_ruta as string]);
}

export async function quitarCertificado(productoId: string): Promise<void> {
  const { data: antes } = await supabaseAdmin.from(T.productos).select("certificado_ruta").eq("id", productoId).maybeSingle();
  const { error } = await supabaseAdmin.from(T.productos)
    .update({ certificado_ruta: null, certificado_nombre: null, actualizado_en: new Date().toISOString() }).eq("id", productoId);
  revienta("quitar certificado", error);
  if (antes?.certificado_ruta) await borrarArchivos(BUCKET_INV, [antes.certificado_ruta as string]);
}

/** Enlace de un minuto para ver el certificado, con su nombre original. */
export async function enlaceCertificado(productoId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from(T.productos).select("certificado_ruta, certificado_nombre").eq("id", productoId).maybeSingle();
  if (!data?.certificado_ruta) return null;
  return enlaceTemporal(BUCKET_INV, data.certificado_ruta as string, { segundos: 60, descarga: (data.certificado_nombre as string) || true });
}

// =============================================================================
//  FOTOS DEL PRODUCTO (en SharePoint, «Inventario/Fotos/<producto>/»)
// =============================================================================

async function leerFotos(productoId: string): Promise<{ fotos: FotoGuardada[]; nombre: string; sku: string | null } | null> {
  const { data, error } = await supabaseAdmin.from(T.productos).select("nombre, sku, fotos").eq("id", productoId).maybeSingle();
  if (error) throw new Error(/fotos/.test(error.message) ? "[inventario] Falta la columna de fotos en la base: corre el SQL de fotos de productos." : `[inventario] leer fotos: ${error.message}`);
  if (!data) return null;
  return { fotos: Array.isArray(data.fotos) ? (data.fotos as FotoGuardada[]) : [], nombre: data.nombre as string, sku: (data.sku as string | null) ?? null };
}

/** Las fotos de un producto con enlaces de una hora (redondeados, para que el navegador las guarde). */
export async function fotosDeProducto(productoId: string): Promise<FotoProducto[]> {
  const datos = await leerFotos(productoId).catch(() => null);
  if (!datos) return [];
  const fotos = await Promise.all(
    datos.fotos.map(async (f, indice) => {
      const [url, miniatura] = await Promise.all([
        enlaceTemporal(BUCKET_INV, f.ruta, { segundos: 3600, redondear: true }),
        enlaceTemporal(BUCKET_INV, f.miniatura, { segundos: 3600, redondear: true }),
      ]);
      return url && miniatura ? { indice, url, miniatura, nombre: f.nombre } : null;
    }),
  );
  return fotos.filter((f): f is FotoProducto => f !== null);
}

/** La miniatura de la primera foto de cada producto que tenga, para la lista. */
export async function miniaturasDeProductos(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin.from(T.productos).select("id, fotos").neq("fotos", "[]");
  if (error) return new Map(); // sin la columna todavía: la lista sale con iniciales
  const pares = await Promise.all(
    ((data ?? []) as { id: string; fotos: FotoGuardada[] | null }[])
      .filter((f) => Array.isArray(f.fotos) && f.fotos[0]?.miniatura)
      .map(async (f) => [f.id, await enlaceTemporal(BUCKET_INV, f.fotos![0].miniatura, { segundos: 3600, redondear: true })] as const),
  );
  return new Map(pares.filter((p): p is readonly [string, string] => Boolean(p[1])));
}

/** Agrega una foto ya normalizada (ver lib/inventario-fotos.ts). */
export async function agregarFotoProducto(
  productoId: string,
  foto: { grande: Buffer; miniatura: Buffer; nombre: string },
): Promise<void> {
  const datos = await leerFotos(productoId);
  if (!datos) throw new Error("[inventario] Ese producto ya no existe.");
  if (datos.fotos.length >= MAX_FOTOS_PRODUCTO) throw new Error(`[inventario] Un producto puede tener hasta ${MAX_FOTOS_PRODUCTO} fotos.`);
  const carpeta = carpetaFotosProducto({ id: productoId, nombre: datos.nombre, sku: datos.sku });
  const base = foto.nombre.replace(/\.[^.]*$/, "").trim() || "foto";
  const ruta = await guardarArchivo({
    carpeta, nombre: nombreUnico(base, "jpg"), contenido: foto.grande, tipo: "image/jpeg",
    respaldo: { bucket: BUCKET_INV, ruta: `fotos/${productoId}/${crypto.randomUUID()}.jpg` },
  });
  let miniatura: string;
  try {
    miniatura = await guardarArchivo({
      carpeta: `${carpeta}/Miniaturas`, nombre: nombreUnico(base, "jpg"), contenido: foto.miniatura, tipo: "image/jpeg",
      respaldo: { bucket: BUCKET_INV, ruta: `fotos/${productoId}/${crypto.randomUUID()}-min.jpg` },
    });
  } catch (e) {
    await borrarArchivos(BUCKET_INV, [ruta]);
    throw e;
  }
  // Se relee justo antes de guardar: dos fotos subidas a la vez no se pisan.
  const ahora = (await leerFotos(productoId))?.fotos ?? [];
  const { error } = await supabaseAdmin.from(T.productos)
    .update({ fotos: [...ahora, { ruta, miniatura, nombre: foto.nombre.slice(0, 200) }], actualizado_en: new Date().toISOString() })
    .eq("id", productoId);
  if (error) {
    await borrarArchivos(BUCKET_INV, [ruta, miniatura]);
    revienta("guardar la foto", error);
  }
}

/** Quita una foto (sus dos versiones van a la papelera del sitio). */
export async function quitarFotoProducto(productoId: string, indice: number): Promise<void> {
  const datos = await leerFotos(productoId);
  const foto = datos?.fotos[indice];
  if (!datos || !foto) return;
  const { error } = await supabaseAdmin.from(T.productos)
    .update({ fotos: datos.fotos.filter((_, i) => i !== indice), actualizado_en: new Date().toISOString() })
    .eq("id", productoId);
  revienta("quitar la foto", error);
  await borrarArchivos(BUCKET_INV, [foto.ruta, foto.miniatura]);
}
