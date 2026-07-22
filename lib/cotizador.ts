import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { obtenerSetVigente } from "./parametros-legales";
import { calcularCotizacion, type QuotationResult } from "./cotizador/motor/consolidacion";
import type { LegalParameterSet, QuotationInput } from "./cotizador/motor/types";

// Import directo de los archivos del motor (no del barrel `./cotizador/motor/index`):
// el barrel usa `export *`, que en pruebas con el loader ESM nativo de Node
// (no así con el bundler de Next) mostró un problema de resolución de módulos.
// Importar directo evita cualquier riesgo de que ese comportamiento se repita.

export interface CotizacionResumen {
  id: string;
  nombre: string;
  cliente: string | null;
  faena: string | null;
  tipoServicio: string;
  rev: string;
  estado: string;
  emitida: boolean;
  actualizadoEn: string;
  summary: ResumenCotizacion;
}

export interface CotizacionCompleta extends CotizacionResumen {
  creadoEn: string;
  input: QuotationInput;
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
  id, nombre, cliente, faena, tipo_servicio, rev, estado, emitida, actualizado_en, summary
`;
const COLUMNAS_COMPLETA = `${COLUMNAS_RESUMEN}, creado_en, input, parametros_set_id, parametros_snapshot`;

interface FilaResumen {
  id: string;
  nombre: string;
  cliente: string | null;
  faena: string | null;
  tipo_servicio: string;
  rev: string;
  estado: string;
  emitida: boolean;
  actualizado_en: string;
  summary: ResumenCotizacion;
}

interface FilaCompleta extends FilaResumen {
  creado_en: string;
  input: QuotationInput;
  parametros_set_id: string | null;
  parametros_snapshot: LegalParameterSet;
}

function filaAResumen(f: FilaResumen): CotizacionResumen {
  return {
    id: f.id,
    nombre: f.nombre,
    cliente: f.cliente,
    faena: f.faena,
    tipoServicio: f.tipo_servicio,
    rev: f.rev,
    estado: f.estado,
    emitida: f.emitida,
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

// "Revxx" -> "Rev(xx+1)"; si el formato no calza (dato antiguo/manual), parte de Rev01.
function incrementarRev(rev: string): string {
  const m = /^Rev(\d+)$/.exec(rev);
  const n = m ? Number(m[1]) + 1 : 1;
  return `Rev${String(n).padStart(2, "0")}`;
}

export async function listarCotizaciones(): Promise<CotizacionResumen[]> {
  const { data } = await supabaseAdmin
    .from("cotizaciones")
    .select(COLUMNAS_RESUMEN)
    .order("actualizado_en", { ascending: false });

  return ((data ?? []) as unknown as FilaResumen[]).map(filaAResumen);
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
  cliente: string | null;
  faena: string | null;
  tipoServicio: QuotationInput["tipoServicio"];
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

  const input = cotizacionVacia(datos.tipoServicio);
  const resultado = calcularCotizacion(input, set.valores);

  const { data, error } = await supabaseAdmin
    .from("cotizaciones")
    .insert({
      nombre: datos.nombre.trim() || "Nueva cotización",
      cliente: datos.cliente?.trim() || null,
      faena: datos.faena?.trim() || null,
      tipo_servicio: datos.tipoServicio,
      rev: "Rev01",
      estado: "borrador",
      emitida: false,
      input,
      parametros_set_id: set.id,
      parametros_snapshot: set.valores,
      summary: resumirResultado(resultado),
      creado_por: creadoPor ?? null,
    })
    .select(COLUMNAS_COMPLETA)
    .single();

  if (error) throw new Error(error.message);
  return filaACompleta(data as unknown as FilaCompleta);
}

export interface DatosMetaCotizacion {
  nombre: string;
  cliente: string | null;
  faena: string | null;
  tipoServicio: QuotationInput["tipoServicio"];
}

export async function actualizarMetaCotizacion(id: string, datos: DatosMetaCotizacion): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cotizaciones")
    .update({
      nombre: datos.nombre.trim() || "Nueva cotización",
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
export async function actualizarInputCotizacion(id: string, input: QuotationInput): Promise<ResumenCotizacion> {
  const actual = await obtenerCotizacion(id);
  if (!actual) throw new Error("Cotización no encontrada.");
  if (actual.emitida) throw new Error("No se puede editar una cotización emitida.");

  const resultado = calcularCotizacion(input, actual.parametrosSnapshot);
  const summary = resumirResultado(resultado);

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
