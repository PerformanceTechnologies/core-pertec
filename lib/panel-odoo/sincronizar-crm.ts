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

interface LeadOdoo {
  id: number;
  name: string;
  partner_id: TuplaOdoo;
  stage_id: TuplaOdoo;
  expected_revenue: number;
  probability: number;
  type: "lead" | "opportunity";
  user_id: TuplaOdoo;
  company_id: TuplaOdoo;
  create_date: string | false;
  date_deadline: string | false;
}

// Solo oportunidades/leads activos (sin perdidas) para v1 -- ver plan.
export async function sincronizarCrm(): Promise<number> {
  const leads = await odooSearchRead<LeadOdoo>(
    "crm.lead",
    [["active", "=", true]],
    [
      "name",
      "partner_id",
      "stage_id",
      "expected_revenue",
      "probability",
      "type",
      "user_id",
      "company_id",
      "create_date",
      "date_deadline",
    ],
    { order: "create_date desc", limit: 2000 }
  );

  const filas = leads.map((l) => {
    const companyId = idDeTupla(l.company_id) ?? 1;
    return {
      odoo_id: l.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      tipo: l.type,
      nombre: l.name,
      partner_nombre: nombreDeTupla(l.partner_id),
      etapa: nombreDeTupla(l.stage_id),
      monto_esperado: l.expected_revenue,
      probabilidad: l.probability,
      vendedor: nombreDeTupla(l.user_id),
      fecha_creacion: l.create_date || null,
      fecha_cierre_estimada: l.date_deadline || null,
      actualizado_en: new Date().toISOString(),
    };
  });

  if (filas.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_crm_leads")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}
