import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { idDelContrato } from "./contrato-actual";
import { hoyEnChile } from "./acreditacion-modelo";
import { olvidarDashboard } from "./memoria-dashboard";
import {
  resumir,
  type Categoria,
  type ModuloArranque,
  type Partida,
  type PartidaResumida,
  type ResumenDeArranque,
} from "./arranque-modelo";

const T = {
  categorias: "ct_arranque_categorias",
  partidas: "ct_arranque_partidas",
} as const;

type Fila = Record<string, unknown>;

const VIOLACION_UNICA = "23505";
/** `on delete restrict` NO levanta 23503 sino su propio código: 23001. */
const VIOLACION_RESTRICT = "23001";

/** Supabase corta cada consulta en 1.000 filas y no avisa. */
const PAGINA = 1000;

function fallar(error: { message: string; code?: string }, mensajes: Record<string, string> = {}): never {
  throw new Error((error.code && mensajes[error.code]) || error.message);
}

// -----------------------------------------------------------------------------
//  Categorías
// -----------------------------------------------------------------------------

function aCategoria(f: Fila): Categoria {
  return {
    id: f.id as string,
    modulo: f.modulo as ModuloArranque,
    nombre: f.nombre as string,
    orden: f.orden as number,
    activo: Boolean(f.activo),
    // Null y no cero: «sin presupuesto» y «presupuesto de cero pesos» son cosas distintas.
    presupuesto: f.presupuesto === null || f.presupuesto === undefined ? null : Number(f.presupuesto),
  };
}

export async function listarCategorias(
  modulo: ModuloArranque,
  opciones: { incluirInactivas?: boolean } = {},
): Promise<Categoria[]> {
  let consulta = supabaseAdmin.from(T.categorias).select("*").eq("modulo", modulo);
  if (!opciones.incluirInactivas) consulta = consulta.eq("activo", true);

  const { data, error } = await consulta
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) fallar(error);
  return ((data ?? []) as Fila[]).map(aCategoria);
}

/** Cuántas partidas tiene cada categoría: decide si se puede eliminar o solo desactivar. */
export async function usoDeCategorias(modulo: ModuloArranque): Promise<Map<string, number>> {
  const uso = new Map<string, number>();
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from(T.partidas)
      .select("categoria_id")
      .eq("modulo", modulo)
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) fallar(error);

    const filas = (data ?? []) as Fila[];
    for (const f of filas) {
      const id = f.categoria_id as string;
      uso.set(id, (uso.get(id) ?? 0) + 1);
    }
    if (filas.length < PAGINA) break;
  }
  return uso;
}

const MENSAJES_CATEGORIA = {
  [VIOLACION_UNICA]: "Ya existe una categoría con ese nombre.",
  [VIOLACION_RESTRICT]:
    "Esa categoría tiene partidas. Desactívala, o mueve primero sus partidas a otra categoría.",
};

export async function crearCategoria(modulo: ModuloArranque, nombre: string): Promise<void> {
  const { data: ultima } = await supabaseAdmin
    .from(T.categorias)
    .select("orden")
    .eq("modulo", modulo)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabaseAdmin.from(T.categorias).insert({
    modulo,
    nombre: nombre.trim(),
    orden: ((ultima?.orden as number | undefined) ?? 0) + 1,
  });
  if (error) fallar(error, MENSAJES_CATEGORIA);
}

export async function actualizarCategoria(
  id: string,
  cambios: { nombre: string; activo: boolean },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.categorias)
    .update({ nombre: cambios.nombre.trim(), activo: cambios.activo })
    .eq("id", id);
  if (error) fallar(error, MENSAJES_CATEGORIA);
}

export async function eliminarCategoria(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.categorias).delete().eq("id", id);
  if (error) fallar(error, MENSAJES_CATEGORIA);
}

// -----------------------------------------------------------------------------
//  Partidas
// -----------------------------------------------------------------------------

function aPartida(f: Fila): Partida {
  return {
    id: f.id as string,
    numero: f.numero as number,
    carpetaItemId: (f.carpeta_item_id as string) ?? null,
    carpetaUrl: (f.carpeta_url as string) ?? null,
    modulo: f.modulo as ModuloArranque,
    categoriaId: f.categoria_id as string,
    descripcion: f.descripcion as string,
    proveedor: (f.proveedor as string) ?? null,
    referencia: (f.referencia as string) ?? null,
    estado: f.estado as string,
    fecha: (f.fecha as string) ?? null,
    montoPresupuestado: (f.monto_presupuestado as number) ?? null,
    montoReal: (f.monto_real as number) ?? null,
    montoComprometido:
      f.monto_comprometido === null || f.monto_comprometido === undefined ? null : Number(f.monto_comprometido),
    cantidad: (f.cantidad as number) ?? 1,
    modalidad: ((f.modalidad as Partida["modalidad"]) ?? "cotizacion"),
    partidaVinculadaId: (f.partida_vinculada_id as string) ?? null,
    enlace: (f.enlace as string) ?? null,
    notas: (f.notas as string) ?? null,
    responsableId: (f.responsable_id as string) ?? null,
    responsableExternoId: (f.responsable_externo_id as string) ?? null,
    creadoPor: (f.creado_por as string) ?? null,
    creadoEn: f.creado_en as string,
    actualizadoEn: f.actualizado_en as string,
  };
}

/** Todas las partidas del módulo, las más recientes primero. Paginado: ver PAGINA. */
export async function listarPartidas(modulo: ModuloArranque): Promise<Partida[]> {
  const todas: Partida[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from(T.partidas)
      .select("*")
      .eq("modulo", modulo)
      // `id` desempata: sin un orden total, paginar puede repetir o saltarse filas.
      .order("creado_en", { ascending: false })
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) fallar(error);

    const filas = (data ?? []) as Fila[];
    todas.push(...filas.map(aPartida));
    if (filas.length < PAGINA) break;
  }
  return todas;
}

export async function obtenerPartida(id: string): Promise<Partida | null> {
  const { data, error } = await supabaseAdmin.from(T.partidas).select("*").eq("id", id).maybeSingle();
  if (error) fallar(error);
  return data ? aPartida(data as Fila) : null;
}

export interface DatosDePartida {
  categoriaId: string;
  descripcion: string;
  proveedor: string | null;
  referencia: string | null;
  estado: string;
  fecha: string | null;
  montoPresupuestado: number | null;
  montoReal: number | null;
  /** Solo Gastos: cuántas unidades y cómo se compra. Logística siempre manda 1 y «cotizacion». */
  cantidad: number;
  modalidad: Partida["modalidad"];
  /** La partida del otro módulo con la que se vincula, o null. */
  partidaVinculadaId: string | null;
  notas: string | null;
  responsableId: string | null;
  responsableExternoId: string | null;
  /**
   * Solo lo pone quien registra el compromiso directamente (la factura de un curso o examen). Si no
   * viene, la columna NO se toca: guardar el formulario de una partida no puede borrar el monto que
   * dejó la aprobación de una cotización.
   */
  montoComprometido?: number | null;
}

// `enlace` ya NO está acá: los respaldos se suben a la carpeta de la partida en
// SharePoint. La columna sigue en la tabla y se sigue leyendo, por si alguna partida
// anterior tiene uno, pero ningún formulario la escribe: ponerla en null en cada
// guardado borraría ese enlace sin que nadie lo haya pedido.

function aFila(d: DatosDePartida) {
  return {
    categoria_id: d.categoriaId,
    descripcion: d.descripcion,
    proveedor: d.proveedor,
    referencia: d.referencia,
    estado: d.estado,
    fecha: d.fecha,
    monto_presupuestado: d.montoPresupuestado,
    monto_real: d.montoReal,
    cantidad: d.cantidad,
    modalidad: d.modalidad,
    partida_vinculada_id: d.partidaVinculadaId,
    notas: d.notas,
    responsable_id: d.responsableId,
    responsable_externo_id: d.responsableExternoId,
    ...(d.montoComprometido !== undefined ? { monto_comprometido: d.montoComprometido } : {}),
  };
}

const MENSAJES_PARTIDA = {
  "23503": "Esa categoría, ese responsable o esa partida vinculada ya no existe.",
};

/** Las partidas que apuntan a esta: «desde acá se ve todo lo que la referencia». */
export async function listarReferenciasA(id: string): Promise<Partida[]> {
  const { data, error } = await supabaseAdmin
    .from(T.partidas)
    .select("*")
    .eq("partida_vinculada_id", id)
    .order("numero", { ascending: true });
  if (error) fallar(error);
  return ((data ?? []) as Fila[]).map(aPartida);
}

export async function crearPartida(
  modulo: ModuloArranque,
  datos: DatosDePartida,
  creadoPor: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from(T.partidas)
    .insert({ modulo, ...aFila(datos), creado_por: creadoPor })
    .select("id")
    .single();
  if (error) fallar(error, MENSAJES_PARTIDA);

  olvidarResumen(modulo);
  return (data as Fila).id as string;
}

export async function actualizarPartida(id: string, datos: DatosDePartida): Promise<ModuloArranque> {
  const { data, error } = await supabaseAdmin
    .from(T.partidas)
    .update({ ...aFila(datos), actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("modulo")
    .maybeSingle();
  if (error) fallar(error, MENSAJES_PARTIDA);
  if (!data) throw new Error("La partida ya no existe.");

  const modulo = (data as Fila).modulo as ModuloArranque;
  olvidarResumen(modulo);
  return modulo;
}

export async function cambiarEstadoDePartida(id: string, estado: string): Promise<ModuloArranque> {
  const { data, error } = await supabaseAdmin
    .from(T.partidas)
    .update({ estado, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .select("modulo")
    .maybeSingle();
  if (error) fallar(error);
  if (!data) throw new Error("La partida ya no existe.");

  const modulo = (data as Fila).modulo as ModuloArranque;
  olvidarResumen(modulo);
  return modulo;
}

/** Anota la carpeta de SharePoint de una partida: su id (que no cambia) y su enlace. */
export async function guardarCarpetaDePartida(
  id: string,
  carpeta: { id: string; webUrl: string },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.partidas)
    .update({ carpeta_item_id: carpeta.id, carpeta_url: carpeta.webUrl })
    .eq("id", id);
  if (error) fallar(error);
}

/** El enlace cambia cuando se renombra la carpeta; el id no. */
export async function guardarEnlaceDeCarpetaDePartida(id: string, webUrl: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.partidas).update({ carpeta_url: webUrl }).eq("id", id);
  if (error) fallar(error);
}

export async function eliminarPartida(id: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from(T.partidas)
    .delete()
    .eq("id", id)
    .select("modulo")
    .maybeSingle();
  if (error) fallar(error);
  if (data) olvidarResumen((data as Fila).modulo as ModuloArranque);
}

// -----------------------------------------------------------------------------
//  El resumen de la portada
//
//  La tarjeta de la portada de Contratos se pide en cada visita y solo necesita
//  cuatro columnas, así que no lee las partidas enteras. Y se recuerda 30 segundos:
//  la portada de Contrato DCH es la pantalla a la que más se vuelve, y repetir cuatro
//  consultas por cada regreso suma un viaje a Supabase por módulo.
//
//  La memoria es de cada instancia del servidor, no compartida; otra instancia puede
//  tener un valor de hasta 30 segundos de antigüedad. Para una tarjeta resumen está
//  bien. Las pantallas del módulo, en cambio, NO la usan: leen siempre de la base.
// -----------------------------------------------------------------------------

const VIGENCIA_MS = 30_000;
/** Por contrato y módulo: «contrato|logistica». Con solo el módulo, un contrato veía el resumen de otro. */
const memoria = new Map<string, { resumen: ResumenDeArranque; hasta: number }>();

export function olvidarResumen(modulo: ModuloArranque): void {
  for (const clave of memoria.keys()) if (clave.endsWith(`|${modulo}`)) memoria.delete(clave);
  olvidarDashboard();
}

export async function resumenDelModulo(modulo: ModuloArranque): Promise<ResumenDeArranque> {
  const clave = `${await idDelContrato()}|${modulo}`;
  const guardado = memoria.get(clave);
  if (guardado && guardado.hasta > Date.now()) return guardado.resumen;

  const partidas: PartidaResumida[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from(T.partidas)
      .select("estado, fecha, monto_presupuestado, monto_real")
      .eq("modulo", modulo)
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) fallar(error);

    const filas = (data ?? []) as Fila[];
    partidas.push(
      ...filas.map((f) => ({
        estado: f.estado as string,
        fecha: (f.fecha as string) ?? null,
        montoPresupuestado: (f.monto_presupuestado as number) ?? null,
        montoReal: (f.monto_real as number) ?? null,
      })),
    );
    if (filas.length < PAGINA) break;
  }

  const resumen = resumir(modulo, partidas, hoyEnChile());
  memoria.set(clave, { resumen, hasta: Date.now() + VIGENCIA_MS });
  return resumen;
}
