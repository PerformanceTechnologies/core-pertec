import "server-only";
import { supabaseAdmin } from "./supabase-admin";

const TABLA = "ct_contratos_comentarios";

export interface Comentario {
  itemId: string;
  comentario: string;
  autor: string;
  creadoEn: string;
}

/** Los comentarios de un conjunto de archivos, en una consulta. */
export async function comentariosDe(itemIds: string[]): Promise<Map<string, Comentario>> {
  if (itemIds.length === 0) return new Map();

  const { data } = await supabaseAdmin.from(TABLA).select("*").in("item_id", itemIds);

  return new Map(
    ((data ?? []) as Record<string, string>[]).map((fila) => [
      fila.item_id,
      {
        itemId: fila.item_id,
        comentario: fila.comentario,
        autor: fila.autor_nombre,
        creadoEn: fila.creado_en,
      },
    ]),
  );
}

export async function guardarComentario(datos: {
  itemId: string;
  ruta: string;
  comentario: string;
  autorId: string;
  autorNombre: string;
}): Promise<void> {
  const texto = datos.comentario.trim();
  if (!texto) return;

  const { error } = await supabaseAdmin.from(TABLA).upsert(
    {
      item_id: datos.itemId,
      ruta: datos.ruta,
      comentario: texto,
      autor_id: datos.autorId,
      autor_nombre: datos.autorNombre,
    },
    { onConflict: "item_id" },
  );

  if (error) throw new Error(error.message);
}

/**
 * Borra el comentario de un archivo que ya no existe.
 *
 * Si no se borrara, el comentario quedaría colgado de un item_id que SharePoint
 * ya no reconoce — invisible, pero ocupando sitio y listo para reaparecer el día
 * que SharePoint reutilice un identificador.
 */
export async function olvidarComentario(itemId: string): Promise<void> {
  await supabaseAdmin.from(TABLA).delete().eq("item_id", itemId);
}
