import "server-only";
import { supabaseAdmin } from "../supabase-admin";

// Plantillas de «Condiciones generales» de las cotizaciones, por empresa (supabase/fin/0020_plantillas_condiciones.sql).

export interface PlantillaCondiciones {
  id: string;
  nombre: string;
  texto: string;
  creadoPor: string;
}

const FALTA_SQL = "Falta correr el SQL supabase/fin/0020_plantillas_condiciones.sql.";

/** Las plantillas de la empresa, por nombre. Sin la tabla (SQL sin correr), lista vacía: el editor funciona igual. */
export async function plantillasDeCondiciones(empresaId: string): Promise<PlantillaCondiciones[]> {
  const { data, error } = await supabaseAdmin.from("fin_plantillas_condiciones").select("id, nombre, texto, creado_por").eq("empresa_id", empresaId).order("nombre");
  if (error) return [];
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, texto: p.texto as string, creadoPor: p.creado_por as string }));
}

export async function crearPlantillaCondiciones(empresaId: string, nombre: string, texto: string, creadoPor: string): Promise<PlantillaCondiciones> {
  const { data, error } = await supabaseAdmin
    .from("fin_plantillas_condiciones")
    .insert({ empresa_id: empresaId, nombre, texto, creado_por: creadoPor })
    .select("id, nombre, texto, creado_por")
    .single();
  if (error) throw new Error(/fin_plantillas_condiciones/.test(error.message) ? FALTA_SQL : error.message);
  return { id: data.id, nombre: data.nombre, texto: data.texto, creadoPor: data.creado_por };
}

/** Borra una plantilla de la empresa. Solo quien la creó o un administrador (lo decide quien llama). */
export async function borrarPlantillaCondiciones(empresaId: string, id: string): Promise<{ creadoPor: string } | null> {
  const { data } = await supabaseAdmin.from("fin_plantillas_condiciones").select("creado_por").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  if (!data) return null;
  const { error } = await supabaseAdmin.from("fin_plantillas_condiciones").delete().eq("id", id).eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);
  return { creadoPor: data.creado_por as string };
}

/** Quién creó una plantilla (para decidir si se puede borrar), o null si no es de la empresa. */
export async function autorDePlantilla(empresaId: string, id: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("fin_plantillas_condiciones").select("creado_por").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  return (data?.creado_por as string | undefined) ?? null;
}
