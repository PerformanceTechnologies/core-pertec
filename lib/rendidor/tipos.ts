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
// El TOTAL IMPRESO YA INCLUYE EL IVA, siempre. En un documento afecto el neto se
// saca hacia atras desde ese total y el IVA solo se muestra por separado: nunca
// se agrega nada encima, o se inflaria la rendicion.
//
//   $50.000 impresos -> neto 42.017 + IVA 7.983 = 50.000
//
// Vale para el pasaje aereo igual que para una boleta de consumo, aunque LATAM lo
// emita como "factura no afecta o exenta": el criterio de PERTEC es reconocer el
// IVA que ya viene dentro del monto.
export const TRATAMIENTO_DOCUMENTO: Record<
  TipoDocumento,
  { etiqueta: string; afecto: boolean | null; nota?: string }
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
  // importar el tramo ni que el documento venga marcado como exento. El IVA ya
  // esta dentro del total impreso, asi que se saca hacia atras como en cualquier
  // otro documento afecto.
  pasaje_aereo: {
    etiqueta: "Pasaje Aéreo",
    afecto: true,
    nota: "Siempre afecto al 19%, ya incluido en el total impreso",
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
