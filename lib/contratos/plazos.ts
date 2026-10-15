import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import { olvidarDashboard } from "./memoria-dashboard";
import type { ModuloConPlazo } from "./plazos-modelo";

const TABLA = "ct_contratos_plazos";

export type PlazosGuardados = Partial<Record<ModuloConPlazo, string>>;

/**
 * Las fechas límite de todos los submódulos, en UNA consulta.
 *
 * Envuelta en cache() de React: la portada de Contrato DCH pinta cuatro tarjetas y cada una
 * quiere su fecha. Con esto las cuatro comparten la misma consulta dentro de una petición, en
 * vez de pedir una cada una.
 *
 * NUNCA lanza: la fecha es un adorno de la tarjeta, y si la tabla no existe todavía
 * (migración 0017 sin correr) o Supabase no responde, la portada tiene que seguir mostrando
 * sus tarjetas, solo que sin fecha.
 */
export const listarPlazos = cache(async function listarPlazos(): Promise<PlazosGuardados> {
  const { data, error } = await supabaseAdmin.from(TABLA).select("modulo, fecha_limite");
  if (error) {
    console.error(
      `[plazos] No se pudo leer ${TABLA}. ¿Se corrió supabase/contratos/0001_contratos.sql? Detalle: ${error.message}`,
    );
    return {};
  }
  const salida: PlazosGuardados = {};
  for (const f of (data ?? []) as { modulo: ModuloConPlazo; fecha_limite: string }[]) {
    salida[f.modulo] = f.fecha_limite;
  }
  return salida;
});

/** Fija la fecha límite de un submódulo, o la quita (con `null`). */
export async function guardarPlazo(datos: {
  modulo: ModuloConPlazo;
  fecha: string | null;
  usuarioId: string;
  usuarioNombre: string;
}): Promise<void> {
  if (datos.fecha === null) {
    const { error } = await supabaseAdmin.from(TABLA).delete().eq("modulo", datos.modulo);
    if (error) throw new Error(error.message);
    olvidarDashboard();
    return;
  }

  const { error } = await supabaseAdmin.from(TABLA).upsert(
    {
      modulo: datos.modulo,
      fecha_limite: datos.fecha,
      actualizado_por: datos.usuarioId,
      actualizado_por_nombre: datos.usuarioNombre,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "contrato_id,modulo" },
  );
  if (error) throw new Error(error.message);
  olvidarDashboard();
}
