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
  // Campo custom de este Odoo (selection): alimentacion/traslados/alojamiento/
  // operacionales/horas_hombre/urgencias -- ver traducir(CATEGORIAS_GASTO, ...).
  pertec_categoria: string | false;
}

// hr.expense.advance -- "Fondo por Rendir", modelo custom de este Odoo (no
// viene de serie con hr_expense): dinero entregado por adelantado a un
// empleado, que despues se justifica con gastos (hr.expense) contra ese
// fondo. No confundir con hr.expense: un fondo puede existir sin gastos
// rendidos todavia (balance = amount mientras no se le impute nada).
interface FondoOdoo {
  id: number;
  name: string;
  employee_id: TuplaOdoo;
  date: string | false;
  amount: number;
  description: string | false;
  purpose: string | false;
  state: string;
  expense_total: number;
  balance: number;
  company_id: TuplaOdoo;
}

// Borra de la cache lo que Odoo ya no devuelve -- mismo patron que
// sincronizar-flota.ts: upsert por si solo nunca limpia filas viejas.
async function eliminarNoVigentes(
  tabla: "panel_odoo_gastos" | "panel_odoo_fondos_gasto",
  idsVigentes: number[]
) {
  const query = supabaseAdmin.from(tabla).delete();
  const { error } =
    idsVigentes.length > 0 ? await query.not("odoo_id", "in", `(${idsVigentes.join(",")})`) : await query.neq("odoo_id", -1);
  if (error) throw new Error(error.message);
}

// Se cachean todos menos los rechazados -- state se guarda tal cual, el
// filtro de KPI (ej. excluir borrador) se aplica al leer, no al sincronizar.
export async function sincronizarGastos(): Promise<number> {
  const gastos = await odooSearchRead<GastoOdoo>(
    "hr.expense",
    [["state", "!=", "refused"]],
    ["name", "employee_id", "total_amount", "state", "payment_mode", "date", "company_id", "pertec_categoria"],
    { order: "date desc", limit: 2000 }
  );

  await eliminarNoVigentes("panel_odoo_gastos", gastos.map((g) => g.id));

  let countGastos = 0;
  if (gastos.length > 0) {
    const filasGastos = gastos.map((g) => {
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
        categoria: g.pertec_categoria || null,
        actualizado_en: new Date().toISOString(),
      };
    });

    const { error, count } = await supabaseAdmin
      .from("panel_odoo_gastos")
      .upsert(filasGastos, { onConflict: "odoo_id", count: "exact" });
    if (error) throw new Error(error.message);
    countGastos = count ?? filasGastos.length;
  }

  const fondos = await odooSearchRead<FondoOdoo>(
    "hr.expense.advance",
    [["state", "!=", "cancel"]],
    ["name", "employee_id", "date", "amount", "description", "purpose", "state", "expense_total", "balance", "company_id"],
    { order: "date desc", limit: 500 }
  );

  await eliminarNoVigentes("panel_odoo_fondos_gasto", fondos.map((f) => f.id));

  let countFondos = 0;
  if (fondos.length > 0) {
    const filasFondos = fondos.map((f) => {
      const companyId = idDeTupla(f.company_id) ?? 1;
      return {
        odoo_id: f.id,
        company_id: companyId,
        company_nombre: obtenerCompania(companyId).nombre,
        referencia: f.name,
        empleado: nombreDeTupla(f.employee_id),
        descripcion: f.description || null,
        motivo: f.purpose || null,
        fecha: f.date || null,
        monto_entregado: f.amount,
        monto_rendido: f.expense_total,
        saldo: f.balance,
        estado: f.state,
        actualizado_en: new Date().toISOString(),
      };
    });

    const { error, count } = await supabaseAdmin
      .from("panel_odoo_fondos_gasto")
      .upsert(filasFondos, { onConflict: "odoo_id", count: "exact" });
    if (error) throw new Error(error.message);
    countFondos = count ?? filasFondos.length;
  }

  return countGastos + countFondos;
}
