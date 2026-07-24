import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ModuloOdoo = "facturas" | "contabilidad" | "crm" | "gastos";

export interface EjecucionOdoo {
  modulo: ModuloOdoo;
  ejecutado_en: string;
  exito: boolean;
  registros_sincronizados: number;
  mensaje_error: string | null;
}

export async function registrarEjecucionOdoo(
  modulo: ModuloOdoo,
  exito: boolean,
  registrosSincronizados: number,
  mensajeError?: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("panel_odoo_sync_ejecuciones").insert({
    modulo,
    exito,
    registros_sincronizados: registrosSincronizados,
    mensaje_error: mensajeError ?? null,
  });
  if (error) throw new Error(error.message);
}

// Para el indicador "hace X min" de cada tarjeta: la ultima ejecucion (exitosa
// o no) de cada modulo.
export async function obtenerUltimasEjecuciones(): Promise<Record<ModuloOdoo, EjecucionOdoo | null>> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_sync_ejecuciones")
    .select("*")
    .order("ejecutado_en", { ascending: false })
    .limit(50);

  const filas = (data ?? []) as EjecucionOdoo[];
  const ultimaPorModulo: Record<ModuloOdoo, EjecucionOdoo | null> = {
    facturas: null,
    contabilidad: null,
    crm: null,
    gastos: null,
  };
  for (const fila of filas) {
    if (!ultimaPorModulo[fila.modulo]) ultimaPorModulo[fila.modulo] = fila;
  }
  return ultimaPorModulo;
}

// Para decidir si alertar por correo: si la corrida anterior de este modulo
// tambien fallo (evita ~48 correos/dia con cadencia de 30 min; ver plan).
export async function fallaronLasUltimasDos(modulo: ModuloOdoo): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_sync_ejecuciones")
    .select("exito")
    .eq("modulo", modulo)
    .order("ejecutado_en", { ascending: false })
    .limit(1);

  return data?.[0]?.exito === false;
}
