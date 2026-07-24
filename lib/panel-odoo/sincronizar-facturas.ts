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

interface FacturaOdoo {
  id: number;
  name: string | false;
  move_type: "out_invoice" | "out_refund" | "in_invoice" | "in_refund";
  state: string;
  payment_state: string | false;
  partner_id: TuplaOdoo;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  company_id: TuplaOdoo;
  journal_id: TuplaOdoo;
}

// Se cachean tambien las borrador: el filtro "solo posted" es una decision de
// presentacion (ver lib/panel-odoo/datos.ts), no de sincronizacion.
export async function sincronizarFacturas(): Promise<number> {
  const facturas = await odooSearchRead<FacturaOdoo>(
    "account.move",
    [
      ["move_type", "in", ["out_invoice", "out_refund", "in_invoice", "in_refund"]],
      ["state", "!=", "cancel"],
    ],
    [
      "name",
      "move_type",
      "state",
      "payment_state",
      "partner_id",
      "invoice_date",
      "invoice_date_due",
      "amount_total",
      "amount_residual",
      "company_id",
      "journal_id",
    ],
    { order: "invoice_date desc", limit: 2000 }
  );

  if (facturas.length === 0) return 0;

  const filas = facturas.map((f) => {
    const companyId = idDeTupla(f.company_id) ?? 1;
    return {
      odoo_id: f.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      move_type: f.move_type,
      state: f.state,
      payment_state: f.payment_state || null,
      numero: f.name || null,
      partner_odoo_id: idDeTupla(f.partner_id),
      partner_nombre: nombreDeTupla(f.partner_id),
      fecha_factura: f.invoice_date || null,
      fecha_vencimiento: f.invoice_date_due || null,
      monto_total: f.amount_total,
      monto_pendiente: f.amount_residual,
      diario: nombreDeTupla(f.journal_id),
      actualizado_en: new Date().toISOString(),
    };
  });

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_facturas")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}
