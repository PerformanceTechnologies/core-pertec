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

interface VentaOdoo {
  id: number;
  name: string;
  partner_id: TuplaOdoo;
  date_order: string | false;
  amount_total: number;
  state: string;
  invoice_status: string;
  company_id: TuplaOdoo;
  x_has_rental_lines: boolean;
  x_rental_state: string | false;
  x_rental_start_date: string | false;
  x_rental_end_date: string | false;
  x_rental_days: number | false;
}

// Ventas y Arriendo unificados en sale.order (mismo modelo Odoo): se
// distinguen por x_has_rental_lines, un campo custom de este Odoo mas
// confiable que el is_rental_order estandar (en la practica, ordenes que
// segun x_rental_state SI son arriendo tienen is_rental_order=false).
export async function sincronizarVentas(): Promise<number> {
  const ventas = await odooSearchRead<VentaOdoo>(
    "sale.order",
    [["state", "!=", "cancel"]],
    [
      "name",
      "partner_id",
      "date_order",
      "amount_total",
      "state",
      "invoice_status",
      "company_id",
      "x_has_rental_lines",
      "x_rental_state",
      "x_rental_start_date",
      "x_rental_end_date",
      "x_rental_days",
    ],
    { order: "date_order desc", limit: 2000 }
  );

  if (ventas.length === 0) return 0;

  const filas = ventas.map((v) => {
    const companyId = idDeTupla(v.company_id) ?? 1;
    return {
      odoo_id: v.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      numero: v.name,
      partner_nombre: nombreDeTupla(v.partner_id),
      fecha_orden: v.date_order || null,
      monto_total: v.amount_total,
      estado: v.state,
      estado_facturacion: v.invoice_status,
      es_arriendo: v.x_has_rental_lines,
      estado_arriendo: v.x_rental_state || null,
      fecha_inicio_arriendo: v.x_rental_start_date || null,
      fecha_fin_arriendo: v.x_rental_end_date || null,
      dias_arriendo: v.x_rental_days || null,
      actualizado_en: new Date().toISOString(),
    };
  });

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_ventas")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}
