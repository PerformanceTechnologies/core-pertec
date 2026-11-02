import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Retención: lo que el core acumula y nadie borra.
 *
 * Dos cosas crecen para siempre:
 *
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
  resumenes: number;
  respaldos: { borrados: number; bytes: number; rutas: string[] };
}

export async function limpiar(simular = false): Promise<ResultadoLimpieza> {
  const [resumenes, respaldos] = await Promise.all([
    limpiarResumenes(simular),
    limpiarRespaldosHuerfanos(simular),
  ]);
  return { simulado: simular, resumenes, respaldos };
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
