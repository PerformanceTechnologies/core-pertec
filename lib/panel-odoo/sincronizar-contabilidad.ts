import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooSearchRead } from "./odoo-cliente";
import { obtenerCompania } from "./companias";

type TuplaOdoo = [number, string] | false;
function idDeTupla(t: TuplaOdoo): number | null {
  return Array.isArray(t) ? t[0] : null;
}

interface CuentaOdoo {
  id: number;
  account_type: string;
}

interface LineaOdoo {
  account_id: TuplaOdoo;
  debit: number;
  credit: number;
  date: string | false;
  company_id: TuplaOdoo;
}

type TipoCuenta = "ingreso" | "gasto" | "activo" | "pasivo" | "patrimonio";

// Mapea el account_type de Odoo 19 a los 5 buckets del resumen ejecutivo.
// off_balance se descarta a proposito: no es parte de ningun estado
// financiero, solo cuentas de control (garantias, etc).
function tipoCuenta(accountType: string): TipoCuenta | null {
  if (accountType === "income" || accountType === "income_other") return "ingreso";
  if (accountType.startsWith("expense")) return "gasto";
  if (accountType.startsWith("asset")) return "activo";
  if (accountType.startsWith("liability")) return "pasivo";
  if (accountType.startsWith("equity")) return "patrimonio";
  return null;
}

// Ingreso/pasivo/patrimonio tienen saldo natural acreedor (credito - debito);
// activo/gasto tienen saldo natural deudor (debito - credito). Se invierte el
// signo asi el monto se lee como un numero positivo natural en la UI.
function montoConSigno(tipo: TipoCuenta, debit: number, credit: number): number {
  if (tipo === "ingreso" || tipo === "pasivo" || tipo === "patrimonio") return credit - debit;
  return debit - credit;
}

function primerDiaDelMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

// Recalculo completo en cada corrida (trunca + inserta), sin logica
// incremental: con el volumen actual (28 lineas posteadas en total) es
// trivial, y evita mantener dos caminos de calculo (incremental + full).
export async function sincronizarContabilidad(): Promise<number> {
  const [lineas, cuentas] = await Promise.all([
    odooSearchRead<LineaOdoo>(
      "account.move.line",
      [["parent_state", "=", "posted"]],
      ["account_id", "debit", "credit", "date", "company_id"],
      { limit: 20000 }
    ),
    odooSearchRead<CuentaOdoo>("account.account", [], ["account_type"], { limit: 5000 }),
  ]);

  const tipoPorCuentaId = new Map(cuentas.map((c) => [c.id, c.account_type]));

  // Acumula por (company_id, periodo, tipo_cuenta)
  const acumulado = new Map<string, { company_id: number; periodo: string; tipo_cuenta: TipoCuenta; monto: number }>();

  for (const linea of lineas) {
    if (!linea.date) continue;
    const cuentaId = idDeTupla(linea.account_id);
    const accountType = cuentaId !== null ? tipoPorCuentaId.get(cuentaId) : undefined;
    if (!accountType) continue;
    const tipo = tipoCuenta(accountType);
    if (!tipo) continue;

    const companyId = idDeTupla(linea.company_id) ?? 1;
    const periodo = primerDiaDelMes(linea.date);
    const clave = `${companyId}|${periodo}|${tipo}`;

    const existente = acumulado.get(clave);
    const monto = montoConSigno(tipo, linea.debit, linea.credit);
    if (existente) {
      existente.monto += monto;
    } else {
      acumulado.set(clave, { company_id: companyId, periodo, tipo_cuenta: tipo, monto });
    }
  }

  const filas = Array.from(acumulado.values()).map((f) => ({
    ...f,
    company_nombre: obtenerCompania(f.company_id).nombre,
    actualizado_en: new Date().toISOString(),
  }));

  // Truncate + insert: se reemplaza el agregado completo en cada corrida.
  const { error: errorBorrar } = await supabaseAdmin
    .from("panel_odoo_contabilidad_mensual")
    .delete()
    .not("company_id", "is", null);
  if (errorBorrar) throw new Error(errorBorrar.message);

  if (filas.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_contabilidad_mensual")
    .upsert(filas, { onConflict: "company_id,periodo,tipo_cuenta", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}
