"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { descartarPrioridad, restaurarPrioridad, TablaSinCrear } from "@/lib/resumen-diario/prioridades";

const SLUG_APP = "mi-dia";

/**
 * Tachar o destachar una prioridad del día.
 *
 * El usuario sale del GUARD, nunca del cliente. Mandar el id de la persona desde
 * el navegador dejaría que cualquiera tachara prioridades ajenas con un fetch a
 * mano; acá el único id posible es el de quien tiene la sesión.
 *
 * Vive junto a su página y no en la carpeta de arriba por la misma razón que las
 * de Finanzas: una Server Action se empaqueta con la ruta que la importa.
 */
export async function alternarPrioridadAction(
  texto: string,
  hecha: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await exigirAccesoApp(SLUG_APP);

  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "La prioridad viene vacía." };
  // Tope de largo: el texto llega del cliente, y una prioridad son dos líneas.
  // Sin esto, un pegado de 100 KB entraría a la base tal cual.
  if (limpio.length > 600) return { ok: false, error: "La prioridad es demasiado larga." };

  try {
    if (hecha) await descartarPrioridad(usuario.id, limpio);
    else await restaurarPrioridad(usuario.id, limpio);
    // La página es un Server Component: sin esto la lista sigue mostrando lo
    // mismo hasta la próxima navegación.
    revalidatePath("/mi-dia");
    return { ok: true };
  } catch (error) {
    console.error("[mi-dia] No se pudo cambiar la prioridad:", error);
    // La falta de la tabla se dice con todas las letras: es lo único que esta
    // pantalla puede fallar sin que reintentar sirva de algo, y el mensaje tiene
    // que mandar a la persona al lugar correcto.
    if (error instanceof TablaSinCrear) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo guardar. Prueba de nuevo." };
  }
}
