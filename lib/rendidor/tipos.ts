// Sin "server-only": lo importan tanto la capa de datos del servidor como los
// componentes cliente que muestran y corrigen la rendición.
//
// Portado de la skill rendidor-gastos (PASO 2). Los valores de
// TipoDocumento son EXACTAMENTE los que acepta el campo pertec_document_type
// de Odoo (selection) — no inventar variantes.

export const TIPOS_DOCUMENTO = [
  "factura_electronica",
  "factura_exenta_no_afecta",
  "boleta_electronica",
  "boleta_honorarios",
  "comprobante_peaje_tag",
  "comprobante_estacionamiento",
  "pasaje_aereo",
  "pasaje_terrestre",
  "comprobante_transporte_app",
  "comprobante_bancario",
  "gasto_sin_respaldo_excepcional",
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const CATEGORIAS_GASTO = [
  "Combustible",
  "Peajes",
  "Alimentación",
  "Alojamiento",
  "Transporte",
  "Insumos / Otros",
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

// Tratamiento tributario por tipo de documento. `afecto` es el DEFAULT que se
// aplica solo cuando el comprobante no desglosa neto e IVA — el desglose
// impreso siempre manda sobre esta tabla (ver reglas en iva.ts).
//
// `afecto: null` significa "el tipo no alcanza para decidir, hay que
// confirmarlo". Hoy ningun tipo lo usa; se mantiene en el tipo porque
// calcularDesglose sabe manejarlo y evita tener que reintroducirlo si aparece
// una categoria que si lo necesite.
// `totalEsNeto` distingue los dos sentidos en que un total impreso puede
// relacionarse con el IVA, y es la diferencia entre inflar una rendicion y
// dejarla corta:
//
//   sin la marca (boleta de consumo): el total impreso YA INCLUYE el IVA, asi que
//     el neto se saca hacia atras. $50.000 -> neto 42.017 + IVA 7.983.
//   con la marca (pasaje aereo): el total impreso es la BASE y el IVA se agrega
//     encima. $161.079 -> neto 161.079 + IVA 30.605 = $191.684.
export const TRATAMIENTO_DOCUMENTO: Record<
  TipoDocumento,
  { etiqueta: string; afecto: boolean | null; totalEsNeto?: boolean; nota?: string }
> = {
  factura_electronica: { etiqueta: "Factura Electrónica", afecto: true },
  factura_exenta_no_afecta: { etiqueta: "Factura Exenta / No Afecta", afecto: false },
  boleta_electronica: { etiqueta: "Boleta Electrónica", afecto: true },
  boleta_honorarios: {
    etiqueta: "Boleta de Honorarios",
    afecto: false,
    nota: "Sujeta a retención, no a IVA",
  },
  comprobante_peaje_tag: { etiqueta: "Comprobante Peaje / TAG", afecto: true },
  comprobante_estacionamiento: { etiqueta: "Comprobante Estacionamiento", afecto: true },
  // Criterio contable de PERTEC: el pasaje aereo va SIEMPRE afecto al 19%, sin
  // importar el tramo ni que el documento venga marcado como exento.
  //
  // LATAM los emite como "FACTURA NO AFECTA O EXENTA" con linea VALOR EXENTO, o
  // sea el monto impreso NO trae IVA dentro. Por eso lleva totalEsNeto: el 19%
  // se AGREGA sobre ese monto, no se extrae de el. Extraerlo dejaria la
  // rendicion corta y el credito fiscal subdeclarado.
  pasaje_aereo: {
    etiqueta: "Pasaje Aéreo",
    afecto: true,
    totalEsNeto: true,
    nota: "Siempre afecto al 19%, agregado sobre el monto impreso (el documento viene exento)",
  },
  pasaje_terrestre: {
    etiqueta: "Pasaje Terrestre",
    afecto: false,
    nota: "Transporte terrestre de pasajeros",
  },
  comprobante_transporte_app: {
    etiqueta: "Comprobante Transporte App",
    afecto: true,
    nota: "Uber, Cabify, DiDi emiten boleta afecta",
  },
  comprobante_bancario: {
    etiqueta: "Comprobante Bancario",
    afecto: false,
    nota: "Transferencias y comisiones",
  },
  gasto_sin_respaldo_excepcional: {
    etiqueta: "Gasto sin Respaldo (excepcional)",
    afecto: false,
    nota: "Sin IVA recuperable",
  },
};

// Mapeo categoría del Excel -> campos de Odoo (PASO 8.3 de la skill).
// Los product_id son de la instancia PERTEC, verificados contra la real.
export const MAPEO_CATEGORIA_ODOO: Record<
  CategoriaGasto,
  { productId: number; pertecCategoria: string }
> = {
  Combustible: { productId: 2084, pertecCategoria: "traslados" },
  Peajes: { productId: 2084, pertecCategoria: "traslados" },
  Transporte: { productId: 2084, pertecCategoria: "traslados" },
  Alimentación: { productId: 2083, pertecCategoria: "alimentacion" },
  Alojamiento: { productId: 2084, pertecCategoria: "alojamiento" },
  "Insumos / Otros": { productId: 2088, pertecCategoria: "operacionales" },
};

// Un gasto de la rendición. `neto` e `iva` son informativos para el contador;
// `total` es el que manda: es el TOTAL A PAGAR impreso y el que se carga a
// Odoo (cargar el neto haría que Odoo infle el total un 19%).
export interface GastoRendicion {
  id: string;
  orden: number;
  fecha: string | null; // YYYY-MM-DD
  proveedor: string;
  rutProveedor: string | null;
  numeroDocumento: string | null;
  tipoDocumento: TipoDocumento | null;
  detalle: string;
  categoria: CategoriaGasto | null;
  neto: number;
  iva: number;
  total: number;
  // Marca los campos que el modelo no pudo leer y que hay que confirmar a mano
  // antes de cargar. La skill es explícita: no inventar datos ilegibles.
  pendientes: string[];
  // Respaldo en Supabase Storage
  archivoNombre: string;
  archivoPath: string;
  archivoTipo: string;
  // Trazabilidad de la carga a Odoo
  odooExpenseId: number | null;
  odooPartnerId: number | null;
}

export type EstadoRendicion = "borrador" | "cargada_odoo";

/**
 * Lo que necesita la pantalla de lista, y nada más.
 *
 * Deliberadamente NO trae `gastos`: la cantidad y el total vienen ya calculados
 * desde la vista `rendiciones_resumen` en Postgres.
 */
export interface ResumenRendicion {
  id: string;
  nombreQuienRinde: string;
  montoAsignado: number;
  tituloRendicion: string;
  estado: EstadoRendicion;
  cantidadGastos: number;
  totalGastos: number;
  /**
   * Los hr.expense ya creados en Odoo, en orden.
   *
   * La lista los necesita para poder mostrarlos al confirmar un borrado: al
   * borrar una rendicion cargada se va la unica traza local de que gastos se
   * crearon, y esos gastos NO se borran de Odoo.
   */
  odooExpenseIds: number[];
  creadoEn: string;
}

export interface Rendicion {
  id: string;
  nombreQuienRinde: string;
  montoAsignado: number;
  tituloRendicion: string;
  estado: EstadoRendicion;
  empresaCompanyId: number;
  odooEmployeeId: number | null;
  gastos: GastoRendicion[];
  creadoPor: string | null;
  creadoEn: string;
}
