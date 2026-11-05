import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { SUBPANELES_FINANZAS } from "./finanzas-subpaneles";

// Patron de checkbox: sin marcar ninguno = ve todos, marcar alguno =
// restringe a solo esos -- CON UNA EXCEPCION: "facturas-ih" es informacion
// tributaria sensible de ambas empresas, asi que para ese slug puntual
// "sin fila" significa SIN ACCESO, no "ve todo".
const SLUGS_DENEGADOS_POR_DEFECTO = new Set(["facturas-ih"]);

// Filas guardadas tal cual, sin default -- lo usa el formulario de admin
// para saber que checkboxes marcar.
export async function obtenerSubpanelesFinanzasGuardados(usuarioId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("usuario_finanzas_subpanel_acceso")
    .select("subpanel_slug")
    .eq("usuario_id", usuarioId);
  return (data ?? []).map((fila) => fila.subpanel_slug as string);
}

// Efecto real: si el slug esta explicitamente guardado, acceso concedido. Si
// no, depende del default del slug (ver SLUGS_DENEGADOS_POR_DEFECTO).
export function subpanelFinanzasPermitido(slug: string, guardados: string[]): boolean {
  if (guardados.includes(slug)) return true;
  if (SLUGS_DENEGADOS_POR_DEFECTO.has(slug)) return false;
  return guardados.length === 0;
}

export async function usuarioPuedeVerSubpanelFinanzas(usuarioId: string, slug: string): Promise<boolean> {
  const guardados = await obtenerSubpanelesFinanzasGuardados(usuarioId);
  return subpanelFinanzasPermitido(slug, guardados);
}

// Reemplazo completo (borra todo y reinserta), igual que reemplazarModulosOdoo.
/** Deja exactamente estos subpaneles: agrega los nuevos y después quita los que sobran (nunca pasa por «ninguno»). */
export async function reemplazarSubpanelesFinanzas(usuarioId: string, slugs: string[]): Promise<void> {
  const deseados = [...new Set(slugs.filter((s) => SUBPANELES_FINANZAS.some((sp) => sp.slug === s)))];
  const { data, error: eLeer } = await supabaseAdmin.from("usuario_finanzas_subpanel_acceso").select("subpanel_slug").eq("usuario_id", usuarioId);
  if (eLeer) throw new Error(`No se pudieron leer sus subpaneles de Finanzas: ${eLeer.message}`);
  const tenia = new Set((data ?? []).map((r) => String(r.subpanel_slug)));
  const nuevos = deseados.filter((s) => !tenia.has(s));
  if (nuevos.length) {
    const { error } = await supabaseAdmin
      .from("usuario_finanzas_subpanel_acceso")
      .insert(nuevos.map((subpanel_slug) => ({ usuario_id: usuarioId, subpanel_slug })));
    if (error) throw new Error(`No se pudieron guardar los subpaneles de Finanzas (${nuevos.join(", ")}): ${error.message}`);
  }
  const sobran = [...tenia].filter((s) => !deseados.includes(s));
  if (sobran.length) {
    const { error } = await supabaseAdmin.from("usuario_finanzas_subpanel_acceso").delete().eq("usuario_id", usuarioId).in("subpanel_slug", sobran);
    if (error) throw new Error(`No se pudieron quitar subpaneles de Finanzas: ${error.message}`);
  }
}
