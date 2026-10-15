import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { contratoActual, idDelContrato } from "./contrato-actual";
import { olvidarDashboard } from "./memoria-dashboard";
import {
  CAMPOS_DE_PERSONA,
  analizarPersona,
  hoyEnChile,
  ordenarTipos,
  type AnalisisDePersona,
  type ArchivoDeDocumento,
  type Cargo,
  type CursoPersona,
  type DocumentoPersona,
  type EstadoCurso,
  type EstadoDocumento,
  type EstadoWebControl,
  type EventoHistorial,
  type Persona,
  type ResultadoDeCurso,
  type TipoDeCapacitacion,
  type TipoDeCatalogo,
  type TipoDocumento,
} from "./acreditacion-modelo";

const T = {
  // Los datos del contrato (nombre, inicio, administrador, dotación) son los de la fila del propio
  // contrato: en core-ih vivían en una tabla aparte de una sola fila.
  contrato: "ct_contratos",
  tipos: "ct_acreditacion_tipos",
  cargos: "ct_acreditacion_cargos",
  cargoTipos: "ct_acreditacion_cargo_tipos",
  personas: "ct_acreditacion_personas",
  documentos: "ct_acreditacion_documentos",
  cursos: "ct_acreditacion_cursos",
  historial: "ct_acreditacion_historial",
  archivos: "ct_acreditacion_archivos",
} as const;

/** Vistas que cuentan en la base (migración 0013). */
const VISTAS = {
  usoTipos: "ct_acreditacion_uso_tipos_v",
  usoCargos: "ct_acreditacion_uso_cargos_v",
} as const;

/** Quién hace el cambio. El nombre va aparte del id por lo que dice la migración. */
export interface Actor {
  id: string;
  nombre: string;
}

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
//  Contrato
// -----------------------------------------------------------------------------

export interface DatosDeContrato {
  nombre: string;
  fechaInicio: string | null;
  administrador: string | null;
  /** Cuántas personas se deben contratar en total. Null = sin definir. */
  dotacionRequerida: number | null;
}

export async function obtenerContrato(): Promise<DatosDeContrato> {
  const { data } = await supabaseAdmin.from(T.contrato).select("*").eq("id", await idDelContrato()).maybeSingle();
  const fila = (data ?? {}) as Fila;
  return {
    nombre: (fila.nombre as string) ?? "Contrato",
    fechaInicio: (fila.fecha_inicio as string) ?? null,
    administrador: (fila.administrador as string) ?? null,
    dotacionRequerida: (fila.dotacion_requerida as number) ?? null,
  };
}

// `dotacionRequerida` NO se escribe acá: se maneja con guardarDotacion, desde su propio panel.
// El upsert de abajo solo toca las columnas que se le pasan, así que guardar los datos del
// contrato no borra la dotación (ni al revés).
export async function guardarContrato(datos: Omit<DatosDeContrato, "dotacionRequerida">): Promise<void> {
  const contrato = await contratoActual();
  const { error } = await supabaseAdmin
    .from(T.contrato)
    .update({
      nombre: datos.nombre.trim() || contrato.nombre,
      fecha_inicio: datos.fechaInicio,
      administrador: datos.administrador?.trim() || null,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", contrato.id);
  if (error) fallar(error);
  olvidarDashboard();
}

// -----------------------------------------------------------------------------
//  Catálogo y cargos
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
export async function listarTipos(): Promise<TipoDocumento[]> {
  const { data, error } = await supabaseAdmin
    .from(T.tipos)
    .select("*")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) fallar(error);

  return ordenarTipos(((data ?? []) as Fila[]).map(aTipo));
}

/**
 * Todo el catálogo, activos o no, con cuánta gente lo tiene anotado.
 *
 * Es lo que ve quien lo administra: los desactivados tienen que poder
 * reactivarse, y "cuántas personas lo usan" decide si se puede eliminar o solo
 * desactivar.
 */
export async function listarTodosLosTipos(): Promise<TipoDeCatalogo[]> {
  const [tipos, uso] = await Promise.all([
    supabaseAdmin.from(T.tipos).select("*").order("orden", { ascending: true }),
    // Una fila por documento, contada en la base: leer todas las filas de
    // documentos para contarlas acá se queda corto en silencio pasadas las 1.000
    // que devuelve Supabase por consulta.
    supabaseAdmin.from(VISTAS.usoTipos).select("tipo_id, personas"),
  ]);
  if (tipos.error) fallar(tipos.error);

  const enUso = new Map<string, number>(
    ((uso.data ?? []) as Fila[]).map((f) => [f.tipo_id as string, f.personas as number]),
  );

  return ordenarTipos(
    ((tipos.data ?? []) as Fila[]).map((f) => ({
      ...aTipo(f),
      activo: Boolean(f.activo),
      enUso: enUso.get(f.id as string) ?? 0,
    })),
  );
}

/** "Examen de altura" -> "x_examen_de_altura": el código estable de un documento nuevo. */
function codigoDe(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
 * Agrega un documento al catálogo, y de una vez a los cargos que lo piden.
 *
 * El `orden` es el siguiente al mayor que existe, incluidos los inactivos: es el
 * número que lleva el archivo en SharePoint ("26 - ..."), y reutilizar el de un
 * documento desactivado mezclaría sus archivos con los del nuevo.
 */
export async function crearTipo(datos: {
  nombre: string;
  grupo: string;
  tieneVencimiento: boolean;
  cargoIds: string[];
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
    .insert({
      codigo,
      nombre,
      grupo: datos.grupo.trim(),
      orden,
      tiene_vencimiento: datos.tieneVencimiento,
    })
    .select("id")
    .single();
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_TIPO_REPETIDO });

  if (datos.cargoIds.length > 0) {
    const { error: errorCargos } = await supabaseAdmin
      .from(T.cargoTipos)
      .insert(datos.cargoIds.map((cargo_id) => ({ cargo_id, tipo_id: data.id as string })));
    if (errorCargos) fallar(errorCargos);
  }
}

export async function actualizarTipo(
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
 * Elimina un documento del catálogo, solo si nadie lo tiene anotado.
 *
 * Si hay personas con algo en él, no se puede: se llevaría por delante sus estados
 * y las referencias a sus archivos. Para eso existe desactivarlo, que lo saca de
 * los checklists y del avance sin borrar nada.
 */
export async function eliminarTipo(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.tipos).delete().eq("id", id);
  if (error) {
    fallar(error, {
      [VIOLACION_RESTRICT]:
        "Hay personas con este documento anotado, así que no se puede eliminar. Desactívalo para que deje de pedirse sin perder nada.",
    });
  }
}

export async function listarCargos(): Promise<Cargo[]> {
  const [cargos, relaciones, personas] = await Promise.all([
    supabaseAdmin.from(T.cargos).select("*").order("creado_en", { ascending: true }),
    supabaseAdmin.from(T.cargoTipos).select("cargo_id, tipo_id"),
    supabaseAdmin.from(VISTAS.usoCargos).select("cargo_id, personas"),
  ]);
  if (cargos.error) fallar(cargos.error);

  const tiposPorCargo = new Map<string, string[]>();
  for (const r of (relaciones.data ?? []) as Fila[]) {
    const lista = tiposPorCargo.get(r.cargo_id as string) ?? [];
    lista.push(r.tipo_id as string);
    tiposPorCargo.set(r.cargo_id as string, lista);
  }

  const personasPorCargo = new Map<string, number>(
    ((personas.data ?? []) as Fila[]).map((f) => [f.cargo_id as string, f.personas as number]),
  );

  return ((cargos.data ?? []) as Fila[]).map((f) => ({
    id: f.id as string,
    nombre: f.nombre as string,
    activo: Boolean(f.activo),
    tipoIds: tiposPorCargo.get(f.id as string) ?? [],
    personas: personasPorCargo.get(f.id as string) ?? 0,
    cantidadRequerida: (f.cantidad_requerida as number) ?? null,
  }));
}

/**
 * Guarda la dotación: el total del contrato y la cantidad de cada cargo, juntos.
 *
 * Solo toca los cargos que vienen en la lista: un cargo que no aparece (uno desactivado, que
 * el formulario no ofrece) conserva su cantidad en vez de quedar en blanco.
 */
export async function guardarDotacion(
  total: number | null,
  porCargo: { id: string; cantidad: number | null }[],
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.contrato)
    .update({ dotacion_requerida: total, actualizado_en: new Date().toISOString() })
    .eq("id", await idDelContrato());
  if (error) fallar(error);

  const resultados = await Promise.all(
    porCargo.map((c) =>
      supabaseAdmin.from(T.cargos).update({ cantidad_requerida: c.cantidad }).eq("id", c.id),
    ),
  );
  const fallo = resultados.find((r) => r.error);
  if (fallo?.error) fallar(fallo.error);
  olvidarDashboard();
}

const MENSAJE_CARGO_REPETIDO = "Ya existe un cargo con ese nombre.";

export async function crearCargo(nombre: string, tipoIds: string[]): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from(T.cargos)
    .insert({ nombre: nombre.trim() })
    .select("id")
    .single();
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_CARGO_REPETIDO });

  await reemplazarTiposDeCargo(data.id as string, tipoIds);
}

export async function actualizarCargo(
  id: string,
  datos: { nombre: string; activo: boolean; tipoIds: string[] },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.cargos)
    .update({ nombre: datos.nombre.trim(), activo: datos.activo })
    .eq("id", id);
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_CARGO_REPETIDO });

  await reemplazarTiposDeCargo(id, datos.tipoIds);
}

export async function eliminarCargo(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.cargos).delete().eq("id", id);
  if (error) {
    fallar(error, {
      [VIOLACION_RESTRICT]:
        "Hay personas con este cargo, así que no se puede eliminar. Desactívalo para que no aparezca al dar de alta a alguien nuevo.",
    });
  }
}

async function reemplazarTiposDeCargo(cargoId: string, tipoIds: string[]): Promise<void> {
  const { error: errorBorrar } = await supabaseAdmin.from(T.cargoTipos).delete().eq("cargo_id", cargoId);
  if (errorBorrar) fallar(errorBorrar);
  if (tipoIds.length === 0) return;

  const { error } = await supabaseAdmin
    .from(T.cargoTipos)
    .insert(tipoIds.map((tipo_id) => ({ cargo_id: cargoId, tipo_id })));
  if (error) fallar(error);
}

// -----------------------------------------------------------------------------
//  Personas
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

function aDocumento(f: Fila): DocumentoPersona {
  return {
    tipoId: f.tipo_id as string,
    estado: f.estado as EstadoDocumento,
    requeridoExtra: Boolean(f.requerido_extra),
    itemId: (f.item_id as string) ?? null,
    archivoNombre: (f.archivo_nombre as string) ?? null,
    archivoUrl: (f.archivo_url as string) ?? null,
    cantidadArchivos: (f.cantidad_archivos as number) ?? 0,
    // Solo vienen cuando la consulta los pidió (la ficha); la nómina no los
    // necesita y no paga por ellos.
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

function aCurso(c: Fila): CursoPersona {
  return {
    id: c.id as string,
    tipo: ((c.tipo as TipoDeCapacitacion) ?? "curso"),
    curso: c.curso as string,
    estado: c.estado as EstadoCurso,
    fecha: (c.fecha as string) ?? null,
    hora: (c.hora as string) ?? null,
    lugar: (c.lugar as string) ?? null,
    resultado: ((c.resultado as ResultadoDeCurso) ?? null),
    nota: (c.nota as string) ?? null,
    documentoTipoId: (c.documento_tipo_id as string) ?? null,
    partidaGastoId: (c.partida_gasto_id as string) ?? null,
    facturaPlazoDias: (c.factura_plazo_dias as number) ?? null,
  };
}

function aPersona(f: Fila): Persona {
  const datos: Record<string, string | null> = {};
  for (const c of CAMPOS_DE_PERSONA) datos[c.campo] = (f[c.campo] as string) ?? null;

  return {
    id: f.id as string,
    numero: f.numero as number,
    nombre: f.nombre as string,
    rut: f.rut as string,
    cargoId: f.cargo_id as string,
    activo: Boolean(f.activo),
    indefinido: Boolean(f.indefinido),
    estadoWebControl: f.estado_web_control as EstadoWebControl,
    wcAcreditado: Boolean(f.wc_acreditado),
    creadoEnBuk: Boolean(f.creado_en_buk),
    numeroPase: (f.numero_pase as string) ?? null,
    estadoPase: (f.estado_pase as string) ?? null,
    observaciones: (f.observaciones as string) ?? null,
    carpetaItemId: (f.carpeta_item_id as string) ?? null,
    carpetaUrl: (f.carpeta_url as string) ?? null,
    creadoEn: f.creado_en as string,
    sinContrato: Boolean(f.sin_contrato),
    datos,
  };
}

export interface PersonaConDocumentos {
  persona: Persona;
  documentos: Map<string, DocumentoPersona>;
  cursos: CursoPersona[];
}

/**
 * Todas las personas con sus documentos, de una consulta.
 *
 * La nómina calcula el avance de cada fila, así que necesita los documentos de
 * todas. Una consulta por persona serían N viajes a Supabase en la pantalla que
 * más se abre; con el embed es uno.
 */
export async function listarPersonas(): Promise<PersonaConDocumentos[]> {
  const filas: Fila[] = [];

  // De a mil: Supabase corta cada consulta ahí y no avisa. Sin paginar, la persona
  // 1.001 de la nómina simplemente no existiría en pantalla, y todo lo calculado
  // sobre la lista —avance global, reporte, Excel— saldría bajo sin ningún error.
  const TAMANO = 1000;
  for (let desde = 0; ; desde += TAMANO) {
    const { data, error } = await supabaseAdmin
      .from(T.personas)
      .select(`*, ${T.documentos}(*), ${T.cursos}(*)`)
      .order("numero", { ascending: true })
      .range(desde, desde + TAMANO - 1);
    if (error) fallar(error);

    const pagina = (data ?? []) as Fila[];
    filas.push(...pagina);
    if (pagina.length < TAMANO) break;
  }

  return filas.map((f) => ({
    persona: aPersona(f),
    documentos: new Map(
      ((f[T.documentos] as Fila[]) ?? []).map((d) => [d.tipo_id as string, aDocumento(d)]),
    ),
    cursos: ((f[T.cursos] as Fila[]) ?? [])
      .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)))
      .map(aCurso),
  }));
}

export async function obtenerPersona(
  id: string,
): Promise<PersonaConDocumentos | null> {
  const { data, error } = await supabaseAdmin
    .from(T.personas)
    .select(`*, ${T.documentos}(*, ${T.archivos}(*)), ${T.cursos}(*)`)
    .eq("id", id)
    .maybeSingle();
  if (error) fallar(error);
  if (!data) return null;

  const f = data as Fila;
  return {
    persona: aPersona(f),
    documentos: new Map(
      ((f[T.documentos] as Fila[]) ?? []).map((d) => [d.tipo_id as string, aDocumento(d)]),
    ),
    cursos: ((f[T.cursos] as Fila[]) ?? [])
      .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)))
      .map(aCurso),
  };
}

export async function crearPersona(
  datos: { nombre: string; rut: string; cargoId: string; faena: string | null; turno: string | null },
  actor: Actor,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from(T.personas)
    .insert({
      nombre: datos.nombre.trim(),
      rut: datos.rut,
      cargo_id: datos.cargoId,
      faena: datos.faena?.trim() || null,
      turno: datos.turno?.trim() || null,
      creado_por: actor.id,
    })
    .select("id")
    .single();

  if (error) {
    fallar(error, {
      [VIOLACION_UNICA]: "Ya existe una persona con ese RUT.",
      [VIOLACION_LLAVE]: "El cargo elegido ya no existe.",
    });
  }

  const id = data.id as string;
  await registrarHistorial(id, "Alta", `Se dio de alta a ${datos.nombre.trim()}.`, actor);
  return id;
}

export async function actualizarDatos(
  id: string,
  cambios: {
    nombre: string;
    cargoId: string;
    indefinido: boolean;
    datos: Record<string, string | null>;
  },
  actor: Actor,
): Promise<void> {
  const fila: Fila = {
    nombre: cambios.nombre.trim(),
    cargo_id: cambios.cargoId,
    indefinido: cambios.indefinido,
    actualizado_en: new Date().toISOString(),
  };
  // Solo las columnas de la lista: el formulario manda lo que quiera, y lo que no
  // esté acá no llega a la base.
  for (const c of CAMPOS_DE_PERSONA) {
    if (c.campo in cambios.datos) fila[c.campo] = cambios.datos[c.campo];
  }

  const { error } = await supabaseAdmin.from(T.personas).update(fila).eq("id", id);
  if (error) fallar(error, { [VIOLACION_LLAVE]: "El cargo elegido ya no existe." });

  await registrarHistorial(id, "Datos", "Se actualizaron los datos de la ficha.", actor);
}

export async function actualizarSeguimiento(
  id: string,
  cambios: {
    estadoWebControl: EstadoWebControl;
    wcAcreditado: boolean;
    creadoEnBuk: boolean;
    numeroPase: string | null;
    estadoPase: string | null;
    observaciones: string | null;
  },
  actor: Actor,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.personas)
    .update({
      estado_web_control: cambios.estadoWebControl,
      wc_acreditado: cambios.wcAcreditado,
      creado_en_buk: cambios.creadoEnBuk,
      numero_pase: cambios.numeroPase,
      estado_pase: cambios.estadoPase,
      observaciones: cambios.observaciones,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) fallar(error);

  await registrarHistorial(id, "Seguimiento", "Se actualizó Web Control, BUK o el pase.", actor);
}

/** Marca o desmarca «sin contrato aún»: si la persona cuenta o no en la dotación. */
export async function cambiarSinContrato(id: string, sinContrato: boolean, actor: Actor): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.personas)
    .update({ sin_contrato: sinContrato, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) fallar(error);

  await registrarHistorial(
    id,
    "Contrato",
    sinContrato ? "Se marcó «sin contrato aún»: no cuenta en la dotación." : "Se quitó la marca «sin contrato aún».",
    actor,
  );
}

/** Marca o desmarca «Creado en BUK» sin tocar el resto del seguimiento. */
export async function cambiarCreadoEnBuk(id: string, creado: boolean, actor: Actor): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.personas)
    .update({ creado_en_buk: creado, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) fallar(error);

  await registrarHistorial(id, "Seguimiento", creado ? "Se marcó como creado en BUK." : "Se desmarcó «Creado en BUK».", actor);
}

/** El plazo de pago de la factura de un curso o examen, en días (null = sin plazo o ya pagada). */
export async function fijarPlazoDeFactura(cursoId: string, dias: number | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.cursos)
    .update({ factura_plazo_dias: dias, actualizado_en: new Date().toISOString() })
    .eq("id", cursoId);
  if (error) fallar(error);
}

export async function cambiarActivo(id: string, activo: boolean, actor: Actor): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.personas)
    .update({ activo, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) fallar(error);

  await registrarHistorial(id, activo ? "Reactivación" : "Baja", null, actor);
}

export async function eliminarPersona(id: string): Promise<void> {
  // Se lleva en cascada los documentos, cursos e historial. Los archivos NO: esos
  // son de SharePoint, y borrarlos desde acá saltaría su papelera y sus permisos.
  const { error } = await supabaseAdmin.from(T.personas).delete().eq("id", id);
  if (error) fallar(error);
}

export async function guardarCarpetaDePersona(
  id: string,
  carpeta: { id: string; webUrl: string },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.personas)
    .update({ carpeta_item_id: carpeta.id, carpeta_url: carpeta.webUrl })
    .eq("id", id);
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
 * Es un upsert con SOLO las columnas presentes: en un insert-or-update de
 * PostgREST, las que no vienen en el cuerpo no se tocan. Pasar todas siempre
 * —con null donde no hay cambio— borraría el archivo al cambiar el estado.
 */
export async function guardarDocumento(
  personaId: string,
  tipoId: string,
  cambios: CambiosDeDocumento,
  actor: Actor,
): Promise<void> {
  const fila: Fila = {
    persona_id: personaId,
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

  const { error } = await supabaseAdmin
    .from(T.documentos)
    .upsert(fila, { onConflict: "persona_id,tipo_id" });
  if (error) fallar(error, { [VIOLACION_LLAVE]: "La persona o el documento ya no existen." });
}

/**
 * Anota un archivo recién subido: queda registrado, el documento pasa a "cargado" y
 * recuerda cuál fue el último.
 *
 * Cada archivo tiene su fila (ct_acreditacion_archivos) con el id de SharePoint:
 * es lo que permite después eliminar uno y que el core y SharePoint digan lo mismo.
 */
export async function registrarArchivo(
  personaId: string,
  tipoId: string,
  archivo: { itemId: string; nombre: string; webUrl: string },
  extra: { fechaEmision?: string | null; fechaVencimiento?: string | null; nota?: string | null },
  actor: Actor,
): Promise<void> {
  const fila: Fila = {
    persona_id: personaId,
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
    .upsert(fila, { onConflict: "persona_id,tipo_id" })
    .select("id")
    .single();
  if (error) fallar(error);

  // `ignoreDuplicates`: si el navegador avisa dos veces del mismo archivo (un
  // reintento tras un corte), la segunda no lo duplica ni falla.
  const { error: errorArchivo } = await supabaseAdmin.from(T.archivos).upsert(
    {
      documento_id: documento.id as string,
      persona_id: personaId,
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
 * Deja el documento diciendo lo mismo que sus archivos: el último, cuántos hay, y
 * "pendiente" si no queda ninguno.
 *
 * Es el único lugar que escribe esos tres campos, para que subir y eliminar no
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
    // Sin archivos ya no hay nada cargado, y las fechas eran las de ese archivo:
    // dejarlas haría que el próximo que se suba heredara un vencimiento ajeno.
    await supabaseAdmin
      .from(T.documentos)
      .update({ estado: "pendiente", fecha_emision: null, fecha_vencimiento: null })
      .eq("id", documentoId)
      .eq("estado", "cargado");
  }
}

export interface ArchivoRegistrado {
  id: string;
  personaId: string;
  documentoId: string;
  itemId: string;
  nombre: string;
}

export async function obtenerArchivo(archivoId: string): Promise<ArchivoRegistrado | null> {
  const { data } = await supabaseAdmin.from(T.archivos).select("*").eq("id", archivoId).maybeSingle();
  if (!data) return null;
  const f = data as Fila;
  return {
    id: f.id as string,
    personaId: f.persona_id as string,
    documentoId: f.documento_id as string,
    itemId: f.item_id as string,
    nombre: f.nombre as string,
  };
}

/** Quita el registro de un archivo (el de SharePoint se elimina antes, en la acción). */
export async function quitarRegistroDeArchivo(archivo: ArchivoRegistrado): Promise<void> {
  const { error } = await supabaseAdmin.from(T.archivos).delete().eq("id", archivo.id);
  if (error) fallar(error);
  await sincronizarDocumento(archivo.documentoId);
}

/** El enlace guardado de la carpeta de una persona (cambia si se renombra). */
export async function guardarEnlaceDeCarpeta(id: string, webUrl: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.personas).update({ carpeta_url: webUrl }).eq("id", id);
  if (error) fallar(error);
}

// -----------------------------------------------------------------------------
//  Cursos
// -----------------------------------------------------------------------------

/** Lo que se anota de un curso o examen. */
export interface DatosDeCapacitacion {
  tipo: TipoDeCapacitacion;
  curso: string;
  estado: EstadoCurso;
  fecha: string | null;
  hora: string | null;
  lugar: string | null;
  resultado: ResultadoDeCurso | null;
  nota: string | null;
}

const MENSAJE_DE_RESERVA_DUPLICADA = "Esa persona ya tiene reservado eso: edítalo en lugar de agregarlo otra vez.";

/** Qué es lo que se anotó, para el historial: «examen Examen preocupacional». */
function descripcion(d: { tipo: TipoDeCapacitacion; curso: string }): string {
  return `${d.tipo === "examen" ? "Examen" : "Curso"} ${d.curso}`;
}

export async function agregarCurso(personaId: string, datos: DatosDeCapacitacion, actor: Actor): Promise<void> {
  const { error } = await supabaseAdmin.from(T.cursos).insert({
    persona_id: personaId,
    tipo: datos.tipo,
    curso: datos.curso.trim(),
    estado: datos.estado,
    fecha: datos.fecha,
    hora: datos.hora,
    lugar: datos.lugar,
    // El resultado solo existe en lo ya realizado: la base lo exige y acá se garantiza.
    resultado: datos.estado === "realizado" ? datos.resultado : null,
    nota: datos.nota,
  });
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_DE_RESERVA_DUPLICADA });

  await registrarHistorial(personaId, "Curso o examen", `${descripcion(datos)}: ${datos.estado}.`, actor);
}

/** Corrige todo lo anotado de un curso o examen (fecha, lugar, resultado, estado…). */
export async function actualizarCurso(
  personaId: string,
  cursoId: string,
  datos: DatosDeCapacitacion,
  actor: Actor,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.cursos)
    .update({
      tipo: datos.tipo,
      curso: datos.curso.trim(),
      estado: datos.estado,
      fecha: datos.fecha,
      hora: datos.hora,
      lugar: datos.lugar,
      resultado: datos.estado === "realizado" ? datos.resultado : null,
      nota: datos.nota,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", cursoId)
    .eq("persona_id", personaId);
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_DE_RESERVA_DUPLICADA });

  await registrarHistorial(personaId, "Curso o examen", `${descripcion(datos)} actualizado (${datos.estado}).`, actor);
}

/**
 * Cambia solo el estado (el botón de la fila). Al salir de «realizado» se vacía el resultado: un
 * examen que vuelve a «reservado» no puede seguir diciendo «aprobado».
 */
export async function cambiarEstadoCurso(
  personaId: string,
  cursoId: string,
  estado: EstadoCurso,
  actor: Actor,
  resultado: ResultadoDeCurso | null = null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.cursos)
    .update({
      estado,
      resultado: estado === "realizado" ? resultado : null,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", cursoId)
    .eq("persona_id", personaId);
  if (error) fallar(error, { [VIOLACION_UNICA]: MENSAJE_DE_RESERVA_DUPLICADA });

  await registrarHistorial(personaId, "Curso o examen", `Pasó a ${estado}${estado === "realizado" && resultado ? ` (${resultado})` : ""}.`, actor);
}

export async function quitarCurso(personaId: string, cursoId: string, actor: Actor): Promise<void> {
  // Se lee antes para que el historial diga QUÉ se quitó: «se quitó un registro» no le sirve a nadie.
  const previo = await obtenerCurso(personaId, cursoId);

  const { error } = await supabaseAdmin
    .from(T.cursos)
    .delete()
    .eq("id", cursoId)
    .eq("persona_id", personaId);
  if (error) fallar(error);

  await registrarHistorial(
    personaId,
    "Curso o examen",
    previo ? `Se eliminó ${descripcion(previo).toLowerCase()}.` : "Se eliminó un registro.",
    actor,
  );
}

/** Un curso o examen de esa persona, o null. La persona se exige: el id viaja desde el navegador. */
export async function obtenerCurso(personaId: string, cursoId: string): Promise<CursoPersona | null> {
  const { data, error } = await supabaseAdmin
    .from(T.cursos)
    .select("*")
    .eq("id", cursoId)
    .eq("persona_id", personaId)
    .maybeSingle();
  if (error) fallar(error);
  return data ? aCurso(data as Fila) : null;
}

/** Anota en qué documento del catálogo quedó el archivo subido para este curso o examen. */
export async function vincularDocumentoACurso(cursoId: string, tipoId: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.cursos)
    .update({ documento_tipo_id: tipoId, actualizado_en: new Date().toISOString() })
    .eq("id", cursoId);
  if (error) fallar(error);
}

/** Anota (o suelta, con null) la línea de Gastos de arranque que nació de la factura. */
export async function vincularGastoACurso(cursoId: string, partidaId: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.cursos)
    .update({
      partida_gasto_id: partidaId,
      // Sin factura no hay plazo de pago que recordar.
      ...(partidaId === null ? { factura_plazo_dias: null } : {}),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", cursoId);
  if (error) fallar(error, { [VIOLACION_UNICA]: "Ese gasto ya está asociado a otro curso o examen." });
}

// -----------------------------------------------------------------------------
//  Historial
// -----------------------------------------------------------------------------

/**
 * Nunca hace fallar la operación que la llama.
 *
 * El historial es un registro de lo que pasó, no parte de lo que pasó: si no se
 * pudo anotar, el documento ya se subió y avisarle a la persona de un error la
 * llevaría a subirlo otra vez. Se deja en el log, donde sí se va a ver.
 */
export async function registrarHistorial(
  personaId: string,
  accion: string,
  detalle: string | null,
  actor: Actor,
): Promise<void> {
  const { error } = await supabaseAdmin.from(T.historial).insert({
    persona_id: personaId,
    accion,
    detalle,
    usuario_id: actor.id,
    usuario_nombre: actor.nombre,
  });
  if (error) {
    console.error(`[acreditacion] No se pudo anotar el historial de ${personaId}: ${error.message}`);
  }
}

export async function listarHistorial(personaId: string, limite = 100): Promise<EventoHistorial[]> {
  const { data } = await supabaseAdmin
    .from(T.historial)
    .select("*")
    .eq("persona_id", personaId)
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
//  La nómina completa, ya analizada
// -----------------------------------------------------------------------------

export interface PersonaAnalizada {
  persona: Persona;
  documentos: Map<string, DocumentoPersona>;
  cursos: CursoPersona[];
  cargo: Cargo | undefined;
  analisis: AnalisisDePersona;
}

/**
 * Todo lo que necesitan la nómina, la matriz, el reporte y la exportación, leído
 * y calculado de una vez.
 *
 * Una función para las cuatro y no una lectura por pantalla: son los mismos
 * datos con el mismo cálculo, y repetirlos es lo que hace que un día dos
 * pantallas muestren un porcentaje distinto para la misma persona.
 */
export async function cargarNomina(): Promise<{
  contrato: DatosDeContrato;
  tipos: TipoDocumento[];
  cargos: Cargo[];
  personas: PersonaAnalizada[];
  hoy: string;
}> {
  const [contrato, tipos, cargos, filas] = await Promise.all([
    obtenerContrato(),
    listarTipos(),
    listarCargos(),
    listarPersonas(),
  ]);

  const hoy = hoyEnChile();
  const cargoPorId = new Map(cargos.map((c) => [c.id, c]));

  const personas = filas.map(({ persona, documentos, cursos }) => {
    const cargo = cargoPorId.get(persona.cargoId);
    return {
      persona,
      documentos,
      cursos,
      cargo,
      analisis: analizarPersona(persona, documentos, tipos, new Set(cargo?.tipoIds ?? []), hoy),
    };
  });

  return { contrato, tipos, cargos, personas, hoy };
}

/**
 * De estos RUT, los que ya están en la nómina.
 *
 * Se pregunta por los que se van a importar (`in`) y no por todos: traer todos los
 * RUT para compararlos acá tiene el mismo tope de 1.000 filas, y un duplicado que
 * quedara fuera de esa lectura se crearía dos veces.
 */
export async function rutsExistentes(ruts: string[]): Promise<Set<string>> {
  if (ruts.length === 0) return new Set();
  const { data, error } = await supabaseAdmin.from(T.personas).select("rut").in("rut", ruts);
  if (error) fallar(error);
  return new Set(((data ?? []) as Fila[]).map((f) => f.rut as string));
}
