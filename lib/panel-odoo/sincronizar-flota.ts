import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooSearchRead } from "./odoo-cliente";
import { eliminarNoVigentes } from "./limpieza";
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

// pertec.fleet.vehicle.document es un modelo custom de este Odoo (no viene
// de serie con el modulo Fleet): guarda permiso de circulacion, SOAP,
// revision tecnica, etc. por vehiculo, con fecha de vencimiento. No tiene
// company_id propio -- se hereda del vehiculo (vehicle_id) al sincronizar.
interface DocumentoVehiculoOdoo {
  id: number;
  name: string;
  category: string | false;
  document_type: string | false;
  expiration_date: string | false;
  vehicle_id: TuplaOdoo;
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
    { limit: 2000 },
  );

  await eliminarNoVigentes(
    "panel_odoo_flota",
    vehiculos.map((v) => v.id),
  );

  if (vehiculos.length === 0) {
    await eliminarNoVigentes("panel_odoo_flota_documentos", []);
    return 0;
  }

  const companyPorVehiculo = new Map<number, number>();
  const nombrePorVehiculo = new Map<number, string>();
  const filasVehiculos = vehiculos.map((v) => {
    const companyId = idDeTupla(v.company_id) ?? 1;
    companyPorVehiculo.set(v.id, companyId);
    nombrePorVehiculo.set(v.id, v.name);
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

  const { error: errorVehiculos, count: countVehiculos } = await supabaseAdmin
    .from("panel_odoo_flota")
    .upsert(filasVehiculos, { onConflict: "odoo_id", count: "exact" });
  if (errorVehiculos) throw new Error(errorVehiculos.message);

  const documentos = await odooSearchRead<DocumentoVehiculoOdoo>(
    "pertec.fleet.vehicle.document",
    [],
    ["name", "category", "document_type", "expiration_date", "vehicle_id"],
    { limit: 5000 },
  );

  await eliminarNoVigentes(
    "panel_odoo_flota_documentos",
    documentos.map((d) => d.id),
  );

  let countDocumentos = 0;
  if (documentos.length > 0) {
    const filasDocumentos = documentos
      .map((d) => {
        const vehiculoId = idDeTupla(d.vehicle_id);
        if (vehiculoId === null) return null;
        return {
          odoo_id: d.id,
          company_id: companyPorVehiculo.get(vehiculoId) ?? 1,
          vehiculo_odoo_id: vehiculoId,
          vehiculo_nombre: nombrePorVehiculo.get(vehiculoId) ?? nombreDeTupla(d.vehicle_id) ?? "Vehículo",
          nombre: d.name,
          categoria: d.category || null,
          tipo_documento: d.document_type || null,
          fecha_vencimiento: d.expiration_date || null,
          actualizado_en: new Date().toISOString(),
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const { error: errorDocumentos, count } = await supabaseAdmin
      .from("panel_odoo_flota_documentos")
      .upsert(filasDocumentos, { onConflict: "odoo_id", count: "exact" });
    if (errorDocumentos) throw new Error(errorDocumentos.message);
    countDocumentos = count ?? filasDocumentos.length;
  }

  return (countVehiculos ?? filasVehiculos.length) + countDocumentos;
}
