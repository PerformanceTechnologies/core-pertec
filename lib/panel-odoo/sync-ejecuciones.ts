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

/**
 * Corre un sync y reintenta UNA vez si el error fue de reloj desfasado.
 *
 * "JWT issued at future" no lo dice Odoo: lo dice Supabase al recibir un token
 * cuyo instante de emisión le parece futuro, y eso pasa cuando el reloj del
 * contenedor donde corre la función va unos segundos adelantado respecto del suyo.
 * No es un problema de ningún módulo —le pegó a gastos, contabilidad y crm en el
 * mismo día, cuatro veces sobre 34 corridas— y a los segundos ya no ocurre.
 *
 * Sin esto, cada una de esas veces deja un job en rojo, un correo de GitHub y una
 * tarjeta con el dato de media hora antes. Y lo peor: entrena a no mirar los
 * correos, que es justo lo que no se quiere cuando un sync falle de verdad.
 *
 * Reintentar es seguro porque un sync es idempotente: escribe con upsert sobre la
 * misma clave, así que correrlo dos veces deja lo mismo que correrlo una. Se
 * reintenta SOLO ante este error y SOLO una vez: cualquier otra falla —Odoo caído,
 * un campo que no existe— tiene que seguir saliendo en rojo enseguida.
 */
const ERROR_DE_RELOJ = /jwt issued at future/i;

export async function sincronizarConReintento(sincronizar: () => Promise<number>): Promise<number> {
  try {
    return await sincronizar();
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    if (!ERROR_DE_RELOJ.test(mensaje)) throw error;

    console.warn("[panel-odoo] reloj desfasado con Supabase, reintentando una vez:", mensaje);
    await new Promise((listo) => setTimeout(listo, 2000));
    return await sincronizar();
  }
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
