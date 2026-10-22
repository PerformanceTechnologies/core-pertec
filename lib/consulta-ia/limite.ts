import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Topes por persona: por minuto (ráfagas) y por día (gasto). */
const LIMITE_POR_MINUTO = 12;
const LIMITE_POR_DIA = 200;

export interface ResultadoLimite {
  permitido: boolean;
  motivo?: string;
}

/**
 * Revisa el límite de uso del buscador IA y, si hay cupo, registra esta consulta.
 *
 * Cuenta contra la base (no en memoria), así el tope es el mismo en todas las instancias. Si la
 * tabla no existe aún o la base falla, DEJA pasar: el límite protege el costo, no es el control de
 * acceso (eso está en las herramientas) y no puede dejar el buscador caído.
 */
export async function verificarYRegistrarUso(usuarioId: string): Promise<ResultadoLimite> {
  const ahora = Date.now();
  const haceUnMinuto = new Date(ahora - 60_000).toISOString();
  const haceUnDia = new Date(ahora - 24 * 60 * 60 * 1000).toISOString();

  try {
    const [{ count: enMinuto }, { count: enDia }] = await Promise.all([
      supabaseAdmin
        .from("consulta_ia_usos")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", usuarioId)
        .gte("creado_en", haceUnMinuto),
      supabaseAdmin
        .from("consulta_ia_usos")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", usuarioId)
        .gte("creado_en", haceUnDia),
    ]);

    if ((enMinuto ?? 0) >= LIMITE_POR_MINUTO) {
      return { permitido: false, motivo: "Demasiadas consultas seguidas. Esperá un momento e intentá de nuevo." };
    }
    if ((enDia ?? 0) >= LIMITE_POR_DIA) {
      return { permitido: false, motivo: "Llegaste al máximo de consultas por hoy. Volvé a intentar mañana." };
    }

    await supabaseAdmin.from("consulta_ia_usos").insert({ usuario_id: usuarioId });

    // Limpieza oportunista: de vez en cuando se borran los registros de más de 2 días.
    if (Math.random() < 0.02) {
      const hace2Dias = new Date(ahora - 2 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from("consulta_ia_usos").delete().lt("creado_en", hace2Dias);
    }

    return { permitido: true };
  } catch (e) {
    console.error("[consulta-ia] no se pudo verificar el límite de uso:", e);
    return { permitido: true };
  }
}
