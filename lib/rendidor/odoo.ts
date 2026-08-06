import "server-only";
import { odooSearchRead, odooCreate } from "../panel-odoo/odoo-cliente";
import { calcularDesglose, formasDeRut, taxIdsParaGasto } from "./iva";
import { MAPEO_CATEGORIA_ODOO, TRATAMIENTO_DOCUMENTO, type Rendicion } from "./tipos";

// PASO 8 de la skill rendidor-gastos: subir los gastos a Odoo.
//
// Datos verificados de la instancia PERTEC (si un create falla por un id
// inexistente, re-verificar con odooSearchRead y actualizar aca).
const CURRENCY_CLP = 45;
const TIPO_ID_RUT = 4; // l10n_latam.identification.type
const COUNTRY_ID_CHILE = 46;

export interface EmpleadoOdoo {
  id: number;
  name: string;
  department_id: [number, string] | false;
  // Solo lo trae la busqueda por correo; en las demas viene undefined.
  work_email?: string | false;
}

// Campos que se piden en TODAS las consultas de empleado. work_email queda
// deliberadamente fuera: es estandar de hr.employee, pero si en esta instancia
// estuviera renombrado o quitado, pedirlo acá tumbaria tambien la busqueda por
// nombre y la lectura por id, que son las dos que no pueden fallar.
const CAMPOS_EMPLEADO = ["id", "name", "department_id"];

/** 8.1 — Buscar al empleado. Nunca se adivina: si hay 0 o varios, decide quien rinde. */
export async function buscarEmpleados(nombre: string): Promise<EmpleadoOdoo[]> {
  return odooSearchRead<EmpleadoOdoo>(
    "hr.employee",
    [["name", "ilike", nombre]],
    CAMPOS_EMPLEADO,
    { limit: 20 },
  );
}

/**
 * El empleado de Odoo del usuario logueado, buscado por su correo corporativo.
 *
 * Es el camino preferido para saber quien rinde: el correo es unico y lo
 * administra RRHH, a diferencia del nombre escrito a mano, que basta que tenga
 * una tilde de diferencia para no encontrar a nadie.
 *
 * Es un ATAJO, no un requisito: quien llama tiene que tolerar el null (y el
 * throw, si work_email no existiera en la instancia) y caer a la busqueda por
 * nombre.
 */
export async function buscarEmpleadoPorCorreo(correo: string): Promise<EmpleadoOdoo | null> {
  if (!correo.trim()) return null;
  const filas = await odooSearchRead<EmpleadoOdoo>(
    "hr.employee",
    [["work_email", "=ilike", correo.trim()]],
    [...CAMPOS_EMPLEADO, "work_email"],
    { limit: 2 },
  );
  // Con dos coincidencias no se elige por nosotros: que lo resuelva el selector.
  return filas.length === 1 ? filas[0] : null;
}

/** Lee un empleado por id. Se usa para tomar el nombre canonico desde Odoo. */
export async function obtenerEmpleado(id: number): Promise<EmpleadoOdoo | null> {
  const filas = await odooSearchRead<EmpleadoOdoo>(
    "hr.employee",
    [["id", "=", id]],
    CAMPOS_EMPLEADO,
    { limit: 1 },
  );
  return filas[0] ?? null;
}

export interface ProveedorOdoo {
  id: number;
  name: string;
  vat: string | false;
}

/**
 * 8.2 — Resolver el proveedor de un gasto. `pertec_proveedor_id` no puede
 * quedar vacio, asi que esto nunca devuelve "sin proveedor" en silencio:
 * devuelve los candidatos y quien rinde elige, o marca que hay que crearlo.
 *
 * Busca por RUT en ambos formatos, porque Odoo lo guarda inconsistente (hay
 * registros como "77768291-1" y otros como "83.547.100-4").
 */
export async function buscarProveedor(
  rut: string | null,
  nombre: string,
): Promise<{ candidatos: ProveedorOdoo[]; via: "rut" | "nombre" | "ninguna" }> {
  if (rut?.trim()) {
    const { sinPuntos, conPuntos, cuerpo } = formasDeRut(rut);

    const porRut = await odooSearchRead<ProveedorOdoo>(
      "res.partner",
      ["|", ["vat", "=", sinPuntos], ["vat", "=", conPuntos]],
      ["id", "name", "vat"],
      { limit: 20 },
    );
    if (porRut.length > 0) return { candidatos: porRut, via: "rut" };

    // Fallback: los primeros 8 digitos del cuerpo, para formatos raros
    const porRutParcial = await odooSearchRead<ProveedorOdoo>(
      "res.partner",
      [["vat", "ilike", cuerpo.slice(0, 8)]],
      ["id", "name", "vat"],
      { limit: 20 },
    );
    if (porRutParcial.length > 0) return { candidatos: porRutParcial, via: "rut" };
  }

  if (nombre.trim()) {
    const porNombre = await odooSearchRead<ProveedorOdoo>(
      "res.partner",
      [["name", "ilike", nombre.trim()]],
      ["id", "name", "vat"],
      { limit: 20 },
    );
    if (porNombre.length > 0) return { candidatos: porNombre, via: "nombre" };
  }

  return { candidatos: [], via: "ninguna" };
}

/** 8.5 — Crear un proveedor que no existe. */
export async function crearProveedor(datos: {
  nombre: string;
  rut: string | null;
  esPersonaNatural: boolean;
}): Promise<number> {
  return odooCreate("res.partner", {
    name: datos.nombre.trim(),
    vat: datos.rut?.trim() || false,
    l10n_latam_identification_type_id: TIPO_ID_RUT,
    country_id: COUNTRY_ID_CHILE,
    // Persona natural para boletas de honorarios, ferias, arriendos particulares
    is_company: !datos.esPersonaNatural,
    company_type: datos.esPersonaNatural ? "person" : "company",
    supplier_rank: 1,
  });
}

export interface PreviewGastoOdoo {
  gastoId: string;
  name: string;
  date: string;
  total: number;
  neto: number;
  iva: number;
  afecto: boolean;
  tipoDocumento: string;
  etiquetaTipo: string;
  productId: number;
  pertecCategoria: string;
  partnerId: number;
  advertencias: string[];
}

/**
 * 8.4 — Armar el preview. SIEMPRE antes de crear nada: es lo que quien rinde
 * confirma explicitamente.
 *
 * Recalcula el desglose con las reglas de iva.ts en vez de confiar en lo que
 * quedo guardado, para que el preview y lo que se carga sean el mismo numero.
 */
export function armarPreview(
  rendicion: Rendicion,
  partnerPorGasto: Record<string, number>,
): PreviewGastoOdoo[] {
  return rendicion.gastos.map((g) => {
    if (!g.tipoDocumento) {
      throw new Error(`El gasto ${g.orden} no tiene tipo de documento. Es obligatorio para cargar a Odoo.`);
    }
    if (!g.categoria) {
      throw new Error(`El gasto ${g.orden} no tiene categoría.`);
    }
    if (!g.fecha) {
      throw new Error(`El gasto ${g.orden} no tiene fecha.`);
    }
    const partnerId = partnerPorGasto[g.id];
    if (!partnerId) {
      throw new Error(
        `El gasto ${g.orden} (${g.proveedor || "sin proveedor"}) no tiene proveedor resuelto. ` +
          "pertec_proveedor_id es obligatorio.",
      );
    }

    const tratamiento = TRATAMIENTO_DOCUMENTO[g.tipoDocumento];
    // Para pasaje aéreo el tramo ya quedó resuelto al guardar (si no, calcularDesglose lanza).
    const desglose = calcularDesglose(
      g.total,
      g.tipoDocumento,
      g.iva > 0 ? g.neto : null,
      g.iva > 0 ? g.iva : null,
      tratamiento.afecto === null ? g.iva > 0 : undefined,
    );

    const mapeo = MAPEO_CATEGORIA_ODOO[g.categoria];

    return {
      gastoId: g.id,
      name: g.detalle.slice(0, 200),
      date: g.fecha,
      total: desglose.total,
      neto: desglose.neto,
      iva: desglose.iva,
      afecto: desglose.afecto,
      tipoDocumento: g.tipoDocumento,
      etiquetaTipo: tratamiento.etiqueta,
      productId: mapeo.productId,
      pertecCategoria: mapeo.pertecCategoria,
      partnerId,
      advertencias: desglose.advertencias,
    };
  });
}

/**
 * 8.6 — Crear un hr.expense.
 *
 * `extract_state: "done"` va EN LA CREACION, antes de que exista el adjunto: la
 * empresa 1 tiene el OCR en "auto_send", asi que cuando llega un adjunto Odoo lo
 * manda a digitalizar y el OCR reescribe proveedor, fecha y montos — justo los
 * datos que ya vienen bien. Con extract_state en "done" el gasto ya no esta en
 * estado extraible y el auto-send lo saltea. El orden es esencial.
 *
 * Se carga el TOTAL impreso en price_unit: si se cargara el neto, Odoo le
 * agregaria el IVA encima y el total quedaria inflado un 19%.
 *
 * total_amount, tax_amount y untaxed_amount NO se envian: son campos calculados
 * y Odoo los deriva.
 */
export async function crearGastoOdoo(
  preview: PreviewGastoOdoo,
  employeeId: number,
  companyId: number,
): Promise<number> {
  return odooCreate("hr.expense", {
    employee_id: employeeId,
    name: preview.name,
    date: preview.date,
    quantity: 1,
    price_unit: preview.total,
    total_amount_currency: preview.total,
    payment_mode: "own_account",
    company_id: companyId,
    currency_id: CURRENCY_CLP,
    product_id: preview.productId,
    pertec_categoria: preview.pertecCategoria,
    pertec_document_type: preview.tipoDocumento,
    pertec_proveedor_id: preview.partnerId,
    vendor_id: preview.partnerId,
    tax_ids: taxIdsParaGasto(preview.afecto, companyId),
    extract_state: "done",
  });
}

/**
 * 8.7 — Adjuntar el respaldo.
 *
 * A diferencia de la skill, aca NO hace falta normalizar ni comprimir: el
 * base64 va del servidor directo a Odoo por XML-RPC, sin pasar por el contexto
 * de ningun modelo, asi que el motivo de la compresion (el costo en tokens de
 * la llamada MCP) no existe. Se adjunta el original.
 *
 * Se crea el ir.attachment directo, sin message_post ni
 * message_main_attachment_id: esa es la via que dispara los hooks de mensajeria
 * y, con auto_send activo, el envio al OCR.
 */
export async function adjuntarRespaldo(
  expenseId: number,
  nombre: string,
  contenido: Buffer,
  mimeType: string,
): Promise<number> {
  return adjuntarArchivoAGasto(expenseId, nombre, contenido, mimeType);
}

/**
 * Adjunta cualquier archivo a un hr.expense. Es la misma via que
 * `adjuntarRespaldo` — un ir.attachment directo, sin message_post — y se usa
 * ademas para colgar la planilla consolidada de la rendicion.
 */
export async function adjuntarArchivoAGasto(
  expenseId: number,
  nombre: string,
  contenido: Buffer,
  mimeType: string,
): Promise<number> {
  return odooCreate("ir.attachment", {
    name: nombre,
    datas: contenido.toString("base64"),
    res_model: "hr.expense",
    res_id: expenseId,
    mimetype: mimeType,
    type: "binary",
  });
}

export interface VerificacionGasto {
  id: number;
  nb_attachment: number;
  extract_state: string;
  tax_amount: number;
  total_amount: number;
  pertec_proveedor_id: [number, string] | false;
  pertec_document_type: string | false;
}

/**
 * Verificacion obligatoria despues de cada adjunto: comprobar que el respaldo
 * quedo y que extract_state sigue en "done". Si el OCR alcanzo a correr y pisar
 * los montos, esto lo detecta.
 *
 * Nota: el wrapper de Odoo del core esta acotado a "create" a proposito, asi que
 * desde aca NO se puede corregir extract_state con un write. Si la verificacion
 * falla, se informa para que se corrija en Odoo — o mejor, se desactiva el
 * auto-send del OCR (Gastos -> Configuracion -> digitalizacion "manual"), que
 * elimina el problema de raiz y tambien para las subidas manuales.
 */
export async function verificarGasto(expenseId: number): Promise<VerificacionGasto | null> {
  const filas = await odooSearchRead<VerificacionGasto>(
    "hr.expense",
    [["id", "=", expenseId]],
    [
      "id",
      "nb_attachment",
      "extract_state",
      "tax_amount",
      "total_amount",
      "pertec_proveedor_id",
      "pertec_document_type",
    ],
    { limit: 1 },
  );
  return filas[0] ?? null;
}

export interface ProblemaVerificacion {
  expenseId: number;
  problema: string;
}

/** Contrasta lo verificado contra lo que se quiso cargar. */
export function revisarVerificacion(
  v: VerificacionGasto,
  esperado: PreviewGastoOdoo,
): ProblemaVerificacion[] {
  const problemas: ProblemaVerificacion[] = [];

  if (v.nb_attachment < 1) {
    problemas.push({ expenseId: v.id, problema: "El respaldo no quedó adjunto." });
  }
  if (v.extract_state !== "done") {
    problemas.push({
      expenseId: v.id,
      problema:
        `extract_state quedó en "${v.extract_state}" en vez de "done": el OCR de Odoo corrió y pudo ` +
        "haber pisado proveedor, fecha o montos. Conviene desactivar el auto-send de la digitalización.",
    });
  }
  if (Math.abs(v.total_amount - esperado.total) >= 1) {
    problemas.push({
      expenseId: v.id,
      problema: `El total quedó en ${v.total_amount} en vez de ${esperado.total}.`,
    });
  }
  if (!v.pertec_proveedor_id) {
    problemas.push({ expenseId: v.id, problema: "pertec_proveedor_id quedó vacío." });
  }
  if (!v.pertec_document_type) {
    problemas.push({ expenseId: v.id, problema: "pertec_document_type quedó vacío." });
  }

  return problemas;
}
