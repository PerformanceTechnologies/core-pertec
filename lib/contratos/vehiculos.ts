import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { olvidarDashboard } from "./memoria-dashboard";
import { obtenerContrato, type Actor, type DatosDeContrato } from "./acreditacion";
import {
  hoyEnChile,
  ordenarTipos,
  type ArchivoDeDocumento,
  type EstadoDocumento,
  type EventoHistorial,
  type TipoDeCatalogo,
  type TipoDocumento,
} from "./acreditacion-modelo";
import {
  CAMPOS_DE_VEHICULO,
  analizarVehiculo,
  type AnalisisDeVehiculo,
  type CategoriaDeVehiculo,
  type DocumentoDeVehiculo,
  type EstadoWebControlVehiculo,
  type Vehiculo,
} from "./vehiculos-modelo";

// El acceso a datos de Acreditación Vehículos. Es el hermano de acreditacion.ts y se lee igual:
// mismas decisiones, mismas razones, con «vehículo» donde allá dice «persona» y «categoría» (el
// tipo de vehículo) donde allá dice «cargo».

const T = {
  contrato: "ct_vehiculos_contrato",
  tipos: "ct_vehiculos_tipos",
  categorias: "ct_vehiculos_categorias",
  categoriaTipos: "ct_vehiculos_categoria_tipos",
  vehiculos: "ct_vehiculos",
  documentos: "ct_vehiculos_documentos",
  historial: "ct_vehiculos_historial",
  archivos: "ct_vehiculos_archivos",
} as const;

/** Vistas que cuentan en la base (migración 0024). */
const VISTAS = {
  usoTipos: "ct_vehiculos_uso_tipos_v",
  usoCategorias: "ct_vehiculos_uso_categorias_v",
} as const;

type Fila = Record<string, unknown>;

/** Lo que Postgres responde cuando se viola un índice único. */
const VIOLACION_UNICA = "23505";
const VIOLACION_LLAVE = "23503";
/** `on delete restrict` NO levanta 23503 sino su propio código: 23001. */
const VIOLACION_RESTRICT = "23001";

function fallar(error: { message: string; code?: string }, mensajes: Record<string, string> = {}): never {
  throw new Error((error.code && mensajes[error.code]) || error.message);
}

// -----------------------------------------------------------------------------
//  La flota: cuántos vehículos se deben contratar
//
//  El nombre, el inicio y el administrador del contrato son los de Acreditación Personas (es UN
//  contrato): se leen de ahí. Acá vive solo la meta de la flota.
// -----------------------------------------------------------------------------

export async function obtenerDotacionDeFlota(): Promise<number | null> {
  const { data } = await supabaseAdmin.from(T.contrato).select("dotacion_requerida").maybeSingle();
  return ((data as Fila | null)?.dotacion_requerida as number) ?? null;
}

/**
 * Guarda la meta de la flota: el total y la cantidad de cada tipo de vehículo, juntos.
 *
 * Solo toca los tipos que vienen en la lista: uno desactivado que el formulario no ofrece conserva
 * su cantidad en vez de quedar en blanco.
 */
export async function guardarDotacionDeFlota(
  total: number | null,
  porCategoria: { id: string; cantidad: number | null }[],
): Promise<void> {
  const { error } = await supabaseAdmin.from(T.contrato).upsert({
    // Una fila por contrato: la clave es el contrato, que pone el cliente (ver supabase-admin.ts).
    dotacion_requerida: total,
    actualizado_en: new Date().toISOString(),
  });
  if (error) fallar(error);

  const resultados = await Promise.all(
    porCategoria.map((c) =>
      supabaseAdmin.from(T.categorias).update({ cantidad_requerida: c.cantidad }).eq("id", c.id),
    ),
  );
  const fallo = resultados.find((r) => r.error);
  if (fallo?.error) fallar(fallo.error);
  olvidarDashboard();
}

// -----------------------------------------------------------------------------
//  Catálogo de documentos
// -----------------------------------------------------------------------------

function aTipo(f: Fila): TipoDocumento {
  return {
    id: f.id as string,
    codigo: f.codigo as string,
    nombre: f.nombre as string,
    grupo: f.grupo as string,
    orden: f.orden as number,
    tieneVencimiento: Boolean(f.tiene_vencimiento),
  };
}

/** Los documentos activos, con los de un mismo grupo juntos. */
export async function listarTiposDeDocumento(): Promise<TipoDocumento[]> {
  const { data, error } = await supabaseAdmin
    .from(T.tipos)
    .select("*")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) fallar(error);

  return ordenarTipos(((data ?? []) as Fila[]).map(aTipo));
}

/**
 * Todo el catálogo, activos o no, con cuántos vehículos lo tienen anotado.
 *
 * Es lo que ve quien lo administra: los desactivados tienen que poder reactivarse, y «cuántos lo
 * usan» decide si se puede eliminar o solo desactivar.
 */
export async function listarTodosLosTiposDeDocumento(): Promise<TipoDeCatalogo[]> {
  const [tipos, uso] = await Promise.all([
    supabaseAdmin.from(T.tipos).select("*").order("orden", { ascending: true }),
    supabaseAdmin.from(VISTAS.usoTipos).select("tipo_id, vehiculos"),
  ]);
  if (tipos.error) fallar(tipos.error);

  const enUso = new Map<string, number>(
    ((uso.data ?? []) as Fila[]).map((f) => [f.tipo_id as string, f.vehiculos as number]),
  );

  return ordenarTipos(
    ((tipos.data ?? []) as Fila[]).map((f) => ({
      ...aTipo(f),
      activo: Boolean(f.activo),
      // `enUso` cuenta a quienes tienen algo anotado; en la interfaz del catálogo se llama igual.
      enUso: enUso.get(f.id as string) ?? 0,
    })),
  );
}

/** «Permiso de circulación» -> «x_permiso_de_circulacion»: el código estable de un documento nuevo. */
function codigoDe(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  return `x_${base || "documento"}`;
}

const MENSAJE_TIPO_REPETIDO = "Ya existe un documento con ese nombre.";

async function nombreDeTipoLibre(nombre: string, exceptoId: string | null): Promise<void> {
  const { data } = await supabaseAdmin.from(T.tipos).select("id, nombre");
  const buscado = nombre.trim().toLowerCase();
  const repetido = ((data ?? []) as Fila[]).some(
    (f) => f.id !== exceptoId && String(f.nombre).trim().toLowerCase() === buscado,
  );
  if (repetido) throw new Error(MENSAJE_TIPO_REPETIDO);
}

/**
 * Agrega un documento al catálogo, y de una vez a los tipos de vehículo que lo piden.
 *
 * El `orden` es el siguiente al mayor que existe, incluidos los inactivos: es el número que lleva
 * el archivo en SharePoint («16 - …»), y reutilizar el de un documento desactivado mezclaría sus
 * archivos con los del nuevo.
 */
export async function crearTipoDeDocumento(datos: {
  nombre: string;
  grupo: string;
  tieneVencimiento: boolean;
  categoriaIds: string[];
}): Promise<void> {
  const nombre = datos.nombre.trim();
  await nombreDeTipoLibre(nombre, null);

  const { data: todos } = await supabaseAdmin.from(T.tipos).select("codigo, orden");
  const filas = (todos ?? []) as Fila[];
  const ocupados = new Set(filas.map((f) => f.codigo as string));
  const orden = Math.max(0, ...filas.map((f) => f.orden as number)) + 1;

  const base = codigoDe(nombre);
  let codigo = base;
  for (let n = 2; ocupados.has(codigo); n++) codigo = `${base}_${n}`;

  const { data, error } = await supabaseAdmin
    .from(T.tipos)
    .insert({ codigo, nombre, grupo: datos.grupo.trim(), orden, tiene_vencimiento: datos.tieneVencimiento })
    .select("id")
    .single();
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_TIPO_REPETIDO });

  if (datos.categoriaIds.length > 0) {
    const { error: errorCategorias } = await supabaseAdmin
      .from(T.categoriaTipos)
      .insert(datos.categoriaIds.map((categoria_id) => ({ categoria_id, tipo_id: data.id as string })));
    if (errorCategorias) fallar(errorCategorias);
  }
}

export async function actualizarTipoDeDocumento(
  id: string,
  datos: { nombre: string; grupo: string; tieneVencimiento: boolean; activo: boolean },
): Promise<void> {
  await nombreDeTipoLibre(datos.nombre, id);

  const { error } = await supabaseAdmin
    .from(T.tipos)
    .update({
      nombre: datos.nombre.trim(),
      grupo: datos.grupo.trim(),
      tiene_vencimiento: datos.tieneVencimiento,
      activo: datos.activo,
    })
    .eq("id", id);
  if (error) fallar(error);
}

/**
 * Elimina un documento del catálogo, solo si ningún vehículo lo tiene anotado.
 *
 * Si hay vehículos con algo en él, no se puede: se llevaría por delante sus estados y las
 * referencias a sus archivos. Para eso existe desactivarlo, que lo saca de los checklists y del
 * avance sin borrar nada.
 */
export async function eliminarTipoDeDocumento(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.tipos).delete().eq("id", id);
  if (error) {
    fallar(error, {
      [VIOLACION_RESTRICT]:
        "Hay vehículos con este documento anotado, así que no se puede eliminar. Desactívalo para que deje de pedirse sin perder nada.",
    });
  }
}

// -----------------------------------------------------------------------------
//  Tipos de vehículo (categorías)
// -----------------------------------------------------------------------------

export async function listarCategorias(): Promise<CategoriaDeVehiculo[]> {
  const [categorias, relaciones, uso] = await Promise.all([
    supabaseAdmin.from(T.categorias).select("*").order("creado_en", { ascending: true }),
    supabaseAdmin.from(T.categoriaTipos).select("categoria_id, tipo_id"),
    supabaseAdmin.from(VISTAS.usoCategorias).select("categoria_id, vehiculos"),
  ]);
  if (categorias.error) fallar(categorias.error);

  const tiposPorCategoria = new Map<string, string[]>();
  for (const r of (relaciones.data ?? []) as Fila[]) {
    const lista = tiposPorCategoria.get(r.categoria_id as string) ?? [];
    lista.push(r.tipo_id as string);
    tiposPorCategoria.set(r.categoria_id as string, lista);
  }

  const vehiculosPorCategoria = new Map<string, number>(
    ((uso.data ?? []) as Fila[]).map((f) => [f.categoria_id as string, f.vehiculos as number]),
  );

  return ((categorias.data ?? []) as Fila[]).map((f) => ({
    id: f.id as string,
    nombre: f.nombre as string,
    activo: Boolean(f.activo),
    tipoIds: tiposPorCategoria.get(f.id as string) ?? [],
    vehiculos: vehiculosPorCategoria.get(f.id as string) ?? 0,
    cantidadRequerida: (f.cantidad_requerida as number) ?? null,
  }));
}

const MENSAJE_CATEGORIA_REPETIDA = "Ya existe un tipo de vehículo con ese nombre.";

export async function crearCategoria(nombre: string, tipoIds: string[]): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from(T.categorias)
    .insert({ nombre: nombre.trim() })
    .select("id")
    .single();
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_CATEGORIA_REPETIDA });

  await reemplazarTiposDeCategoria(data.id as string, tipoIds);
}

export async function actualizarCategoria(
  id: string,
  datos: { nombre: string; activo: boolean; tipoIds: string[] },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.categorias)
    .update({ nombre: datos.nombre.trim(), activo: datos.activo })
    .eq("id", id);
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_CATEGORIA_REPETIDA });

  await reemplazarTiposDeCategoria(id, datos.tipoIds);
}

export async function eliminarCategoria(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.categorias).delete().eq("id", id);
  if (error) {
    fallar(error, {
      [VIOLACION_RESTRICT]:
        "Hay vehículos de este tipo, así que no se puede eliminar. Desactívalo para que no aparezca al dar de alta uno nuevo.",
    });
  }
}

async function reemplazarTiposDeCategoria(categoriaId: string, tipoIds: string[]): Promise<void> {
  const { error: errorBorrar } = await supabaseAdmin.from(T.categoriaTipos).delete().eq("categoria_id", categoriaId);
  if (errorBorrar) fallar(errorBorrar);
  if (tipoIds.length === 0) return;

  const { error } = await supabaseAdmin
    .from(T.categoriaTipos)
    .insert(tipoIds.map((tipo_id) => ({ categoria_id: categoriaId, tipo_id })));
  if (error) fallar(error);
}

// -----------------------------------------------------------------------------
//  Vehículos
// -----------------------------------------------------------------------------

function aArchivo(a: Fila): ArchivoDeDocumento {
  return {
    id: a.id as string,
    itemId: a.item_id as string,
    nombre: a.nombre as string,
    url: a.url as string,
    subidoPorNombre: (a.subido_por_nombre as string) ?? null,
    subidoEn: a.subido_en as string,
  };
}

function aDocumento(f: Fila): DocumentoDeVehiculo {
  return {
    tipoId: f.tipo_id as string,
    estado: f.estado as EstadoDocumento,
    requeridoExtra: Boolean(f.requerido_extra),
    itemId: (f.item_id as string) ?? null,
    archivoNombre: (f.archivo_nombre as string) ?? null,
    archivoUrl: (f.archivo_url as string) ?? null,
    cantidadArchivos: (f.cantidad_archivos as number) ?? 0,
    // Solo vienen cuando la consulta los pidió (la ficha); la lista no los necesita y no paga por ellos.
    archivos: ((f[T.archivos] as Fila[] | undefined) ?? [])
      .slice()
      .sort((x, y) => String(x.subido_en).localeCompare(String(y.subido_en)))
      .map(aArchivo),
    fechaEmision: (f.fecha_emision as string) ?? null,
    fechaVencimiento: (f.fecha_vencimiento as string) ?? null,
    nota: (f.nota as string) ?? null,
    actualizadoPorNombre: (f.actualizado_por_nombre as string) ?? null,
    actualizadoEn: (f.actualizado_en as string) ?? null,
  };
}

function aVehiculo(f: Fila): Vehiculo {
  const datos: Record<string, string | null> = {};
  for (const c of CAMPOS_DE_VEHICULO) datos[c.campo] = f[c.campo] === null || f[c.campo] === undefined ? null : String(f[c.campo]);

  return {
    id: f.id as string,
    numero: f.numero as number,
    patente: f.patente as string,
    categoriaId: f.categoria_id as string,
    activo: Boolean(f.activo),
    estadoWebControl: f.estado_web_control as EstadoWebControlVehiculo,
    wcAcreditado: Boolean(f.wc_acreditado),
    observaciones: (f.observaciones as string) ?? null,
    carpetaItemId: (f.carpeta_item_id as string) ?? null,
    carpetaUrl: (f.carpeta_url as string) ?? null,
    creadoEn: f.creado_en as string,
    datos,
  };
}

export interface VehiculoConDocumentos {
  vehiculo: Vehiculo;
  documentos: Map<string, DocumentoDeVehiculo>;
}

/**
 * Todos los vehículos con sus documentos, de una consulta.
 *
 * La lista calcula el avance de cada fila, así que necesita los documentos de todos. Una consulta
 * por vehículo serían N viajes a Supabase en la pantalla que más se abre; con el embed es uno.
 */
export async function listarVehiculos(): Promise<VehiculoConDocumentos[]> {
  const filas: Fila[] = [];

  // De a mil: Supabase corta cada consulta ahí y no avisa. Sin paginar, el vehículo 1.001 de la
  // flota simplemente no existiría en pantalla, y todo lo calculado sobre la lista saldría bajo.
  const TAMANO = 1000;
  for (let desde = 0; ; desde += TAMANO) {
    const { data, error } = await supabaseAdmin
      .from(T.vehiculos)
      .select(`*, ${T.documentos}(*)`)
      .order("numero", { ascending: true })
      .range(desde, desde + TAMANO - 1);
    if (error) fallar(error);

    const pagina = (data ?? []) as Fila[];
    filas.push(...pagina);
    if (pagina.length < TAMANO) break;
  }

  return filas.map((f) => ({
    vehiculo: aVehiculo(f),
    documentos: new Map(((f[T.documentos] as Fila[]) ?? []).map((d) => [d.tipo_id as string, aDocumento(d)])),
  }));
}

export async function obtenerVehiculo(id: string): Promise<VehiculoConDocumentos | null> {
  const { data, error } = await supabaseAdmin
    .from(T.vehiculos)
    .select(`*, ${T.documentos}(*, ${T.archivos}(*))`)
    .eq("id", id)
    .maybeSingle();
  if (error) fallar(error);
  if (!data) return null;

  const f = data as Fila;
  return {
    vehiculo: aVehiculo(f),
    documentos: new Map(((f[T.documentos] as Fila[]) ?? []).map((d) => [d.tipo_id as string, aDocumento(d)])),
  };
}

export async function crearVehiculo(
  datos: { patente: string; categoriaId: string; faena: string | null },
  actor: Actor,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from(T.vehiculos)
    .insert({
      patente: datos.patente,
      categoria_id: datos.categoriaId,
      faena: datos.faena?.trim() || null,
      creado_por: actor.id,
    })
    .select("id")
    .single();

  if (error) {
    fallar(error, {
      [VIOLACION_UNICA]: "Ya existe un vehículo con esa patente.",
      [VIOLACION_LLAVE]: "El tipo de vehículo elegido ya no existe.",
    });
  }

  const id = data.id as string;
  await registrarHistorialDeVehiculo(id, "Alta", `Se dio de alta el vehículo ${datos.patente}.`, actor);
  return id;
}

export async function actualizarDatosDeVehiculo(
  id: string,
  cambios: {
    categoriaId: string;
    datos: Record<string, string | null>;
    /** Solo si cambió: la anterior va para el historial, que tiene que decir de cuál a cuál. */
    patente?: { anterior: string; nueva: string };
  },
  actor: Actor,
): Promise<void> {
  const fila: Fila = {
    categoria_id: cambios.categoriaId,
    actualizado_en: new Date().toISOString(),
  };
  if (cambios.patente) fila.patente = cambios.patente.nueva;
  // Solo las columnas de la lista: el formulario manda lo que quiera, y lo que no esté acá no llega
  // a la base.
  for (const c of CAMPOS_DE_VEHICULO) {
    if (c.campo in cambios.datos) fila[c.campo] = cambios.datos[c.campo];
  }

  const { error } = await supabaseAdmin.from(T.vehiculos).update(fila).eq("id", id);
  if (error) {
    fallar(error, {
      [VIOLACION_LLAVE]: "El tipo de vehículo elegido ya no existe.",
      [VIOLACION_UNICA]: "Ya existe otro vehículo con esa patente.",
    });
  }

  if (cambios.patente) {
    await registrarHistorialDeVehiculo(
      id,
      "Datos",
      `Se cambió la patente de ${cambios.patente.anterior} a ${cambios.patente.nueva}.`,
      actor,
    );
  }
  await registrarHistorialDeVehiculo(id, "Datos", "Se actualizaron los datos de la ficha.", actor);
}

export async function actualizarSeguimientoDeVehiculo(
  id: string,
  cambios: {
    estadoWebControl: EstadoWebControlVehiculo;
    wcAcreditado: boolean;
    observaciones: string | null;
  },
  actor: Actor,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.vehiculos)
    .update({
      estado_web_control: cambios.estadoWebControl,
      wc_acreditado: cambios.wcAcreditado,
      observaciones: cambios.observaciones,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) fallar(error);

  await registrarHistorialDeVehiculo(id, "Seguimiento", "Se actualizó Web Control.", actor);
}

export async function cambiarActivoDeVehiculo(id: string, activo: boolean, actor: Actor): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.vehiculos)
    .update({ activo, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) fallar(error);

  await registrarHistorialDeVehiculo(id, activo ? "Reactivación" : "Baja", null, actor);
}

export async function eliminarVehiculo(id: string): Promise<void> {
  // Se lleva en cascada los documentos e historial. Los archivos NO: esos son de SharePoint, y
  // borrarlos desde acá saltaría su papelera y sus permisos.
  const { error } = await supabaseAdmin.from(T.vehiculos).delete().eq("id", id);
  if (error) fallar(error);
}

export async function guardarCarpetaDeVehiculo(
  id: string,
  carpeta: { id: string; webUrl: string },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.vehiculos)
    .update({ carpeta_item_id: carpeta.id, carpeta_url: carpeta.webUrl })
    .eq("id", id);
  if (error) fallar(error);
}

/** El enlace guardado de la carpeta de un vehículo (cambia si se renombra). */
export async function guardarEnlaceDeCarpetaDeVehiculo(id: string, webUrl: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.vehiculos).update({ carpeta_url: webUrl }).eq("id", id);
  if (error) fallar(error);
}

// -----------------------------------------------------------------------------
//  Documentos
// -----------------------------------------------------------------------------

export interface CambiosDeDocumento {
  estado?: EstadoDocumento;
  requeridoExtra?: boolean;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  nota?: string | null;
}

/**
 * Cambia lo que se pida y deja el resto como está.
 *
 * Es un upsert con SOLO las columnas presentes: en un insert-or-update de PostgREST, las que no
 * vienen en el cuerpo no se tocan. Pasar todas siempre —con null donde no hay cambio— borraría el
 * archivo al cambiar el estado.
 */
export async function guardarDocumentoDeVehiculo(
  vehiculoId: string,
  tipoId: string,
  cambios: CambiosDeDocumento,
  actor: Actor,
): Promise<void> {
  const fila: Fila = {
    vehiculo_id: vehiculoId,
    tipo_id: tipoId,
    actualizado_por: actor.id,
    actualizado_por_nombre: actor.nombre,
    actualizado_en: new Date().toISOString(),
  };
  if (cambios.estado !== undefined) fila.estado = cambios.estado;
  if (cambios.requeridoExtra !== undefined) fila.requerido_extra = cambios.requeridoExtra;
  if (cambios.fechaEmision !== undefined) fila.fecha_emision = cambios.fechaEmision;
  if (cambios.fechaVencimiento !== undefined) fila.fecha_vencimiento = cambios.fechaVencimiento;
  if (cambios.nota !== undefined) fila.nota = cambios.nota?.trim() || null;

  const { error } = await supabaseAdmin.from(T.documentos).upsert(fila, { onConflict: "vehiculo_id,tipo_id" });
  if (error) fallar(error, { [VIOLACION_LLAVE]: "El vehículo o el documento ya no existen." });
}

/**
 * Anota un archivo recién subido: queda registrado, el documento pasa a «cargado» y recuerda cuál
 * fue el último. Cada archivo tiene su fila con el id de SharePoint: es lo que permite después
 * eliminar uno y que el core y SharePoint digan lo mismo.
 */
export async function registrarArchivoDeVehiculo(
  vehiculoId: string,
  tipoId: string,
  archivo: { itemId: string; nombre: string; webUrl: string },
  extra: { fechaEmision?: string | null; fechaVencimiento?: string | null; nota?: string | null },
  actor: Actor,
): Promise<void> {
  const fila: Fila = {
    vehiculo_id: vehiculoId,
    tipo_id: tipoId,
    estado: "cargado",
    actualizado_por: actor.id,
    actualizado_por_nombre: actor.nombre,
    actualizado_en: new Date().toISOString(),
  };
  if (extra.fechaEmision !== undefined) fila.fecha_emision = extra.fechaEmision;
  if (extra.fechaVencimiento !== undefined) fila.fecha_vencimiento = extra.fechaVencimiento;
  if (extra.nota !== undefined && extra.nota?.trim()) fila.nota = extra.nota.trim();

  const { data: documento, error } = await supabaseAdmin
    .from(T.documentos)
    .upsert(fila, { onConflict: "vehiculo_id,tipo_id" })
    .select("id")
    .single();
  if (error) fallar(error);

  // `ignoreDuplicates`: si el navegador avisa dos veces del mismo archivo (un reintento tras un
  // corte), la segunda no lo duplica ni falla.
  const { error: errorArchivo } = await supabaseAdmin.from(T.archivos).upsert(
    {
      documento_id: documento.id as string,
      vehiculo_id: vehiculoId,
      item_id: archivo.itemId,
      nombre: archivo.nombre,
      url: archivo.webUrl,
      subido_por: actor.id,
      subido_por_nombre: actor.nombre,
    },
    { onConflict: "item_id", ignoreDuplicates: true },
  );
  if (errorArchivo) fallar(errorArchivo);

  await sincronizarDocumento(documento.id as string);
}

/**
 * Deja el documento diciendo lo mismo que sus archivos: el último, cuántos hay, y «pendiente» si no
 * queda ninguno. Es el único lugar que escribe esos tres campos, para que subir y eliminar no
 * puedan terminar contradiciéndose.
 */
async function sincronizarDocumento(documentoId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from(T.archivos)
    .select("*")
    .eq("documento_id", documentoId)
    .order("subido_en", { ascending: true });
  const archivos = (data ?? []) as Fila[];
  const ultimo = archivos[archivos.length - 1];

  const { error } = await supabaseAdmin
    .from(T.documentos)
    .update({
      item_id: (ultimo?.item_id as string) ?? null,
      archivo_nombre: (ultimo?.nombre as string) ?? null,
      archivo_url: (ultimo?.url as string) ?? null,
      cantidad_archivos: archivos.length,
    })
    .eq("id", documentoId);
  if (error) fallar(error);

  if (archivos.length === 0) {
    // Sin archivos ya no hay nada cargado, y las fechas eran las de ese archivo: dejarlas haría que
    // el próximo que se suba heredara un vencimiento ajeno.
    await supabaseAdmin
      .from(T.documentos)
      .update({ estado: "pendiente", fecha_emision: null, fecha_vencimiento: null })
      .eq("id", documentoId)
      .eq("estado", "cargado");
  }
}

export interface ArchivoRegistradoDeVehiculo {
  id: string;
  vehiculoId: string;
  documentoId: string;
  itemId: string;
  nombre: string;
}

export async function obtenerArchivoDeVehiculo(archivoId: string): Promise<ArchivoRegistradoDeVehiculo | null> {
  const { data } = await supabaseAdmin.from(T.archivos).select("*").eq("id", archivoId).maybeSingle();
  if (!data) return null;
  const f = data as Fila;
  return {
    id: f.id as string,
    vehiculoId: f.vehiculo_id as string,
    documentoId: f.documento_id as string,
    itemId: f.item_id as string,
    nombre: f.nombre as string,
  };
}

/** Quita el registro de un archivo (el de SharePoint se elimina antes, en la acción). */
export async function quitarRegistroDeArchivoDeVehiculo(archivo: ArchivoRegistradoDeVehiculo): Promise<void> {
  const { error } = await supabaseAdmin.from(T.archivos).delete().eq("id", archivo.id);
  if (error) fallar(error);
  await sincronizarDocumento(archivo.documentoId);
}

// -----------------------------------------------------------------------------
//  Historial
// -----------------------------------------------------------------------------

/**
 * Nunca hace fallar la operación que la llama: el historial es un registro de lo que pasó, no parte
 * de lo que pasó. Si no se pudo anotar, el documento ya se subió y avisar de un error llevaría a
 * subirlo otra vez. Se deja en el log, donde sí se va a ver.
 */
export async function registrarHistorialDeVehiculo(
  vehiculoId: string,
  accion: string,
  detalle: string | null,
  actor: Actor,
): Promise<void> {
  const { error } = await supabaseAdmin.from(T.historial).insert({
    vehiculo_id: vehiculoId,
    accion,
    detalle,
    usuario_id: actor.id,
    usuario_nombre: actor.nombre,
  });
  if (error) {
    console.error(`[vehiculos] No se pudo anotar el historial de ${vehiculoId}: ${error.message}`);
  }
}

export async function listarHistorialDeVehiculo(vehiculoId: string, limite = 100): Promise<EventoHistorial[]> {
  const { data } = await supabaseAdmin
    .from(T.historial)
    .select("*")
    .eq("vehiculo_id", vehiculoId)
    .order("creado_en", { ascending: false })
    .limit(limite);

  return ((data ?? []) as Fila[]).map((f) => ({
    id: f.id as number,
    accion: f.accion as string,
    detalle: (f.detalle as string) ?? null,
    usuarioNombre: f.usuario_nombre as string,
    creadoEn: f.creado_en as string,
  }));
}

// -----------------------------------------------------------------------------
//  La flota completa, ya analizada
// -----------------------------------------------------------------------------

export interface VehiculoAnalizado {
  vehiculo: Vehiculo;
  documentos: Map<string, DocumentoDeVehiculo>;
  categoria: CategoriaDeVehiculo | undefined;
  analisis: AnalisisDeVehiculo;
}

/**
 * Todo lo que necesitan la lista, la matriz, el reporte y el tablero, leído y calculado de una vez.
 *
 * Una función para todos y no una lectura por pantalla: son los mismos datos con el mismo cálculo,
 * y repetirlos es lo que hace que un día dos pantallas muestren un porcentaje distinto para el
 * mismo vehículo.
 */
export async function cargarFlota(): Promise<{
  contrato: DatosDeContrato;
  /** Cuántos vehículos se deben contratar en total. Null = sin definir. */
  dotacionRequerida: number | null;
  tipos: TipoDocumento[];
  categorias: CategoriaDeVehiculo[];
  vehiculos: VehiculoAnalizado[];
  hoy: string;
}> {
  const [contrato, dotacionRequerida, tipos, categorias, filas] = await Promise.all([
    obtenerContrato(),
    obtenerDotacionDeFlota(),
    listarTiposDeDocumento(),
    listarCategorias(),
    listarVehiculos(),
  ]);

  const hoy = hoyEnChile();
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));

  const vehiculos = filas.map(({ vehiculo, documentos }) => {
    const categoria = categoriaPorId.get(vehiculo.categoriaId);
    return {
      vehiculo,
      documentos,
      categoria,
      analisis: analizarVehiculo(vehiculo, documentos, tipos, new Set(categoria?.tipoIds ?? []), hoy),
    };
  });

  return { contrato, dotacionRequerida, tipos, categorias, vehiculos, hoy };
}
