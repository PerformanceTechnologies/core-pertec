import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Retención: lo que el core acumula y nadie borra.
 *
 * Tres cosas crecían para siempre:
 *
 *  - `panel_odoo_sync_ejecuciones`, a razón de ~384 filas al día (8 módulos cada
 *    30 minutos). El panel solo usa la última corrida de cada módulo.
 *  - `resumen_diario`, una fila por persona por día, con el resumen completo
 *    guardado en jsonb.
 *  - El bucket `rendiciones-respaldos`, donde queda el archivo cuando alguien
 *    quita un gasto de una rendición o cuando el borrado de una rendición no
 *    alcanza a limpiar sus respaldos (ese caso está previsto y solo se loguea,
 *    ver borrarRespaldosDeRendicion).
 *
 * TODO lo de acá borra, así que cada función tiene su tope y su ventana de
 * gracia, y `simular` permite ver qué se iría sin tocar nada.
 */

const BUCKET_RESPALDOS = "rendiciones-respaldos";

/** Historial de sincronizaciones: 30 días, con piso de 20 corridas por módulo. */
const DIAS_SYNC = 30;
const MINIMO_POR_MODULO = 20;

/** Resúmenes diarios: tres meses. Mi Día solo muestra el de hoy. */
const DIAS_RESUMENES = 90;

/**
 * Un respaldo tiene que estar sin referencia Y tener más de esto para borrarse.
 *
 * La ventana existe por una carrera concreta: el archivo se sube al bucket antes
 * de que la rendición se guarde con su ruta, así que un archivo recién subido
 * está legítimamente sin referencia por unos segundos. Siete días es holgado de
 * sobra y no cuesta nada.
 */
const DIAS_GRACIA_RESPALDOS = 7;

/** Tope por corrida. Un error de lógica no puede vaciar el bucket de una vez. */
const TOPE_RESPALDOS = 200;

export interface ResultadoLimpieza {
  simulado: boolean;
  sincronizaciones: number;
  resumenes: number;
  respaldos: { borrados: number; bytes: number; rutas: string[] };
}

export async function limpiar(simular = false): Promise<ResultadoLimpieza> {
  const [sincronizaciones, resumenes, respaldos] = await Promise.all([
    limpiarSincronizaciones(simular),
    limpiarResumenes(simular),
    limpiarRespaldosHuerfanos(simular),
  ]);
  return { simulado: simular, sincronizaciones, resumenes, respaldos };
}

/**
 * El borrado vive en una función de Postgres (limpiar_sync_ejecuciones) porque la
 * regla no se puede expresar desde PostgREST: hay que conservar las últimas N de
 * CADA módulo, y eso es un row_number() por partición.
 */
async function limpiarSincronizaciones(simular: boolean): Promise<number> {
  if (simular) {
    const { count } = await supabaseAdmin
      .from("panel_odoo_sync_ejecuciones")
      .select("id", { count: "exact", head: true })
      .lt("ejecutado_en", haceDias(DIAS_SYNC));
    // Sobreestima: no descuenta el piso por módulo, que solo sabe la función.
    return count ?? 0;
  }

  const { data, error } = await supabaseAdmin.rpc("limpiar_sync_ejecuciones", {
    dias: DIAS_SYNC,
    minimo_por_modulo: MINIMO_POR_MODULO,
  });
  if (error) throw new Error(`limpiar_sync_ejecuciones: ${error.message}`);
  return (data as number | null) ?? 0;
}

async function limpiarResumenes(simular: boolean): Promise<number> {
  const limite = haceDias(DIAS_RESUMENES).slice(0, 10);

  if (simular) {
    const { count } = await supabaseAdmin
      .from("resumen_diario")
      .select("id", { count: "exact", head: true })
      .lt("fecha", limite);
    return count ?? 0;
  }

  const { data, error } = await supabaseAdmin
    .from("resumen_diario")
    .delete()
    .lt("fecha", limite)
    .select("id");
  if (error) throw new Error(`resumen_diario: ${error.message}`);
  return (data ?? []).length;
}

/**
 * Respaldos del bucket que ya no cuelgan de ningún gasto.
 *
 * La referencia es `archivoPath` dentro del jsonb `rendiciones.gastos`. Se arma
 * el conjunto completo de rutas referenciadas ANTES de mirar el bucket: si esa
 * consulta falla, no se borra nada, porque un conjunto vacío por error haría
 * pasar por huérfano a todo el bucket.
 */
async function limpiarRespaldosHuerfanos(
  simular: boolean,
): Promise<{ borrados: number; bytes: number; rutas: string[] }> {
  const vacio = { borrados: 0, bytes: 0, rutas: [] as string[] };

  const { data: rendiciones, error } = await supabaseAdmin.from("rendiciones").select("id, gastos");
  if (error) throw new Error(`rendiciones: ${error.message}`);

  const referenciadas = new Set<string>();
  for (const fila of rendiciones ?? []) {
    for (const gasto of (fila.gastos ?? []) as { archivoPath?: string | null }[]) {
      if (gasto?.archivoPath) referenciadas.add(gasto.archivoPath);
    }
  }

  // Las carpetas del bucket son un id de rendición cada una.
  const { data: carpetas, error: errorRaiz } = await supabaseAdmin.storage.from(BUCKET_RESPALDOS).list("");
  if (errorRaiz) throw new Error(`bucket raíz: ${errorRaiz.message}`);

  const limite = Date.now() - DIAS_GRACIA_RESPALDOS * 24 * 60 * 60 * 1000;
  const huerfanos: { ruta: string; bytes: number }[] = [];

  for (const carpeta of carpetas ?? []) {
    // list() devuelve carpetas sin id; un archivo suelto en la raíz no lo es.
    if (carpeta.id !== null) continue;

    const { data: archivos, error: errorCarpeta } = await supabaseAdmin.storage
      .from(BUCKET_RESPALDOS)
      .list(carpeta.name);
    if (errorCarpeta) {
      console.error(`[limpieza] No se pudo listar ${carpeta.name}:`, errorCarpeta.message);
      continue;
    }

    for (const archivo of archivos ?? []) {
      const ruta = `${carpeta.name}/${archivo.name}`;
      if (referenciadas.has(ruta)) continue;

      const creado = archivo.created_at ? new Date(archivo.created_at).getTime() : Date.now();
      if (creado > limite) continue;

      huerfanos.push({ ruta, bytes: Number(archivo.metadata?.size ?? 0) });
    }
  }

  if (huerfanos.length === 0) return vacio;

  const aBorrar = huerfanos.slice(0, TOPE_RESPALDOS);
  const bytes = aBorrar.reduce((total, a) => total + a.bytes, 0);
  const rutas = aBorrar.map((a) => a.ruta);

  if (huerfanos.length > TOPE_RESPALDOS) {
    console.warn(
      `[limpieza] ${huerfanos.length} respaldos huérfanos, se borran ${TOPE_RESPALDOS} en esta corrida.`,
    );
  }

  if (simular) return { borrados: 0, bytes, rutas };

  // Se loguea qué se borra ANTES de borrarlo: son documentos tributarios y el
  // log es lo único que queda si alguna vez hay que explicar una ausencia.
  console.warn(`[limpieza] Borrando ${rutas.length} respaldos huérfanos: ${rutas.join(", ")}`);

  const { error: errorBorrado } = await supabaseAdmin.storage.from(BUCKET_RESPALDOS).remove(rutas);
  if (errorBorrado) throw new Error(`bucket remove: ${errorBorrado.message}`);

  return { borrados: rutas.length, bytes, rutas };
}

function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}
