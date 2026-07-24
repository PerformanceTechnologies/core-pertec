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

interface VehiculoOdoo {
  id: number;
  name: string;
  license_plate: string | false;
  model_id: TuplaOdoo;
  brand_id: TuplaOdoo;
  driver_id: TuplaOdoo;
  state_id: TuplaOdoo;
  category_id: TuplaOdoo;
  odometer: number | false;
  acquisition_date: string | false;
  company_id: TuplaOdoo;
}

export async function sincronizarFlota(): Promise<number> {
  const vehiculos = await odooSearchRead<VehiculoOdoo>(
    "fleet.vehicle",
    [],
    [
      "name",
      "license_plate",
      "model_id",
      "brand_id",
      "driver_id",
      "state_id",
      "category_id",
      "odometer",
      "acquisition_date",
      "company_id",
    ],
    { limit: 2000 }
  );

  if (vehiculos.length === 0) return 0;

  const filas = vehiculos.map((v) => {
    const companyId = idDeTupla(v.company_id) ?? 1;
    return {
      odoo_id: v.id,
      company_id: companyId,
      company_nombre: obtenerCompania(companyId).nombre,
      nombre: v.name,
      patente: v.license_plate || null,
      modelo: nombreDeTupla(v.model_id),
      marca: nombreDeTupla(v.brand_id),
      conductor: nombreDeTupla(v.driver_id),
      estado: nombreDeTupla(v.state_id),
      categoria: nombreDeTupla(v.category_id),
      odometro: v.odometer || null,
      fecha_adquisicion: v.acquisition_date || null,
      actualizado_en: new Date().toISOString(),
    };
  });

  const { error, count } = await supabaseAdmin
    .from("panel_odoo_flota")
    .upsert(filas, { onConflict: "odoo_id", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? filas.length;
}
