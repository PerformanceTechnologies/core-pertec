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
// "pasaje_aereo" queda con afecto: null porque depende del tramo (nacional
// afecto / internacional exento) y no se puede resolver por tipo: hay que
// preguntarlo.
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
  pasaje_aereo: {
    etiqueta: "Pasaje Aéreo",
    afecto: null,
    nota: "Nacional afecto / internacional exento — hay que confirmar el tramo",
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
