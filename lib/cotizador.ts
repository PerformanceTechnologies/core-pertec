import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "./supabase-admin";
import { obtenerAplicacionPorSlug } from "./aplicaciones";
import { exigirAccesoApp } from "./autorizacion";
import { obtenerSetVigente } from "./parametros-legales";
import { calcularCotizacion, type QuotationResult } from "./cotizador/motor/consolidacion";
import type { LegalParameterSet, QuotationInput } from "./cotizador/motor/types";
import { calcularObra } from "./cotizador/obra/calculo";
import { DIVISOR_HH_DEFECTO, TIPO_OBRA, type ObraInput, type ObraResult } from "./cotizador/obra/tipos";
import type { Empresa } from "./cotizador/empresas";
import { normalizarNombreCotizacion } from "./cotizador/nombre-cotizacion";
import {
  puedeEnCotizador,
  puedeVerCotizacion,
  type AccionCotizador,
  type RolCotizador,
} from "./permisos-cotizador";
import type { UsuarioConAcceso } from "./tipos";

const SLUG_APP = "cotizador";

// El admin del core ya significa "control total" (igual que resuelve
// exigirAccesoApp con el catálogo de apps) — así que también es admin
// dentro del Cotizador. Un usuario normal usa el rol_extra que el admin le
// haya asignado para esta app (tabla usuario_aplicaciones), o "visualizador"
// si no le asignó ninguno. Mismo patrón que resolverRolPanel de Proyectos.
export async function resolverRolCotizador(usuario: UsuarioConAcceso): Promise<RolCotizador> {
  if (usuario.rol === "admin") return "admin";
  const app = await obtenerAplicacionPorSlug(SLUG_APP);
  if (!app) return "visualizador";
  return (usuario.rolesExtra[app.id] as RolCotizador) ?? "visualizador";
}

// Guard estándar para páginas y Server Actions del Cotizador: valida sesión +
// acceso a la app (igual que exigirAccesoApp) y además resuelve el rol
// interno. Si se pasa `accion`, redirige cuando el rol no alcanza — las
// Server Actions SIEMPRE deben pasarla (ocultar un botón en la UI no es una
// barrera de seguridad, ver server-actions.md del propio Next).
export async function exigirAccesoCotizador(
  accion?: AccionCotizador,
): Promise<{ usuario: UsuarioConAcceso; rol: RolCotizador }> {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const rol = await resolverRolCotizador(usuario);
  if (accion && !puedeEnCotizador(rol, accion)) redirect("/cotizador");
  return { usuario, rol };
}

// Import directo de los archivos del motor (no del barrel `./cotizador/motor/index`):
// el barrel usa `export *`, que en pruebas con el loader ESM nativo de Node
// (no así con el bundler de Next) mostró un problema de resolución de módulos.
// Importar directo evita cualquier riesgo de que ese comportamiento se repita.
//
// `EMPRESAS`/`Empresa`/`esEmpresaValida` viven en `./cotizador/empresas.ts`
// (sin "server-only"): los formularios de creación/edición son parte del
// árbol de Client Components del editor, y ese módulo debe poder importarse
// ahí sin arrastrar este archivo server-only al bundle del navegador.

export interface CotizacionResumen {
  id: string;
  nombre: string;
  empresa: Empresa;
  cliente: string | null;
  faena: string | null;
  tipoServicio: string;
  rev: string;
  estado: string;
  emitida: boolean;
  // Cotización sembrada como ejemplo: sus cifras son ilustrativas y NO
  // corresponden a un Excel real. Se rotula en la UI y se excluye de los KPI
  // del dashboard — ver comentario de la columna es_demo en la DB.
  esDemo: boolean;
  /** Quién la creó. Null en cargas manuales antiguas: ver puedeVerCotizacion. */
  creadoPor: string | null;
  actualizadoEn: string;
  summary: ResumenCotizacion;
}

/**
 * La entrada guardada, que depende del tipo de servicio.
 *
 * `spot` y `contrato_permanente` guardan un QuotationInput y los calcula el
 * motor; `spot_turnos` (obra) guarda un ObraInput y lo calcula
 * lib/cotizador/obra. Comparten tabla y columna `input` (jsonb) a propósito: son
 * la misma cosa para el negocio —una cotización, con su cliente, su revisión y
 * su estado— y separarlas en dos tablas obligaría a duplicar el listado, los
 * permisos, el versionado y el panel.
 *
 * `esObra()` es el único lugar donde se decide cuál es cuál.
 */
export type EntradaCotizacion = QuotationInput | ObraInput;

export function esObra(input: EntradaCotizacion): input is ObraInput {
  return input.tipoServicio === TIPO_OBRA;
}

export function esTipoObra(tipoServicio: string): boolean {
  return tipoServicio === TIPO_OBRA;
}

export interface CotizacionCompleta extends CotizacionResumen {
  creadoEn: string;
  input: EntradaCotizacion;
  parametrosSetId: string | null;
  parametrosSnapshot: LegalParameterSet;
}

export interface ResumenCotizacion {
  costoMensualTotal: number;
  costoTotalServicio: number;
  ecoTotalNeto: number;
  ecoConIva: number;
  margenEfectivoTotal: number;
  dotacionTotal: number;
}

const COLUMNAS_RESUMEN = `
  id, nombre, empresa, cliente, faena, tipo_servicio, rev, estado, emitida, es_demo, creado_por,
  actualizado_en, summary
`;
const COLUMNAS_COMPLETA = `${COLUMNAS_RESUMEN}, creado_en, input, parametros_set_id, parametros_snapshot`;

interface FilaResumen {
  id: string;
  nombre: string;
  empresa: Empresa;
  cliente: string | null;
  faena: string | null;
  tipo_servicio: string;
  rev: string;
  estado: string;
  emitida: boolean;
  es_demo: boolean;
  creado_por: string | null;
  actualizado_en: string;
  summary: ResumenCotizacion;
}

interface FilaCompleta extends FilaResumen {
  creado_en: string;
  input: EntradaCotizacion;
  parametros_set_id: string | null;
  parametros_snapshot: LegalParameterSet;
}

function filaAResumen(f: FilaResumen): CotizacionResumen {
  return {
    id: f.id,
    nombre: f.nombre,
    empresa: f.empresa,
    cliente: f.cliente,
    faena: f.faena,
    tipoServicio: f.tipo_servicio,
    rev: f.rev,
    estado: f.estado,
    emitida: f.emitida,
    esDemo: f.es_demo ?? false,
    creadoPor: f.creado_por ?? null,
    actualizadoEn: f.actualizado_en,
    summary: f.summary,
  };
}

function filaACompleta(f: FilaCompleta): CotizacionCompleta {
  return {
    ...filaAResumen(f),
    creadoEn: f.creado_en,
    input: f.input,
    parametrosSetId: f.parametros_set_id,
    parametrosSnapshot: f.parametros_snapshot,
  };
}

export function resumirResultado(result: QuotationResult): ResumenCotizacion {
  return {
    costoMensualTotal: result.costoMensualTotal,
    costoTotalServicio: result.costoTotalServicio,
    ecoTotalNeto: result.ecoTotalNeto,
    ecoConIva: result.ecoConIva,
    margenEfectivoTotal: result.margenEfectivoTotal,
    dotacionTotal: result.staff.reduce((acc, s) => acc + s.dotacionTotal, 0),
  };
}

/**
 * El mismo resumen, para una obra.
 *
 * Las claves son las del motor porque las consume el panel y el Dashboard, y no
 * vale la pena una segunda forma para lo mismo. Dos equivalencias que conviene
 * tener claras al leer un KPI:
 *
 *  - `costoMensualTotal` es el costo TOTAL de la obra, no de un mes: una obra no
 *    tiene mes. El nombre queda por compatibilidad.
 *  - `dotacionTotal` son las personas de la obra, no la dotación permanente.
 */
export function resumirObra(result: ObraResult): ResumenCotizacion {
  return {
    costoMensualTotal: result.costoTotal,
    costoTotalServicio: result.costoCargado,
    ecoTotalNeto: result.totalNeto,
    ecoConIva: result.totalConIva,
    margenEfectivoTotal: result.margenEfectivo,
    dotacionTotal: result.personasTotales,
  };
}

/** Cotización SPOT en blanco para "+ Nueva cotización" (parámetros por defecto, sin líneas). */
function cotizacionVacia(tipoServicio: QuotationInput["tipoServicio"]): QuotationInput {
  return {
    tipoServicio,
    duracionMeses: 1,
    diasServicio: 7,
    utilizacionPct: 0.7,
    horasBaseMes: 180,
    nCuadrillasDia: 1,
    nCuadrillasNoche: 0,
    factorContingencia: 1,
    divisorMovilizacion: 17,
    staff: [],
    personalSpotContrato: [],
    diasAlimentacionMes: 20,
    tarifasAlimentacion: { desayuno: 2100, almuerzo: 3800, cena: 3100, colacion: 1000 },
    costItems: [],
    equipos: [],
    metodoDepreciacionEquipos: "lineal",
    vehiculos: [],
    montoContratoBoleta: 0,
    tasaAnualBoleta: 0.0105,
    margenes: {
      mobPct: 0.014,
      ggPct: 0.07,
      utilidadPct: 0.1,
      ggEcoPct: 0.2,
      utilidadEcoPct: 0.2,
      ivaPct: 0.19,
      baseCalculoEco: "costo_puro",
    },
    rxItems: [],
  };
}

/** Obra en blanco: turnos y márgenes por defecto, sin dotación ni ítems. */
function obraVacia(): ObraInput {
  return {
    tipoServicio: TIPO_OBRA,
    // 4 turnos de 12 h es la parada de planta típica de un cambio de correa.
    turnos: { cantidad: 4, horas: 12 },
    dotacion: [],
    trabajosPrevios: [],
    items: [],
    divisorHH: DIVISOR_HH_DEFECTO,
    margenes: {
      mobPct: 0.014,
      ggPct: 0.07,
      utilidadPct: 0.1,
      ggEcoPct: 0.2,
      utilidadEcoPct: 0.2,
      ivaPct: 0.19,
      baseCalculoEco: "costo_puro",
    },
  };
}

// "Revxx" -> "Rev(xx+1)"; si el formato no calza (dato antiguo/manual), parte de Rev01.
function incrementarRev(rev: string): string {
  const m = /^Rev(\d+)$/.exec(rev);
  const n = m ? Number(m[1]) + 1 : 1;
  return `Rev${String(n).padStart(2, "0")}`;
}

/**
 * El listado que le corresponde a quien mira.
 *
 * Recibe el resultado de `exigirAccesoCotizador()` tal cual —`{ usuario, rol }`—
 * y no un booleano ni un id opcional: así no existe la forma de llamarla "sin
 * filtro" por descuido, que es exactamente el error que dejaría el portafolio
 * completo a la vista de todos otra vez.
 *
 * El filtro se hace en la consulta y no en memoria: traer todo y descartar
 * después significa mandar por la red cotizaciones que quien mira no puede ver.
 */
export async function listarCotizaciones(quien: {
  usuario: UsuarioConAcceso;
  rol: RolCotizador;
}): Promise<CotizacionResumen[]> {
  let consulta = supabaseAdmin.from("cotizaciones").select(COLUMNAS_RESUMEN);

  if (quien.rol !== "admin") {
    // Las suyas, más las de ejemplo (que son de todos) — misma regla que
    // puedeVerCotizacion, escrita en el lenguaje del filtro de Supabase.
    consulta = consulta.or(`creado_por.eq.${quien.usuario.id},es_demo.is.true`);
  }

  const { data } = await consulta.order("actualizado_en", { ascending: false });
  return ((data ?? []) as unknown as FilaResumen[]).map(filaAResumen);
}

/**
 * Guard para todo lo que trabaja sobre UNA cotización: sesión, acceso a la app,
 * rol suficiente para la acción, y que la cotización sea de quien la pide.
 *
 * Filtrar el listado no es control de acceso: sin esto, pegar la URL de la
 * cotización de otro seguía abriendo el editor con sus precios, y las Server
 * Actions seguían aceptando el id de cualquiera. Por eso todas las páginas,
 * rutas y acciones que reciben un id pasan por acá.
 *
 * Redirige al listado tanto si la cotización no existe como si no le
 * corresponde: distinguir los dos casos contaría si el id existe.
 */
export async function exigirCotizacion(
  id: string,
  accion?: AccionCotizador,
): Promise<{ usuario: UsuarioConAcceso; rol: RolCotizador; cotizacion: CotizacionCompleta }> {
  const { usuario, rol } = await exigirAccesoCotizador(accion);
  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion || !puedeVerCotizacion(cotizacion, usuario.id, rol)) redirect("/cotizador");
  return { usuario, rol, cotizacion };
}

export async function obtenerCotizacion(id: string): Promise<CotizacionCompleta | null> {
  const { data } = await supabaseAdmin
    .from("cotizaciones")
    .select(COLUMNAS_COMPLETA)
    .eq("id", id)
    .maybeSingle();

  return data ? filaACompleta(data as unknown as FilaCompleta) : null;
}

export interface DatosNuevaCotizacion {
  nombre: string;
  empresa: Empresa;
  cliente: string | null;
  faena: string | null;
  tipoServicio: string;
}

// Toma el set de parámetros VIGENTE al momento de crear (no el que estaba
// vigente cuando se abrió el formulario) y lo congela como parametros_snapshot:
// desde ahí en adelante, editar ese set nunca mueve los números de esta cotización.
export async function crearCotizacion(
  datos: DatosNuevaCotizacion,
  creadoPor?: string,
): Promise<CotizacionCompleta> {
  const set = await obtenerSetVigente();
  if (!set) {
    throw new Error(
      "No hay ningún set de parámetros legales vigente. Cree uno en /cotizador/parametros antes de crear cotizaciones.",
    );
  }

  const input: EntradaCotizacion = esTipoObra(datos.tipoServicio)
    ? obraVacia()
    : cotizacionVacia(datos.tipoServicio as QuotationInput["tipoServicio"]);
  const summary = esObra(input)
    ? resumirObra(calcularObra(input, set.valores))
    : resumirResultado(calcularCotizacion(input, set.valores));

  const { data, error } = await supabaseAdmin
    .from("cotizaciones")
    .insert({
      // Mismas reglas que en la importación: el listado se lee de un barrido
      // solo si todos los nombres siguen la misma forma.
      nombre: normalizarNombreCotizacion(datos.nombre),
      empresa: datos.empresa,
      cliente: datos.cliente?.trim() || null,
      faena: datos.faena?.trim() || null,
      tipo_servicio: datos.tipoServicio,
      rev: "Rev01",
      estado: "borrador",
      emitida: false,
      input,
      parametros_set_id: set.id,
      parametros_snapshot: set.valores,
      summary,
      creado_por: creadoPor ?? null,
    })
    .select(COLUMNAS_COMPLETA)
    .single();

  if (error) throw new Error(error.message);
  return filaACompleta(data as unknown as FilaCompleta);
}

/**
 * Crea una cotización de obra con su entrada YA construida.
 *
 * Es el camino de la importación de propuestas: `crearCotizacion` parte de una
 * obra en blanco, y acá la obra viene armada y cuadrada desde el PDF. Comparte
 * todo lo demás —snapshot de parámetros congelado, Rev01, borrador— para que una
 * cotización importada no sea un objeto de segunda clase.
 */
export async function crearCotizacionImportada(
  datos: {
    nombre: string;
    empresa: Empresa;
    cliente: string | null;
    faena: string | null;
    obra: ObraInput;
  },
  set: { id: string; valores: LegalParameterSet },
  creadoPor?: string,
): Promise<CotizacionCompleta> {
  const summary = resumirObra(calcularObra(datos.obra, set.valores));

  const { data, error } = await supabaseAdmin
    .from("cotizaciones")
    .insert({
      nombre: normalizarNombreCotizacion(datos.nombre),
      empresa: datos.empresa,
      cliente: datos.cliente?.trim() || null,
      faena: datos.faena?.trim() || null,
      tipo_servicio: TIPO_OBRA,
      rev: "Rev01",
      estado: "borrador",
      emitida: false,
      input: datos.obra,
      parametros_set_id: set.id,
      parametros_snapshot: set.valores,
      summary,
      creado_por: creadoPor ?? null,
    })
    .select(COLUMNAS_COMPLETA)
    .single();

  if (error) throw new Error(error.message);
  return filaACompleta(data as unknown as FilaCompleta);
}

export interface DatosMetaCotizacion {
  nombre: string;
  empresa: Empresa;
  cliente: string | null;
  faena: string | null;
  tipoServicio: string;
}

export async function actualizarMetaCotizacion(id: string, datos: DatosMetaCotizacion): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cotizaciones")
    .update({
      nombre: normalizarNombreCotizacion(datos.nombre),
      empresa: datos.empresa,
      cliente: datos.cliente?.trim() || null,
      faena: datos.faena?.trim() || null,
      tipo_servicio: datos.tipoServicio,
    })
    .eq("id", id)
    .eq("emitida", false); // snapshot congelado: una cotización emitida no se toca

  if (error) throw new Error(error.message);
}

// Recalcula con el parametros_snapshot YA CONGELADO de esta cotización (no con
// el set vigente actual), para que emitir una cotización sea reproducible sin
// importar qué pase después con los parámetros legales.
export async function actualizarInputCotizacion(
  id: string,
  input: EntradaCotizacion,
): Promise<ResumenCotizacion> {
  const actual = await obtenerCotizacion(id);
  if (!actual) throw new Error("Cotización no encontrada.");
  if (actual.emitida) throw new Error("No se puede editar una cotización emitida.");

  // El tipo guardado manda: sin esto, un input de obra podría llegar a una
  // cotización SPOT (o al revés) y el cálculo trabajaría sobre campos que no
  // existen, guardando ceros sin avisar.
  if (esTipoObra(actual.tipoServicio) !== esObra(input)) {
    throw new Error("El tipo de la entrada no corresponde al tipo de servicio de la cotización.");
  }

  const summary = esObra(input)
    ? resumirObra(calcularObra(input, actual.parametrosSnapshot))
    : resumirResultado(calcularCotizacion(input, actual.parametrosSnapshot));

  const { error } = await supabaseAdmin
    .from("cotizaciones")
    .update({ input, summary })
    .eq("id", id)
    .eq("emitida", false);

  if (error) throw new Error(error.message);
  return summary;
}

export async function marcarEmitida(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cotizaciones")
    .update({ emitida: true, estado: "emitida" })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// Duplica la cotización con el rev incrementado, como borrador editable — la
// original queda intacta (y sigue emitida, si lo estaba).
export async function crearNuevaVersion(id: string, creadoPor?: string): Promise<CotizacionCompleta> {
  const original = await obtenerCotizacion(id);
  if (!original) throw new Error("Cotización no encontrada.");

  const { data, error } = await supabaseAdmin
    .from("cotizaciones")
    .insert({
      nombre: original.nombre,
      empresa: original.empresa,
      cliente: original.cliente,
      faena: original.faena,
      tipo_servicio: original.tipoServicio,
      rev: incrementarRev(original.rev),
      estado: "borrador",
      emitida: false,
      input: original.input,
      parametros_set_id: original.parametrosSetId,
      parametros_snapshot: original.parametrosSnapshot,
      summary: original.summary,
      creado_por: creadoPor ?? null,
    })
    .select(COLUMNAS_COMPLETA)
    .single();

  if (error) throw new Error(error.message);
  return filaACompleta(data as unknown as FilaCompleta);
}

export async function eliminarCotizacion(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("cotizaciones").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
