import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase-admin";
import {
  COOKIE_EMPRESA,
  empresasPermitidas,
  resolverEmpresaActiva,
  type Empresa,
} from "./empresas-modelo";

// -----------------------------------------------------------------------------
//  Multiempresa: la parte que toca la base y la cookie (solo servidor).
//
//  Las reglas —quién ve qué, cuál queda activa— viven en empresas-modelo.ts, sin
//  server-only, para que el selector del menú y las pruebas las usen igual.
// -----------------------------------------------------------------------------

function aEmpresa(r: Record<string, unknown>): Empresa {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    slug: r.slug as string,
    rut: (r.rut as string) ?? null,
    color: (r.color as string) ?? "naranjo",
    logo: (r.logo as string) ?? null,
    orden: Number(r.orden ?? 0),
    activa: r.activa !== false,
  };
}

export async function listarEmpresas(): Promise<Empresa[]> {
  const { data } = await supabaseAdmin
    .from("empresas")
    .select("*")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  return (data ?? []).map(aEmpresa);
}

/** Los ids de empresa asignados a una persona. */
export async function empresaIdsDeUsuario(usuarioId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("usuario_empresas")
    .select("empresa_id")
    .eq("usuario_id", usuarioId);
  return (data ?? []).map((r) => r.empresa_id as string);
}

/** Los ids de empresa de TODAS las personas de una vez (usuario_id → ids), para listarlas sin una consulta por fila. */
export async function empresaIdsPorUsuario(): Promise<Map<string, string[]>> {
  const { data } = await supabaseAdmin.from("usuario_empresas").select("usuario_id, empresa_id");
  const mapa = new Map<string, string[]>();
  for (const fila of data ?? []) {
    const id = fila.usuario_id as string;
    mapa.set(id, [...(mapa.get(id) ?? []), fila.empresa_id as string]);
  }
  return mapa;
}

/** Reemplaza las empresas de una persona. Mismo patrón que las aplicaciones. */
export async function reemplazarEmpresas(usuarioId: string, empresaIds: string[]): Promise<void> {
  // Agrega las nuevas y después quita las que sobran: nunca queda a medio camino sin empresas.
  const deseadas = [...new Set(empresaIds.filter(Boolean))];
  const { data, error: eLeer } = await supabaseAdmin.from("usuario_empresas").select("empresa_id").eq("usuario_id", usuarioId);
  if (eLeer) throw new Error(`No se pudieron leer sus empresas: ${eLeer.message}`);
  const tenia = new Set((data ?? []).map((r) => String(r.empresa_id)));
  const nuevas = deseadas.filter((e) => !tenia.has(e));
  if (nuevas.length) {
    const { error } = await supabaseAdmin.from("usuario_empresas").insert(nuevas.map((empresa_id) => ({ usuario_id: usuarioId, empresa_id })));
    if (error) throw new Error(`No se pudieron guardar sus empresas: ${error.message}`);
  }
  const sobran = [...tenia].filter((e) => !deseadas.includes(e));
  if (sobran.length) {
    const { error } = await supabaseAdmin.from("usuario_empresas").delete().eq("usuario_id", usuarioId).in("empresa_id", sobran);
    if (error) throw new Error(`No se pudieron quitar empresas: ${error.message}`);
  }
}

export interface ContextoDeEmpresa {
  activa: Empresa | null;
  permitidas: Empresa[];
}

/**
 * En qué empresa está parada esta persona, y entre cuáles puede moverse.
 *
 * Lo llama el layout protegido una vez por navegación y se lo pasa al menú. La
 * cookie es solo una preferencia: resolverEmpresaActiva la contrasta contra las
 * permitidas y descarta lo que no corresponda.
 */
// Con cache(): el layout, el Muro y otras páginas la piden en la misma carga; así se consulta una vez.
export const contextoDeEmpresa = cache(async function contextoDeEmpresa(
  usuarioId: string,
  rolDelCore: string,
): Promise<ContextoDeEmpresa> {
  const [todas, asignadas, galletas] = await Promise.all([
    listarEmpresas(),
    empresaIdsDeUsuario(usuarioId),
    cookies(),
  ]);

  const permitidas = empresasPermitidas(todas, asignadas, rolDelCore);
  const activa = resolverEmpresaActiva(galletas.get(COOKIE_EMPRESA)?.value, permitidas);
  return { activa, permitidas };
});
