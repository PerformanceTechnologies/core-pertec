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
//
// Los campos NO se piden por nombre fijo: se le pregunta primero a Odoo cuales tiene
// (fields_get) y se usa el primero de cada lista que exista. Es un modelo custom y lo
// tocan del lado de Odoo: el tipo de documento paso de ser un `document_type` (selection)
// a un `document_type_id` que apunta a pertec.document.type, y la sincronizacion murio
// tres dias seguidos con "Invalid field 'document_type'". Pidiendo lo que hay, un rename
// deja de tumbar la tarjeta -- a lo sumo una columna queda vacia, y eso se ve.
interface DocumentoVehiculoOdoo {
  id: number;
  [campo: string]: unknown;
}

/**
 * Los nombres posibles de cada dato, del preferido al mas viejo.
 *
 * El orden importa: `document_type_name` es el texto ya resuelto y es lo que se muestra,
 * asi que va antes que el many2one y antes que la selection vieja.
 */
const CAMPOS_DOCUMENTO = {
  nombre: ["name"],
  categoria: ["category", "category_id", "categoria"],
  tipo: ["document_type_name", "document_type_id", "document_type"],
  vencimiento: ["expiration_date", "date_expiration"],
  vehiculo: ["vehicle_id"],
} as const;

/** El primero de la lista que el modelo realmente tenga. */
function primeroQueExista(
  campos: Record<string, { type: string }>,
  posibles: readonly string[],
): string | null {
  return posibles.find((nombre) => campos[nombre] !== undefined) ?? null;
}

export type CamposDeDocumento = Record<keyof typeof CAMPOS_DOCUMENTO, string | null>;

export const MODELO_DOCUMENTOS = "pertec.fleet.vehicle.document";

/**
 * Que campo del modelo corresponde a cada dato, segun lo que Odoo diga que tiene hoy.
 *
 * Exportada para poder probarla sin Odoo (ver scripts/probar-flota.mts): es la que
 * decide si la tarjeta se llena o se cae, y lo unico que la puede romper es un cambio
 * del otro lado, que es justo lo que no se puede reproducir en una prueba.
 */
export function resolverCamposDocumento(camposQueTiene: Record<string, { type: string }>): CamposDeDocumento {
  const campo = Object.fromEntries(
    Object.entries(CAMPOS_DOCUMENTO).map(([que, posibles]) => [que, primeroQueExista(camposQueTiene, posibles)]),
  ) as CamposDeDocumento;

  // Sin el vehiculo o sin la fecha de vencimiento no hay documento que mostrar: la
  // tarjeta entera es "que vence y de que vehiculo". Se corta con un error que dice QUE
  // falta y que campos tiene el modelo, para no volver a mirar un "Invalid field" pelado.
  for (const imprescindible of ["vehiculo", "vencimiento"] as const) {
    if (campo[imprescindible] === null) {
      throw new Error(
        `${MODELO_DOCUMENTOS} ya no tiene ninguno de los campos de ${imprescindible} ` +
          `(${CAMPOS_DOCUMENTO[imprescindible].join(", ")}). Los que tiene hoy: ` +
          `${Object.keys(camposQueTiene).sort().join(", ")}`,
      );
    }
  }

  // El tipo de documento no corta la sincronizacion —se ve la fecha igual— pero deja
  // rastro: es una columna de la tabla que va a salir vacia.
  if (campo.tipo === null) {
    console.warn(
      `[panel-odoo] ${MODELO_DOCUMENTOS} no tiene ninguno de ${CAMPOS_DOCUMENTO.tipo.join(", ")}: ` +
        "la columna de tipo de documento va a quedar vacia.",
    );
  }

  return campo;
}

/** Los campos que hay que pedirle a Odoo, sin repetidos y sin los que no existen. */
export function camposAPedir(campo: CamposDeDocumento): string[] {
  return [...new Set(Object.values(campo).filter((n): n is string => n !== null))];
}

/**
 * Un valor de Odoo a texto, sea lo que sea.
 *
 * El mismo dato puede llegar como texto (una selection o un char), como tupla
 * [id, nombre] (un many2one) o como false (vacio). Se resuelve aca y no en tres ramas
 * repartidas por el mapeo.
 */
function comoTexto(valor: unknown): string | null {
  if (Array.isArray(valor)) return typeof valor[1] === "string" ? valor[1] : null;
  if (typeof valor === "string") return valor || null;
  return null;
}

/**
 * Un documento de Odoo a la fila de la cache, leyendo por los campos ya resueltos.
 *
 * Devuelve null para un documento sin vehiculo: no se puede mostrar en la tarjeta ni
 * saber de que empresa es (la empresa se hereda del vehiculo).
 */
export function documentoAFila(
  d: DocumentoVehiculoOdoo,
  campo: CamposDeDocumento,
  companyPorVehiculo: Map<number, number>,
  nombrePorVehiculo: Map<number, string>,
) {
  const enVehiculo = campo.vehiculo === null ? false : d[campo.vehiculo];
  const vehiculoId = idDeTupla(enVehiculo as TuplaOdoo);
  if (vehiculoId === null) return null;
  return {
    odoo_id: d.id,
    company_id: companyPorVehiculo.get(vehiculoId) ?? 1,
    vehiculo_odoo_id: vehiculoId,
    vehiculo_nombre: nombrePorVehiculo.get(vehiculoId) ?? comoTexto(enVehiculo) ?? "Vehículo",
    nombre: (campo.nombre && comoTexto(d[campo.nombre])) || "Documento",
    categoria: campo.categoria ? comoTexto(d[campo.categoria]) : null,
    tipo_documento: campo.tipo ? comoTexto(d[campo.tipo]) : null,
    fecha_vencimiento: campo.vencimiento ? comoTexto(d[campo.vencimiento]) : null,
    actualizado_en: new Date().toISOString(),
  };
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

  const campo = resolverCamposDocumento(await odooCampos(MODELO_DOCUMENTOS));
  const documentos = await odooSearchRead<DocumentoVehiculoOdoo>(MODELO_DOCUMENTOS, [], camposAPedir(campo), {
    limit: 5000,
  });

  await eliminarNoVigentes(
    "panel_odoo_flota_documentos",
    documentos.map((d) => d.id),
  );

  let countDocumentos = 0;
  if (documentos.length > 0) {
    const filasDocumentos = documentos
      .map((d) => documentoAFila(d, campo, companyPorVehiculo, nombrePorVehiculo))
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const { error: errorDocumentos, count } = await supabaseAdmin
      .from("panel_odoo_flota_documentos")
      .upsert(filasDocumentos, { onConflict: "odoo_id", count: "exact" });
    if (errorDocumentos) throw new Error(errorDocumentos.message);
    countDocumentos = count ?? filasDocumentos.length;
  }

  return (countVehiculos ?? filasVehiculos.length) + countDocumentos;
}
