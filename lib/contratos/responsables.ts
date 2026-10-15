import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { listarPersonasAsignables, type PersonaAsignable } from "./usuarios";

/**
 * A quién se le puede asignar algo: gente del core, y contrapartes de fuera.
 *
 * Las dos cosas en una sola lista porque desde el formulario son la misma
 * pregunta —«¿de quién depende esto?»— pero se guardan en columnas distintas, y
 * eso importa: un requisito que espera a CODELCO no es trabajo pendiente de
 * nadie acá dentro, y Mi Día no debe contarlo como «tuyo».
 */

export interface ResponsableExterno {
  id: string;
  nombre: string;
}

export interface Responsables {
  internos: PersonaAsignable[];
  externos: ResponsableExterno[];
}

export async function listarResponsables(): Promise<Responsables> {
  const [internos, { data }] = await Promise.all([
    listarPersonasAsignables(),
    supabaseAdmin
      .from("ct_responsables_externos")
      .select("id, nombre")
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true }),
  ]);

  return {
    internos,
    externos: ((data ?? []) as { id: string; nombre: string }[]).map((e) => ({
      id: e.id,
      nombre: e.nombre,
    })),
  };
}

/**
 * Qué columna toca, a partir del valor que llegó del desplegable.
 *
 * El valor viene del navegador, así que se comprueba contra las listas reales en
 * vez de confiar en él: una acción es un endpoint, y una clave foránea inventada
 * daría un error de Postgres en vez de un motivo entendible.
 */
export async function resolverResponsable(
  valor: string | null,
): Promise<{ responsableId: string | null; responsableExternoId: string | null }> {
  if (!valor) return { responsableId: null, responsableExternoId: null };

  const { internos, externos } = await listarResponsables();
  if (internos.some((p) => p.id === valor)) {
    return { responsableId: valor, responsableExternoId: null };
  }
  if (externos.some((e) => e.id === valor)) {
    return { responsableId: null, responsableExternoId: valor };
  }
  throw new Error("Ese responsable ya no está disponible.");
}
