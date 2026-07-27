import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import type { Bono } from "./motor/types";
import type { CatalogoCargo, DatosCargoCatalogo } from "./catalogo-cargos-tipos";

// Catálogo de cargos reutilizable — sirve como biblioteca de referencia para
// prellenar dotación al cotizar (ver cargoCatalogoAStaffInput). Eliminar un
// cargo lo desactiva (activo = false) en vez de borrarlo: así cotizaciones ya
// creadas nunca se ven afectadas (guardan su propio StaffInput por valor, no
// una referencia al catálogo) y el historial de qué se usó no se pierde.

interface FilaCatalogoCargo {
  id: string;
  cargo: string;
  area: string | null;
  clasificacion: "directo" | "indirecto";
  turno_tipico: string | null;
  modo_sueldo_tipico: "base" | "liquido";
  base_referencial: number | string | null;
  liquido_referencial: number | string | null;
  bonos_default: Bono[];
  asig_movilizacion_referencial: number | string;
  asig_colacion_referencial: number | string;
  horas_servicio_dia_referencial: number | string | null;
  activo: boolean;
}

const COLUMNAS = `
  id, cargo, area, clasificacion, turno_tipico, modo_sueldo_tipico,
  base_referencial, liquido_referencial, bonos_default,
  asig_movilizacion_referencial, asig_colacion_referencial,
  horas_servicio_dia_referencial, activo
`;

function filaACargo(fila: FilaCatalogoCargo): CatalogoCargo {
  return {
    id: fila.id,
    cargo: fila.cargo,
    area: fila.area,
    clasificacion: fila.clasificacion,
    turnoTipico: (fila.turno_tipico as CatalogoCargo["turnoTipico"]) ?? null,
    modoSueldoTipico: fila.modo_sueldo_tipico,
    baseReferencial: fila.base_referencial === null ? null : Number(fila.base_referencial),
    liquidoReferencial: fila.liquido_referencial === null ? null : Number(fila.liquido_referencial),
    bonosDefault: fila.bonos_default ?? [],
    asigMovilizacionReferencial: Number(fila.asig_movilizacion_referencial),
    asigColacionReferencial: Number(fila.asig_colacion_referencial),
    horasServicioDiaReferencial:
      fila.horas_servicio_dia_referencial === null ? null : Number(fila.horas_servicio_dia_referencial),
    activo: fila.activo,
  };
}

function datosAFila(datos: DatosCargoCatalogo) {
  return {
    cargo: datos.cargo.trim(),
    area: datos.area?.trim() || null,
    clasificacion: datos.clasificacion,
    turno_tipico: datos.turnoTipico,
    modo_sueldo_tipico: datos.modoSueldoTipico,
    base_referencial: datos.baseReferencial,
    liquido_referencial: datos.liquidoReferencial,
    bonos_default: datos.bonosDefault,
    asig_movilizacion_referencial: datos.asigMovilizacionReferencial,
    asig_colacion_referencial: datos.asigColacionReferencial,
    horas_servicio_dia_referencial: datos.horasServicioDiaReferencial,
  };
}

export async function listarCatalogoCargos(): Promise<CatalogoCargo[]> {
  const { data } = await supabaseAdmin
    .from("cotizador_catalogo_cargos")
    .select(COLUMNAS)
    .eq("activo", true)
    .order("cargo", { ascending: true });

  return ((data ?? []) as unknown as FilaCatalogoCargo[]).map(filaACargo);
}

export async function crearCargoCatalogo(datos: DatosCargoCatalogo): Promise<CatalogoCargo> {
  const { data, error } = await supabaseAdmin
    .from("cotizador_catalogo_cargos")
    .insert(datosAFila(datos))
    .select(COLUMNAS)
    .single();

  if (error) throw new Error(error.message);
  return filaACargo(data as unknown as FilaCatalogoCargo);
}

export async function actualizarCargoCatalogo(id: string, datos: DatosCargoCatalogo): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cotizador_catalogo_cargos")
    .update({ ...datosAFila(datos), actualizado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function desactivarCargoCatalogo(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cotizador_catalogo_cargos")
    .update({ activo: false, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}
