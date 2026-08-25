import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ModuloOdoo =
  "facturas" | "contabilidad" | "crm" | "gastos" | "flota" | "proyectos" | "ventas" | "compras" | "bodega";

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
  mensajeError?: string,
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
  // Columnas explicitas: la tabla tiene mas de las que usa el indicador, y con
  // 50 filas por carga eso es payload que no se muestra. Ordenar por
  // ejecutado_en usa el indice panel_odoo_sync_ejecuciones_ejecutado_en_idx
  // (antes no existia y esto era un seq scan de la tabla completa: 11 ms, la
  // consulta mas lenta del panel, creciendo ~384 filas al dia).
  const { data } = await supabaseAdmin
    .from("panel_odoo_sync_ejecuciones")
    .select("modulo, ejecutado_en, exito, registros_sincronizados, mensaje_error")
    .order("ejecutado_en", { ascending: false })
    .limit(50);

  const filas = (data ?? []) as EjecucionOdoo[];
  const ultimaPorModulo: Record<ModuloOdoo, EjecucionOdoo | null> = {
    facturas: null,
    contabilidad: null,
    crm: null,
    gastos: null,
    flota: null,
    proyectos: null,
    ventas: null,
    compras: null,
    bodega: null,
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
