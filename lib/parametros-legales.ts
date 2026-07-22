import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { LegalParameterSet, TaxBracket } from "./cotizador/motor/types";

// Sets de parámetros legales/tributarios del Cotizador (UF, UTM, tasas AFP/salud/
// cesantía, tramos de impuesto único). Se pueden editar libremente y crear otros:
// no se versionan por fila mutable — cada cotización guarda su propia copia
// congelada (public.cotizaciones.parametros_snapshot) al crearse, así una edición
// posterior a un set nunca cambia retroactivamente una cotización ya calculada.

export interface ParametrosLegalesSet {
  id: string;
  nombre: string;
  vigenteDesde: string;
  creadoEn: string;
  actualizadoEn: string;
  valores: LegalParameterSet;
}

interface FilaParametrosLegales {
  id: string;
  nombre: string;
  vigente_desde: string;
  creado_en: string;
  actualizado_en: string;
  uf: number | string;
  utm: number | string;
  ingreso_minimo: number | string;
  tope_imponible_afp_uf: number | string;
  tope_imponible_cesantia_uf: number | string;
  tasa_afp: number | string;
  tasa_salud_legal: number | string;
  tasa_sis_empleador: number | string;
  tasa_cesantia_trab_indefinido: number | string;
  tasa_cesantia_emp_indefinido: number | string;
  tasa_cesantia_trab_plazo_fijo: number | string;
  tasa_cesantia_emp_plazo_fijo: number | string;
  tasa_mutual_base: number | string;
  aporte_reforma_previsional_emp: number | string;
  tope_gratificacion_imm_anual: number | string;
  tramos: TaxBracket[];
}

const COLUMNAS = `
  id, nombre, vigente_desde, creado_en, actualizado_en,
  uf, utm, ingreso_minimo, tope_imponible_afp_uf, tope_imponible_cesantia_uf,
  tasa_afp, tasa_salud_legal, tasa_sis_empleador,
  tasa_cesantia_trab_indefinido, tasa_cesantia_emp_indefinido,
  tasa_cesantia_trab_plazo_fijo, tasa_cesantia_emp_plazo_fijo,
  tasa_mutual_base, aporte_reforma_previsional_emp, tope_gratificacion_imm_anual,
  tramos
`;

// Postgres devuelve `numeric` como string en algunos caminos (evita perder precisión) —
// se normaliza siempre a number acá, así el resto del código nunca tiene que pensarlo.
function filaASet(fila: FilaParametrosLegales): ParametrosLegalesSet {
  return {
    id: fila.id,
    nombre: fila.nombre,
    vigenteDesde: fila.vigente_desde,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    valores: {
      vigenteDesde: fila.vigente_desde,
      uf: Number(fila.uf),
      utm: Number(fila.utm),
      ingresoMinimo: Number(fila.ingreso_minimo),
      topeImponibleAfpUF: Number(fila.tope_imponible_afp_uf),
      topeImponibleCesantiaUF: Number(fila.tope_imponible_cesantia_uf),
      tasaAfp: Number(fila.tasa_afp),
      tasaSaludLegal: Number(fila.tasa_salud_legal),
      tasaSisEmpleador: Number(fila.tasa_sis_empleador),
      tasaCesantiaTrabIndefinido: Number(fila.tasa_cesantia_trab_indefinido),
      tasaCesantiaEmpIndefinido: Number(fila.tasa_cesantia_emp_indefinido),
      tasaCesantiaTrabPlazoFijo: Number(fila.tasa_cesantia_trab_plazo_fijo),
      tasaCesantiaEmpPlazoFijo: Number(fila.tasa_cesantia_emp_plazo_fijo),
      tasaMutualBase: Number(fila.tasa_mutual_base),
      aporteReformaPrevisionalEmp: Number(fila.aporte_reforma_previsional_emp),
      topeGratificacionImmAnual: Number(fila.tope_gratificacion_imm_anual),
      taxBrackets: fila.tramos,
    },
  };
}

export interface DatosSetParametros {
  nombre: string;
  vigenteDesde: string;
  valores: Omit<LegalParameterSet, "vigenteDesde">;
}

function datosAFila(datos: DatosSetParametros) {
  const v = datos.valores;
  return {
    nombre: datos.nombre.trim(),
    vigente_desde: datos.vigenteDesde,
    uf: v.uf,
    utm: v.utm,
    ingreso_minimo: v.ingresoMinimo,
    tope_imponible_afp_uf: v.topeImponibleAfpUF,
    tope_imponible_cesantia_uf: v.topeImponibleCesantiaUF,
    tasa_afp: v.tasaAfp,
    tasa_salud_legal: v.tasaSaludLegal,
    tasa_sis_empleador: v.tasaSisEmpleador,
    tasa_cesantia_trab_indefinido: v.tasaCesantiaTrabIndefinido,
    tasa_cesantia_emp_indefinido: v.tasaCesantiaEmpIndefinido,
    tasa_cesantia_trab_plazo_fijo: v.tasaCesantiaTrabPlazoFijo,
    tasa_cesantia_emp_plazo_fijo: v.tasaCesantiaEmpPlazoFijo,
    tasa_mutual_base: v.tasaMutualBase,
    aporte_reforma_previsional_emp: v.aporteReformaPrevisionalEmp,
    tope_gratificacion_imm_anual: v.topeGratificacionImmAnual,
    tramos: v.taxBrackets,
  };
}

export async function listarSetsParametros(): Promise<ParametrosLegalesSet[]> {
  const { data } = await supabaseAdmin
    .from("parametros_legales_sets")
    .select(COLUMNAS)
    .order("vigente_desde", { ascending: false });

  return ((data ?? []) as unknown as FilaParametrosLegales[]).map(filaASet);
}

export async function obtenerSetPorId(id: string): Promise<ParametrosLegalesSet | null> {
  const { data } = await supabaseAdmin
    .from("parametros_legales_sets")
    .select(COLUMNAS)
    .eq("id", id)
    .maybeSingle();

  return data ? filaASet(data as unknown as FilaParametrosLegales) : null;
}

// El set "vigente" es el de `vigente_desde` más reciente que ya llegó — el mismo
// criterio que antes resolvía la constante hardcodeada del motor standalone.
export async function obtenerSetVigente(): Promise<ParametrosLegalesSet | null> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("parametros_legales_sets")
    .select(COLUMNAS)
    .lte("vigente_desde", hoy)
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? filaASet(data as unknown as FilaParametrosLegales) : null;
}

export async function crearSetParametros(datos: DatosSetParametros): Promise<ParametrosLegalesSet> {
  const { data, error } = await supabaseAdmin
    .from("parametros_legales_sets")
    .insert(datosAFila(datos))
    .select(COLUMNAS)
    .single();

  if (error) throw new Error(error.message);
  return filaASet(data as unknown as FilaParametrosLegales);
}

// Edición libre: no afecta cotizaciones ya creadas (usan su propio
// parametros_snapshot, congelado al momento de crearse).
export async function actualizarSetParametros(id: string, datos: DatosSetParametros): Promise<void> {
  const { error } = await supabaseAdmin
    .from("parametros_legales_sets")
    .update(datosAFila(datos))
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function eliminarSetParametros(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("parametros_legales_sets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
