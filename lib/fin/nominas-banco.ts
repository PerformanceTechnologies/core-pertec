import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { NominaBanco } from "./nominas-modelo";

// -----------------------------------------------------------------------------
//  Lee de la base las nóminas del banco guardadas por el cron (lib/fin/banco-emisso.ts), con sus pagos y el cargo de
//  Tesorería al que quedaron ligadas. Solo lectura. Contiene nombre y RUT de beneficiarios: quien la llame decide qué
//  de eso llega a la pantalla (en Remuneraciones, nada de eso sale de acá sin pasar por validarMes y su resumen).
// -----------------------------------------------------------------------------

type FilaNomina = {
  id: string;
  id_nomina: string;
  fecha_pago: string | null;
  fecha_creacion: string;
  descripcion: string | null;
  estado: string;
  moneda: string;
  monto: number | string;
  movimiento_id: string | null;
};
type FilaLinea = { nomina_id: string; id_linea: string; beneficiario: string | null; beneficiario_rut: string; monto: number | string; moneda: string; estado: string };

/** Los ids se piden en lotes: una URL con cientos de uuid se pasa del largo que acepta el servidor. */
async function enLotes<T, R>(items: T[], tamano: number, f: (lote: T[]) => Promise<R[]>): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < items.length; i += tamano) salida.push(...(await f(items.slice(i, i + tamano))));
  return salida;
}

/**
 * Las nóminas creadas desde `desde` (AAAA-MM-DD), de la más nueva a la más vieja. Si falta la tabla (la migración
 * 0013 no se corrió) o la lectura falla, devuelve [] y lo deja en el log: Remuneraciones sigue funcionando sin la
 * validación, que en ese caso se muestra como «Sin datos».
 */
export async function cargarNominasBanco(empresaId: string, desde: string): Promise<NominaBanco[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("fin_banco_nominas")
      .select("id, id_nomina, fecha_pago, fecha_creacion, descripcion, estado, moneda, monto, movimiento_id")
      .eq("empresa_id", empresaId)
      .gte("fecha_creacion", desde)
      .order("fecha_creacion", { ascending: false });
    if (error) throw new Error(error.message);
    const nominas = (data ?? []) as FilaNomina[];
    if (nominas.length === 0) return [];

    const lineas = await enLotes(nominas.map((n) => n.id), 100, async (ids) => {
      const { data: l, error: e } = await supabaseAdmin
        .from("fin_banco_nomina_lineas")
        .select("nomina_id, id_linea, beneficiario, beneficiario_rut, monto, moneda, estado")
        .eq("empresa_id", empresaId)
        .in("nomina_id", ids);
      if (e) throw new Error(e.message);
      return (l ?? []) as FilaLinea[];
    });
    const movIds = [...new Set(nominas.map((n) => n.movimiento_id).filter((x): x is string => Boolean(x)))];
    const movimientos = await enLotes(movIds, 100, async (ids) => {
      const { data: m, error: e } = await supabaseAdmin.from("fin_movimientos").select("id, fecha, glosa, monto").eq("empresa_id", empresaId).in("id", ids);
      if (e) throw new Error(e.message);
      return (m ?? []) as { id: string; fecha: string; glosa: string; monto: number | string }[];
    });
    const movDe = new Map(movimientos.map((m) => [m.id, m]));

    return nominas.map((n) => {
      const m = n.movimiento_id ? movDe.get(n.movimiento_id) : undefined;
      return {
        idNomina: n.id_nomina,
        fechaPago: n.fecha_pago,
        fechaCreacion: n.fecha_creacion,
        descripcion: n.descripcion,
        estado: n.estado,
        moneda: n.moneda,
        monto: Number(n.monto),
        movimientoId: n.movimiento_id,
        movimiento: m ? { fecha: m.fecha, glosa: m.glosa, monto: Number(m.monto) } : null,
        lineas: lineas
          .filter((l) => l.nomina_id === n.id)
          .map((l) => ({ idLinea: l.id_linea, rut: l.beneficiario_rut, nombre: l.beneficiario, monto: Number(l.monto), moneda: l.moneda, estado: l.estado })),
      };
    });
  } catch (e) {
    console.error(`[nominas-banco] no se pudieron leer las nóminas: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
