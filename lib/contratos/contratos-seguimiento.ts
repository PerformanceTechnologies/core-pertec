import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { olvidarDashboard } from "./memoria-dashboard";
import type { EstadoRequisito } from "./contratos-estado";

const TABLA = "ct_contratos_estados";

export interface EstadoGuardado {
  itemId: string;
  ruta: string;
  estado: EstadoRequisito;
  nota: string | null;
  /** Quién responde por este requisito. Null mientras nadie lo asigne. */
  responsableId: string | null;
  /** O la contraparte, si lo que falta depende de afuera. Nunca los dos a la vez. */
  responsableExternoId: string | null;
  actualizadoEn: string;
}

/**
 * Los estados de un conjunto de carpetas, por id de SharePoint.
 *
 * De a muchos y no de a uno: una tarjeta necesita el estado de todas las hojas
 * que cuelgan de ella, y pedirlos por separado sería una consulta por requisito.
 */
export async function estadosDe(itemIds: string[]): Promise<Map<string, EstadoGuardado>> {
  if (itemIds.length === 0) return new Map();

  const { data } = await supabaseAdmin.from(TABLA).select("*").in("item_id", itemIds);

  return new Map(
    ((data ?? []) as Record<string, string>[]).map((fila) => [
      fila.item_id,
      {
        itemId: fila.item_id,
        ruta: fila.ruta,
        estado: fila.estado as EstadoRequisito,
        nota: fila.nota ?? null,
        responsableId: fila.responsable_id ?? null,
        responsableExternoId: fila.responsable_externo_id ?? null,
        actualizadoEn: fila.actualizado_en,
      },
    ]),
  );
}

export async function guardarEstado(datos: {
  itemId: string;
  ruta: string;
  estado: EstadoRequisito;
  /**
   * Omitir para dejar la nota como está.
   *
   * Antes el parámetro era obligatorio y todos los llamadores pasaban null, así
   * que cada cambio de estado borraba la nota. Hoy nadie escribe notas y por eso
   * no se notaba: era un defecto esperando a que alguien usara la columna.
   */
  nota?: string | null;
  usuarioId: string;
}): Promise<void> {
  const fila: Record<string, unknown> = {
    item_id: datos.itemId,
    ruta: datos.ruta,
    estado: datos.estado,
    actualizado_por: datos.usuarioId,
    actualizado_en: new Date().toISOString(),
  };
  if (datos.nota !== undefined) fila.nota = datos.nota?.trim() || null;

  const { error } = await supabaseAdmin.from(TABLA).upsert(fila, { onConflict: "item_id" });
  if (error) throw new Error(error.message);
  olvidarDashboard();
}

/**
 * Asigna —o quita— el responsable de un requisito.
 *
 * Es un upsert y no un update porque un requisito al que nadie le ha tocado el
 * estado todavía no tiene fila: con update, asignarle responsable antes de
 * marcarlo no habría guardado nada y tampoco habría fallado.
 *
 * No toca `estado` ni `nota`: la fila puede existir ya con un estado puesto, y
 * asignar a alguien no es motivo para moverlo.
 */
export async function guardarResponsable(datos: {
  itemId: string;
  ruta: string;
  responsableId: string | null;
  responsableExternoId: string | null;
  usuarioId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).upsert(
    {
      item_id: datos.itemId,
      ruta: datos.ruta,
      responsable_id: datos.responsableId,
      responsable_externo_id: datos.responsableExternoId,
      actualizado_por: datos.usuarioId,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "item_id" },
  );
  if (error) throw new Error(error.message);
}
