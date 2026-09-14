import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooCampos, odooSearchRead } from "./odoo-cliente";
import { eliminarNoVigentes } from "./limpieza";
import { obtenerCompania } from "./companias";

type TuplaOdoo = [number, string] | false;
function nombreDeTupla(t: TuplaOdoo): string | null {
  return Array.isArray(t) ? t[1] : null;
}
function idDeTupla(t: TuplaOdoo): number | null {
  return Array.isArray(t) ? t[0] : null;
}
function comoTexto(valor: unknown): string | null {
  if (Array.isArray(valor)) return typeof valor[1] === "string" ? valor[1] : null;
  if (typeof valor === "string") return valor || null;
  return null;
}
function comoNumero(valor: unknown): number {
  return typeof valor === "number" ? valor : 0;
}
/** Cuántos ids trae un many2many; 0 si el campo no vino. */
function cuantos(valor: unknown): number {
  return Array.isArray(valor) ? valor.length : 0;
}

interface GastoOdoo {
  id: number;
  [campo: string]: unknown;
}

/**
 * Los nombres posibles de cada dato en hr.expense, del preferido al mas viejo.
 *
 * Igual que en Flota, CRM y Ventas: no se piden nombres fijos, se le pregunta a Odoo
 * cuales tiene (fields_get) y se usa el primero de cada lista que exista. Buena parte de
 * lo que se lee aca son campos CUSTOM de este Odoo (todo el pertec_*: categoria, tipo de
 * documento tributario, proveedor, y la atribucion a una venta/arriendo/compra) y los
 * tocan del otro lado; un nombre que ya no esta tumba la sincronizacion entera con
 * "Invalid field", que es lo que le paso a Flota tres dias seguidos.
 */
const CAMPOS_GASTO = {
  descripcion: ["name"],
  empleado: ["employee_id"],
  departamento: ["department_id"],
  aprobador: ["manager_id"],
  montoTotal: ["total_amount"],
  montoNeto: ["untaxed_amount"],
  montoImpuesto: ["tax_amount"],
  montoPendiente: ["amount_residual"],
  estado: ["state"],
  estadoAprobacion: ["approval_state"],
  fechaAprobacion: ["approval_date"],
  formaPago: ["payment_mode"],
  fecha: ["date"],
  empresa: ["company_id"],
  categoria: ["pertec_categoria"],
  categoriaOdoo: ["product_id"],
  tipoDocumento: ["pertec_document_type"],
  concepto: ["pertec_tag"],
  proveedor: ["pertec_proveedor_id", "vendor_id"],
  respaldos: ["nb_attachment"],
  fondo: ["advance_id"],
  proyecto: ["project_id"],
  tarea: ["task_id"],
  asiento: ["account_move_id"],
  // A que se le carga el gasto. Son tres campos distintos en Odoo y uno solo en la cache:
  // el tipo dice cual de los tres vino.
  tipoAtribucion: ["pertec_link_type"],
  venta: ["pertec_sale_order_id"],
  arriendo: ["pertec_rental_order_id"],
  compra: ["pertec_purchase_order_id"],
  contraparte: ["pertec_linked_partner_id"],
  duplicados: ["duplicate_expense_ids"],
  mismoRecibo: ["same_receipt_expense_ids"],
} as const;

type CamposDeGasto = Record<keyof typeof CAMPOS_GASTO, string | null>;

export function resolverCamposGasto(camposQueTiene: Record<string, { type: string }>): CamposDeGasto {
  const campo = Object.fromEntries(
    Object.entries(CAMPOS_GASTO).map(([que, posibles]) => [
      que,
      posibles.find((nombre) => camposQueTiene[nombre] !== undefined) ?? null,
    ]),
  ) as CamposDeGasto;

  // Sin descripcion ni monto no hay gasto que listar ni que sumar.
  for (const imprescindible of ["descripcion", "montoTotal"] as const) {
    if (campo[imprescindible] === null) {
      throw new Error(
        `hr.expense ya no tiene ninguno de los campos de ${imprescindible} ` +
          `(${CAMPOS_GASTO[imprescindible].join(", ")}). Los que tiene hoy: ` +
          `${Object.keys(camposQueTiene).sort().join(", ")}`,
      );
    }
  }
  return campo;
}

export function camposAPedirDeGasto(campo: CamposDeGasto): string[] {
  return [...new Set(Object.values(campo).filter((n): n is string => n !== null))];
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

// Se cachean todos menos los rechazados -- state se guarda tal cual, el
// filtro de KPI (ej. excluir borrador) se aplica al leer, no al sincronizar.
export async function sincronizarGastos(): Promise<number> {
  const campo = resolverCamposGasto(await odooCampos("hr.expense"));
  const gastos = await odooSearchRead<GastoOdoo>(
    "hr.expense",
    [["state", "!=", "refused"]],
    camposAPedirDeGasto(campo),
    { order: "date desc", limit: 2000 },
  );

  const leer = (g: GastoOdoo, que: keyof typeof CAMPOS_GASTO): unknown =>
    campo[que] === null ? undefined : g[campo[que] as string];

  await eliminarNoVigentes(
    "panel_odoo_gastos",
    gastos.map((g) => g.id),
  );

  let countGastos = 0;
  if (gastos.length > 0) {
    const filasGastos = gastos.map((g) => {
      const companyId = idDeTupla(leer(g, "empresa") as TuplaOdoo) ?? 1;
      // La atribución vive en tres campos distintos de Odoo y en una sola columna acá: el
      // tipo dice cuál de los tres vino, y así el filtro no tiene que mirar tres.
      const atribucion =
        comoTexto(leer(g, "venta")) ?? comoTexto(leer(g, "arriendo")) ?? comoTexto(leer(g, "compra"));
      return {
        odoo_id: g.id,
        company_id: companyId,
        company_nombre: obtenerCompania(companyId).nombre,
        descripcion: comoTexto(leer(g, "descripcion")),
        empleado: comoTexto(leer(g, "empleado")),
        departamento: comoTexto(leer(g, "departamento")),
        aprobador: comoTexto(leer(g, "aprobador")),
        monto_total: comoNumero(leer(g, "montoTotal")),
        monto_neto: comoNumero(leer(g, "montoNeto")),
        monto_impuesto: comoNumero(leer(g, "montoImpuesto")),
        monto_pendiente: comoNumero(leer(g, "montoPendiente")),
        estado: comoTexto(leer(g, "estado")) ?? "draft",
        estado_aprobacion: comoTexto(leer(g, "estadoAprobacion")),
        fecha_aprobacion: comoTexto(leer(g, "fechaAprobacion")),
        forma_pago: comoTexto(leer(g, "formaPago")),
        fecha: comoTexto(leer(g, "fecha")),
        categoria: comoTexto(leer(g, "categoria")),
        categoria_odoo: comoTexto(leer(g, "categoriaOdoo")),
        tipo_documento: comoTexto(leer(g, "tipoDocumento")),
        concepto: comoTexto(leer(g, "concepto")),
        proveedor: comoTexto(leer(g, "proveedor")),
        respaldos: typeof leer(g, "respaldos") === "number" ? (leer(g, "respaldos") as number) : null,
        fondo: comoTexto(leer(g, "fondo")),
        fondo_odoo_id: idDeTupla(leer(g, "fondo") as TuplaOdoo),
        atribuido_a: atribucion,
        atribuido_tipo: comoTexto(leer(g, "tipoAtribucion")),
        contraparte: comoTexto(leer(g, "contraparte")),
        proyecto: comoTexto(leer(g, "proyecto")),
        tarea: comoTexto(leer(g, "tarea")),
        asiento: comoTexto(leer(g, "asiento")),
        duplicados: cuantos(leer(g, "duplicados")) + cuantos(leer(g, "mismoRecibo")),
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
    [
      "name",
      "employee_id",
      "date",
      "amount",
      "description",
      "purpose",
      "state",
      "expense_total",
      "balance",
      "company_id",
    ],
    { order: "date desc", limit: 500 },
  );

  await eliminarNoVigentes(
    "panel_odoo_fondos_gasto",
    fondos.map((f) => f.id),
  );

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
