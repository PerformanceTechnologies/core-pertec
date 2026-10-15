import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { idDelContrato } from "./contrato-actual";
import { olvidarResumen, listarCategorias, listarPartidas } from "./arranque";
import {
  ahorroDeLinea,
  contarPendientesDeCotizacion,
  estadoDeLineaSegunCotizaciones,
  mejorCotizacionDeLinea,
  resumirPresupuesto,
  type Cotizacion,
  type EstadoDeCotizacion,
  type Moneda,
  type PendientesDeCotizacion,
  type ResumenDePresupuesto,
} from "./gastos-modelo";
import { hoyEnChile } from "./acreditacion-modelo";
import type { Categoria, Partida } from "./arranque-modelo";
import type { UsuarioConAcceso } from "./tipos";

const T = {
  presupuesto: "ct_gastos_presupuesto",
  historial: "ct_gastos_presupuesto_historial",
  categorias: "ct_arranque_categorias",
  partidas: "ct_arranque_partidas",
  cotizaciones: "ct_arranque_cotizaciones",
  aprobadores: "ct_gastos_aprobadores",
  cambios: "ct_gastos_tipos_de_cambio",
} as const;

type Fila = Record<string, unknown>;

/** Supabase corta cada consulta en 1.000 filas y no avisa. */
const PAGINA = 1000;

function fallar(error: { message: string; code?: string }, mensajes: Record<string, string> = {}): never {
  throw new Error((error.code && mensajes[error.code]) || error.message);
}

const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

// -----------------------------------------------------------------------------
//  El presupuesto total
// -----------------------------------------------------------------------------

export interface PresupuestoGuardado {
  /** El que manda hoy. Null mientras nadie lo define. */
  vigente: number | null;
  /** El primero que se definió: no se vuelve a tocar. */
  original: number | null;
}

export interface CambioDePresupuesto {
  anterior: number | null;
  nuevo: number | null;
  motivo: string | null;
  usuario: string;
  en: string;
}

export async function obtenerPresupuesto(): Promise<PresupuestoGuardado> {
  const { data, error } = await supabaseAdmin.from(T.presupuesto).select("monto_original, monto_vigente").maybeSingle();
  if (error) fallar(error);
  return {
    vigente: numero((data as Fila | null)?.monto_vigente),
    original: numero((data as Fila | null)?.monto_original),
  };
}

export async function listarCambiosDePresupuesto(limite = 10): Promise<CambioDePresupuesto[]> {
  const { data, error } = await supabaseAdmin
    .from(T.historial)
    .select("monto_anterior, monto_nuevo, motivo, usuario_nombre, creado_en")
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite);
  if (error) fallar(error);
  return ((data ?? []) as Fila[]).map((f) => ({
    anterior: numero(f.monto_anterior),
    nuevo: numero(f.monto_nuevo),
    motivo: texto(f.motivo),
    usuario: f.usuario_nombre as string,
    en: f.creado_en as string,
  }));
}

/**
 * Fija el presupuesto total. El primero que se define queda además como el ORIGINAL; cada cambio
 * posterior queda en el historial con quién y por qué (el motivo se exige en la acción).
 */
export async function guardarPresupuesto(datos: {
  monto: number;
  motivo: string | null;
  usuario: UsuarioConAcceso;
}): Promise<void> {
  const actual = await obtenerPresupuesto();
  if (actual.vigente === datos.monto) return;

  const { error } = await supabaseAdmin.from(T.presupuesto).upsert({
    // Una fila por contrato: la clave es el contrato, que pone el cliente (ver supabase-admin.ts).
    // El original solo se escribe la primera vez.
    monto_original: actual.original ?? datos.monto,
    monto_vigente: datos.monto,
    actualizado_por: datos.usuario.id,
    actualizado_en: new Date().toISOString(),
  });
  if (error) fallar(error);

  const { error: errorHistorial } = await supabaseAdmin.from(T.historial).insert({
    monto_anterior: actual.vigente,
    monto_nuevo: datos.monto,
    motivo: datos.motivo,
    usuario_id: datos.usuario.id,
    usuario_nombre: datos.usuario.nombre || datos.usuario.correo,
  });
  // El historial no puede deshacer el cambio, pero tampoco callarse: se avisa en el log.
  if (errorHistorial) console.error(`[gastos] No se pudo anotar el cambio de presupuesto: ${errorHistorial.message}`);

  olvidarResumen("gastos");
}

/** Asigna (o quita, con null) el presupuesto de un ítem. */
export async function guardarPresupuestoDeItem(categoriaId: string, monto: number | null): Promise<void> {
  const { error } = await supabaseAdmin.from(T.categorias).update({ presupuesto: monto }).eq("id", categoriaId);
  if (error) fallar(error);
  olvidarResumen("gastos");
}

// -----------------------------------------------------------------------------
//  Cotizaciones
// -----------------------------------------------------------------------------

function aCotizacion(f: Fila): Cotizacion {
  return {
    id: f.id as string,
    partidaId: f.partida_id as string,
    proveedor: f.proveedor as string,
    descripcion: texto(f.descripcion),
    cantidad: (f.cantidad as number) ?? 1,
    moneda: (f.moneda as Moneda) ?? "CLP",
    precioUnitario: numero(f.precio_unitario),
    tipoCambio: numero(f.tipo_cambio) ?? 1,
    totalClp: numero(f.total_clp),
    plazoEntregaDias: numero(f.plazo_entrega_dias),
    garantia: texto(f.garantia),
    condicionesPago: texto(f.condiciones_pago),
    vigenciaHasta: texto(f.vigencia_hasta),
    respuestaEsperada: texto(f.respuesta_esperada),
    estado: f.estado as EstadoDeCotizacion,
    motivoDecision: texto(f.motivo_decision),
    porConfirmar: texto(f.por_confirmar),
    notas: texto(f.notas),
    carpetaItemId: texto(f.carpeta_item_id),
    carpetaUrl: texto(f.carpeta_url),
    aprobadoPorNombre: texto(f.aprobado_por_nombre),
    aprobadoEn: texto(f.aprobado_en),
    creadoPor: texto(f.creado_por),
    creadoEn: f.creado_en as string,
  };
}

export async function listarCotizacionesDeLinea(partidaId: string): Promise<Cotizacion[]> {
  const { data, error } = await supabaseAdmin
    .from(T.cotizaciones)
    .select("*")
    .eq("partida_id", partidaId)
    .order("creado_en", { ascending: true })
    .order("id", { ascending: true });
  if (error) fallar(error);
  return ((data ?? []) as Fila[]).map(aCotizacion);
}

/** Todas las cotizaciones de Gastos, para el resumen. Paginado: ver PAGINA. */
export async function listarCotizacionesDeGastos(): Promise<Cotizacion[]> {
  const contratoId = await idDelContrato();
  const todas: Cotizacion[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from(T.cotizaciones)
      // `!inner` + filtro: solo las de líneas de GASTOS (la tabla es genérica por si Logística las quiere).
      // Y del contrato: la cotización no lo lleva, lo lleva su partida.
      .select("*, ct_arranque_partidas!inner(modulo, contrato_id)")
      .eq("ct_arranque_partidas.modulo", "gastos")
      .eq("ct_arranque_partidas.contrato_id", contratoId)
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) fallar(error);

    const filas = (data ?? []) as Fila[];
    todas.push(...filas.map(aCotizacion));
    if (filas.length < PAGINA) break;
  }
  return todas;
}

export async function obtenerCotizacion(id: string): Promise<Cotizacion | null> {
  const { data, error } = await supabaseAdmin.from(T.cotizaciones).select("*").eq("id", id).maybeSingle();
  if (error) fallar(error);
  return data ? aCotizacion(data as Fila) : null;
}

export interface DatosDeCotizacion {
  proveedor: string;
  descripcion: string | null;
  cantidad: number;
  moneda: Moneda;
  precioUnitario: number | null;
  tipoCambio: number;
  totalClp: number | null;
  plazoEntregaDias: number | null;
  garantia: string | null;
  condicionesPago: string | null;
  vigenciaHasta: string | null;
  respuestaEsperada: string | null;
  estado: Exclude<EstadoDeCotizacion, "aprobada">;
  porConfirmar: string | null;
  notas: string | null;
}

function aFilaDeCotizacion(d: DatosDeCotizacion) {
  return {
    proveedor: d.proveedor,
    descripcion: d.descripcion,
    cantidad: d.cantidad,
    moneda: d.moneda,
    precio_unitario: d.precioUnitario,
    tipo_cambio: d.tipoCambio,
    total_clp: d.totalClp,
    plazo_entrega_dias: d.plazoEntregaDias,
    garantia: d.garantia,
    condiciones_pago: d.condicionesPago,
    vigencia_hasta: d.vigenciaHasta,
    respuesta_esperada: d.respuestaEsperada,
    estado: d.estado,
    por_confirmar: d.porConfirmar,
    notas: d.notas,
  };
}

/**
 * Después de tocar las cotizaciones de una línea, deja la línea en el estado que les corresponde
 * (ver estadoDeLineaSegunCotizaciones) y descarta lo comprometido si ya no hay una aprobada.
 */
async function sincronizarLinea(partidaId: string): Promise<void> {
  const [cotizaciones, { data, error }] = await Promise.all([
    listarCotizacionesDeLinea(partidaId),
    supabaseAdmin.from(T.partidas).select("estado").eq("id", partidaId).maybeSingle(),
  ]);
  if (error) fallar(error);
  if (!data) return;

  const estadoActual = (data as Fila).estado as string;
  const nuevo = estadoDeLineaSegunCotizaciones(estadoActual, cotizaciones);
  const hayAprobada = cotizaciones.some((c) => c.estado === "aprobada");

  const cambios: Record<string, unknown> = {};
  if (nuevo !== estadoActual) cambios.estado = nuevo;
  // Sin aprobada, no hay nada comprometido por cotización.
  if (!hayAprobada && ["presupuestado", "cotizando", "cotizada", "aprobado"].includes(estadoActual)) {
    cambios.monto_comprometido = null;
  }
  if (Object.keys(cambios).length === 0) return;

  const { error: errorDeCambio } = await supabaseAdmin
    .from(T.partidas)
    .update({ ...cambios, actualizado_en: new Date().toISOString() })
    .eq("id", partidaId);
  if (errorDeCambio) fallar(errorDeCambio);
}

export async function crearCotizacion(
  partidaId: string,
  datos: DatosDeCotizacion,
  creadoPor: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from(T.cotizaciones)
    .insert({ partida_id: partidaId, ...aFilaDeCotizacion(datos), creado_por: creadoPor })
    .select("id")
    .single();
  if (error) fallar(error);

  await sincronizarLinea(partidaId);
  olvidarResumen("gastos");
  return (data as Fila).id as string;
}

/** Guarda los cambios de una cotización que NO está aprobada (la aprobada se mueve con su propia acción). */
export async function actualizarCotizacion(id: string, datos: DatosDeCotizacion): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from(T.cotizaciones)
    .update({ ...aFilaDeCotizacion(datos), actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("partida_id")
    .maybeSingle();
  if (error) fallar(error);
  if (!data) throw new Error("La cotización ya no existe.");

  const partidaId = (data as Fila).partida_id as string;
  await sincronizarLinea(partidaId);
  olvidarResumen("gastos");
  return partidaId;
}

/** Cambia una cotización a solicitada, recibida o descartada (no a aprobada: eso es aprobar). */
export async function cambiarEstadoDeCotizacion(
  id: string,
  estado: Exclude<EstadoDeCotizacion, "aprobada">,
  motivo: string | null,
): Promise<string> {
  const cambios: Record<string, unknown> = { estado, actualizado_en: new Date().toISOString() };
  // Quien descarta puede dejar escrito por qué; al reabrirla, el motivo viejo ya no aplica.
  if (estado === "descartada") cambios.motivo_decision = motivo;
  else cambios.motivo_decision = null;
  // Una cotización que deja de estar aprobada pierde también quién la aprobó.
  cambios.aprobado_por = null;
  cambios.aprobado_por_nombre = null;
  cambios.aprobado_en = null;

  const { data, error } = await supabaseAdmin
    .from(T.cotizaciones)
    .update(cambios)
    .eq("id", id)
    .select("partida_id")
    .maybeSingle();
  if (error) fallar(error);
  if (!data) throw new Error("La cotización ya no existe.");

  const partidaId = (data as Fila).partida_id as string;
  await sincronizarLinea(partidaId);
  olvidarResumen("gastos");
  return partidaId;
}

/** Aprueba una cotización: la función de la base lo hace entero o no lo hace. */
export async function aprobarCotizacion(datos: {
  id: string;
  usuario: UsuarioConAcceso;
  motivo: string | null;
}): Promise<string> {
  const cotizacion = await obtenerCotizacion(datos.id);
  if (!cotizacion) throw new Error("La cotización ya no existe.");

  const { error } = await supabaseAdmin.rpc("ct_gastos_aprobar_cotizacion", {
    p_cotizacion: datos.id,
    p_usuario: datos.usuario.id,
    p_nombre: datos.usuario.nombre || datos.usuario.correo,
    p_motivo: datos.motivo ?? "",
  });
  if (error) fallar(error);

  olvidarResumen("gastos");
  return cotizacion.partidaId;
}

export async function eliminarCotizacion(id: string): Promise<{ partidaId: string; carpetaItemId: string | null }> {
  const { data, error } = await supabaseAdmin
    .from(T.cotizaciones)
    .delete()
    .eq("id", id)
    .select("partida_id, carpeta_item_id")
    .maybeSingle();
  if (error) fallar(error);
  if (!data) throw new Error("La cotización ya no existe.");

  const partidaId = (data as Fila).partida_id as string;
  await sincronizarLinea(partidaId);
  olvidarResumen("gastos");
  return { partidaId, carpetaItemId: texto((data as Fila).carpeta_item_id) };
}

/** Anota la subcarpeta de SharePoint de una cotización. */
export async function guardarCarpetaDeCotizacion(id: string, carpeta: { id: string; webUrl: string }): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.cotizaciones)
    .update({ carpeta_item_id: carpeta.id, carpeta_url: carpeta.webUrl })
    .eq("id", id);
  if (error) fallar(error);
}

export async function guardarEnlaceDeCarpetaDeCotizacion(id: string, webUrl: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.cotizaciones).update({ carpeta_url: webUrl }).eq("id", id);
  if (error) fallar(error);
}

// -----------------------------------------------------------------------------
//  Quién aprueba
// -----------------------------------------------------------------------------

export async function listarAprobadores(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from(T.aprobadores).select("usuario_id");
  if (error) {
    console.error(`[gastos] No se pudo leer los aprobadores: ${error.message}`);
    return [];
  }
  return ((data ?? []) as Fila[]).map((f) => f.usuario_id as string);
}

/** Un administrador aprueba siempre; el resto, solo si fue designado. */
export async function puedeAprobar(usuario: UsuarioConAcceso): Promise<boolean> {
  if (usuario.rol === "admin") return true;
  return (await listarAprobadores()).includes(usuario.id);
}

export async function guardarAprobadores(ids: string[], designadoPor: string): Promise<void> {
  const nuevos = [...new Set(ids)];
  const { data, error } = await supabaseAdmin.from(T.aprobadores).select("usuario_id");
  if (error) fallar(error);
  const actuales = new Set(((data ?? []) as Fila[]).map((f) => f.usuario_id as string));

  const sobran = [...actuales].filter((id) => !nuevos.includes(id));
  const faltan = nuevos.filter((id) => !actuales.has(id));

  if (sobran.length > 0) {
    const { error: e } = await supabaseAdmin.from(T.aprobadores).delete().in("usuario_id", sobran);
    if (e) fallar(e);
  }
  if (faltan.length > 0) {
    const { error: e } = await supabaseAdmin
      .from(T.aprobadores)
      .insert(faltan.map((usuario_id) => ({ usuario_id, designado_por: designadoPor })));
    if (e) fallar(e, { "23503": "Alguna de esas personas ya no existe." });
  }
}

// -----------------------------------------------------------------------------
//  Tipos de cambio recordados
// -----------------------------------------------------------------------------

export type TiposDeCambio = Partial<Record<Exclude<Moneda, "CLP">, number>>;

/** Nunca lanza: es una sugerencia para un campo, no puede romper el formulario. */
export async function leerTiposDeCambio(): Promise<TiposDeCambio> {
  const { data, error } = await supabaseAdmin.from(T.cambios).select("moneda, valor");
  if (error) return {};
  const salida: TiposDeCambio = {};
  for (const f of (data ?? []) as Fila[]) salida[f.moneda as "UF" | "USD"] = Number(f.valor);
  return salida;
}

export async function recordarTipoDeCambio(moneda: Moneda, valor: number, quien: string): Promise<void> {
  if (moneda === "CLP") return;
  // Un adorno: si falla no se hace fallar el guardado de la cotización.
  const { error } = await supabaseAdmin
    .from(T.cambios)
    .upsert({ moneda, valor, actualizado_en: new Date().toISOString(), actualizado_por: quien });
  if (error) console.error(`[gastos] No se pudo recordar el tipo de cambio: ${error.message}`);
}

// -----------------------------------------------------------------------------
//  El resumen del presupuesto
// -----------------------------------------------------------------------------

/**
 * Presupuesto contra gasto, leído de la base: el que muestra la pantalla de Gastos y el tablero.
 * Las pantallas lo piden fresco; el tablero lo recuerda un momento (ver dashboard.ts).
 */
export async function cargarResumenDePresupuesto(
  /** Lo que quien llama ya leyó: así el tablero no pide dos veces las mismas partidas. */
  previas?: { partidas: Partida[]; categorias: Categoria[] },
): Promise<ResumenDePresupuesto & { pendientes: PendientesDeCotizacion }> {
  const [presupuesto, categorias, partidas, cotizaciones] = await Promise.all([
    obtenerPresupuesto(),
    previas ? Promise.resolve(previas.categorias) : listarCategorias("gastos", { incluirInactivas: true }),
    previas ? Promise.resolve(previas.partidas) : listarPartidas("gastos"),
    listarCotizacionesDeGastos(),
  ]);

  const porLinea = new Map<string, Cotizacion[]>();
  for (const c of cotizaciones) {
    const lista = porLinea.get(c.partidaId) ?? [];
    lista.push(c);
    porLinea.set(c.partidaId, lista);
  }

  let ahorroLogrado = 0;
  for (const lista of porLinea.values()) ahorroLogrado += ahorroDeLinea(lista);

  const resumen = resumirPresupuesto({
    total: presupuesto.vigente,
    original: presupuesto.original,
    categorias: categorias.map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo, presupuesto: c.presupuesto })),
    lineas: partidas.map((p) => ({
      categoriaId: p.categoriaId,
      estado: p.estado,
      montoPresupuestado: p.montoPresupuestado,
      montoReal: p.montoReal,
      montoComprometido: p.montoComprometido,
      mejorCotizacionClp: mejorCotizacionDeLinea(porLinea.get(p.id) ?? []),
    })),
    ahorroLogrado,
  });

  return { ...resumen, pendientes: contarPendientesDeCotizacion(cotizaciones, hoyEnChile()) };
}

