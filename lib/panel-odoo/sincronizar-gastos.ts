import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooSearchRead } from "./odoo-cliente";
import { obtenerCompania } from "./companias";

type TuplaOdoo = [number, string] | false;
function nombreDeTupla(t: TuplaOdoo): string | null {
  return Array.isArray(t) ? t[1] : null;
}
function idDeTupla(t: TuplaOdoo): number | null {
  return Array.isArray(t) ? t[0] : null;
}

interface GastoOdoo {
  id: number;
  name: string;
  employee_id: TuplaOdoo;
  total_amount: number;
  state: string;
  payment_mode: string | false;
  date: string | false;
  company_id: TuplaOdoo;
}

// Se cachean todos menos los rechazados -- state se guarda tal cual, el
// filtro de KPI (ej. excluir borrador) se aplica al leer, no al sincronizar.
export async function sincronizarGastos(): Promise<number> {
  const gastos = await odooSearchRead<GastoOdoo>(
    "hr.expense",
    [["state", "!=", "refused"]],
    ["name", "employee_id", "total_amount", "state", "payment_mode", "date", "company_id"],
    { order: "date desc", limit: 2000 }
  );

  const filas = gastos.map((g) => {
    const companyId = idDeTupla(g.company_id) ?? 1;
    return {
      odoo_id: g.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      descripcion: g.name,
      empleado: nombreDeTupla(g.employee_id),
      monto_total: g.total_amount,
      estado: g.state,
      forma_pago: g.payment_mode || null,
      fecha: g.date || null,
      actualizado_en: new Date().toISOString(),
    };
  });

  if (filas.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}
