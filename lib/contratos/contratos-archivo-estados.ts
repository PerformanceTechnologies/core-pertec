import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { olvidarDashboard } from "./memoria-dashboard";
import { esEstadoDeArchivo, type EstadoDeArchivo } from "./documento-estado";

const TABLA = "ct_contratos_archivo_estados";

export interface EstadoGuardadoDeArchivo {
  estado: EstadoDeArchivo;
  /** Quién lo cambió por última vez. */
  por: string | null;
  en: string;
}

/**
 * El estado de revisión de un conjunto de archivos, en una consulta.
 *
 * Un archivo que no aparece en el mapa está en Borrador: es lo que es todo archivo
 * recién subido, y por eso no se escribe nada al subir.
 *
 * NUNCA lanza: el estado de revisión es un dato de apoyo en una lista de archivos, y
 * si la tabla no existe todavía (migración sin correr) o Supabase no responde, la
 * lista tiene que seguir mostrándose —con todo en Borrador— en vez de tumbar la
 * pantalla donde se sube y se abre el documento.
 */
export async function estadosDeArchivos(
  itemIds: string[],
): Promise<Map<string, EstadoGuardadoDeArchivo>> {
  if (itemIds.length === 0) return new Map();

  // En tandas: los ids viajan en la URL de la consulta (`in.(...)`), y la lista de una
  // carpeta con decenas de requisitos y varios archivos cada uno puede pasar de los 8 KB
  // que algunos intermediarios aceptan. Cien ids son ~3,5 KB.
  const tandas: string[][] = [];
  for (let i = 0; i < itemIds.length; i += 100) tandas.push(itemIds.slice(i, i + 100));

  const respuestas = await Promise.all(
    tandas.map((ids) =>
      supabaseAdmin
        .from(TABLA)
        .select("item_id, estado, actualizado_por_nombre, actualizado_en")
        .in("item_id", ids),
    ),
  );

  const filas: Record<string, string | null>[] = [];
  for (const { data, error } of respuestas) {
    if (error) {
      console.error(
        `[contratos] No se pudo leer ${TABLA}. ¿Se corrió supabase/contratos/0001_contratos.sql? ` +
          `Los archivos se muestran como Borrador. Detalle: ${error.message}`,
      );
      return new Map();
    }
    filas.push(...((data ?? []) as Record<string, string | null>[]));
  }

  const salida = new Map<string, EstadoGuardadoDeArchivo>();
  for (const f of filas) {
    // Un valor que el check de la base no debería permitir se ignora, no se muestra.
    if (!esEstadoDeArchivo(f.estado)) continue;
    salida.set(f.item_id as string, {
      estado: f.estado,
      por: f.actualizado_por_nombre ?? null,
      en: f.actualizado_en as string,
    });
  }
  return salida;
}

export async function guardarEstadoDeArchivo(datos: {
  itemId: string;
  ruta: string;
  estado: EstadoDeArchivo;
  usuarioId: string;
  usuarioNombre: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).upsert(
    {
      item_id: datos.itemId,
      ruta: datos.ruta,
      estado: datos.estado,
      actualizado_por: datos.usuarioId,
      actualizado_por_nombre: datos.usuarioNombre,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "item_id" },
  );
  if (error) throw new Error(error.message);
  olvidarDashboard();
}
