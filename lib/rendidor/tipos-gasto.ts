import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { TipoGastoGrupo } from "./tipos";

/**
 * La lista maestra de gastos de Finanzas de una empresa (solo categorías de gasto activas, con sus subcategorías),
 * para clasificar cada boleta. Vacía si la empresa no tiene la lista (migración fin/0014) o si algo falla: Rendir gastos
 * sigue funcionando sin ella.
 */
export async function tiposGastoDeEmpresa(empresaId: string | null): Promise<TipoGastoGrupo[]> {
  if (!empresaId) return [];
  const [cR, sR] = await Promise.all([
    supabaseAdmin.from("fin_categorias").select("id, nombre, sentido, orden, activa").eq("empresa_id", empresaId).eq("activa", true).eq("sentido", "egreso").order("orden"),
    supabaseAdmin.from("fin_subcategorias").select("id, categoria_id, nombre, orden, activa").eq("empresa_id", empresaId).eq("activa", true).order("orden"),
  ]);
  if (cR.error || sR.error) {
    console.warn("[rendidor] lista de Finanzas:", cR.error?.message ?? sR.error?.message);
    return [];
  }
  const subs = (sR.data ?? []) as { id: string; categoria_id: string; nombre: string }[];
  return ((cR.data ?? []) as { id: string; nombre: string }[])
    .map((c) => ({ categoriaId: c.id, categoria: c.nombre, opciones: subs.filter((s) => s.categoria_id === c.id).map((s) => ({ id: s.id, nombre: s.nombre })) }))
    .filter((g) => g.opciones.length > 0);
}
