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

interface CompraOdoo {
  id: number;
  name: string;
  partner_id: TuplaOdoo;
  date_order: string | false;
  amount_total: number;
  state: string;
  invoice_status: string;
  date_planned: string | false;
  company_id: TuplaOdoo;
}

export async function sincronizarCompras(): Promise<number> {
  const compras = await odooSearchRead<CompraOdoo>(
    "purchase.order",
    [["state", "!=", "cancel"]],
    ["name", "partner_id", "date_order", "amount_total", "state", "invoice_status", "date_planned", "company_id"],
    { order: "date_order desc", limit: 2000 }
  );

  if (compras.length === 0) return 0;

  const filas = compras.map((c) => {
    const companyId = idDeTupla(c.company_id) ?? 1;
    return {
      odoo_id: c.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      numero: c.name,
      partner_nombre: nombreDeTupla(c.partner_id),
      fecha_orden: c.date_order || null,
      monto_total: c.amount_total,
      estado: c.state,
      estado_facturacion: c.invoice_status,
      fecha_entrega_esperada: c.date_planned || null,
      actualizado_en: new Date().toISOString(),
    };
  });

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_compras")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}
