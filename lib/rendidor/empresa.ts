import "server-only";
import { contextoDeEmpresa } from "@/lib/empresas";
import { SLUG_POR_OMISION } from "@/lib/empresas-modelo";

/**
 * La empresa con que se está trabajando. Rendir Gastos es independiente por empresa: fondos, informes,
 * gastos sueltos, alertas y roles se ven y se resuelven solo dentro de la activa. Los registros antiguos
 * (sin empresa) son de PERTEC, la empresa por omisión.
 */
export interface EmpresaRG {
  id: string;
  porOmision: boolean;
}

export async function empresaActivaRG(usuario: { id: string; rol: string }): Promise<EmpresaRG | null> {
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  return activa ? { id: activa.id, porOmision: activa.slug === SLUG_POR_OMISION } : null;
}

/** ¿Este registro (con su empresa_id, o null si es antiguo) es de la empresa activa? */
export const enEmpresaRG = (empresaId: string | null | undefined, e: EmpresaRG): boolean => (empresaId ? empresaId === e.id : e.porOmision);

/** El filtro de consulta equivalente: la empresa, y —solo en PERTEC— también lo antiguo sin empresa. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function filtrarPorEmpresaRG<Q>(q: Q, e: EmpresaRG): Q {
  const c = q as any;
  return (e.porOmision ? c.or(`empresa_id.eq.${e.id},empresa_id.is.null`) : c.eq("empresa_id", e.id)) as Q;
}
