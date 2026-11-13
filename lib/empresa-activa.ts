import "server-only";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { contextoDeEmpresa } from "@/lib/empresas";

/**
 * El id de la empresa en la que está parada la persona (la del selector de arriba). Los módulos
 * separados por empresa lo usan para guardar y para filtrar. null sin sesión (crons).
 */
export async function empresaActivaId(): Promise<string | null> {
  const correo = (await auth())?.user?.email;
  const u = correo ? await obtenerUsuarioActivo(correo) : null;
  if (!u) return null;
  return (await contextoDeEmpresa(u.id, u.rol)).activa?.id ?? null;
}

/**
 * Filtra una consulta de Supabase por empresa. OJO: es síncrona a propósito (un builder de Supabase es
 * «thenable» y una función async lo ejecutaría). Uso: `soloDe(supabaseAdmin.from("x").select("*"), await empresaActivaId())`.
 */
export function soloDe<Q>(q: Q, empresaId: string | null): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return empresaId ? ((q as any).eq("empresa_id", empresaId) as Q) : q;
}

/** Lo que se agrega al insertar una fila principal: su empresa (sin sesión queda la por omisión de la base). */
export async function conEmpresa<T extends Record<string, unknown>>(fila: T): Promise<T & { empresa_id?: string }> {
  const id = await empresaActivaId();
  return id ? { ...fila, empresa_id: id } : fila;
}
