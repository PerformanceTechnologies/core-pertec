// El vocabulario del Inventario: tipos, etiquetas y los cálculos puros.
//
// Sin "server-only": lo importan tanto las páginas (servidor) como los formularios y tableros
// (cliente). Acá no se toca la base; solo se nombran las cosas y se hacen las cuentas que deben
// significar lo mismo en todo el módulo (disponible = a mano - reservado, valorización, bajo
// mínimo, días para vencer).

// -----------------------------------------------------------------------------
//  Tipos de dominio (espejo de las tablas inv_*)
// -----------------------------------------------------------------------------

export type TipoProducto = "almacenable" | "consumible" | "servicio";
export type Seguimiento = "ninguno" | "lote" | "serie";
export type TipoUbicacion = "interna" | "proveedor" | "cliente" | "ajuste" | "transito" | "vista";
export type ClaseOperacion = "recepcion" | "entrega" | "interna" | "ajuste";
export type EstadoTransferencia = "borrador" | "listo" | "hecho" | "cancelado";
export type EstadoMovimiento = "borrador" | "hecho" | "cancelado";

export interface Unidad {
  id: string;
  nombre: string;
  abreviacion: string;
  activo: boolean;
}

export interface Categoria {
  id: string;
  nombre: string;
}

export interface Producto {
  id: string;
  sku: string | null;
  nombre: string;
  descripcion: string | null;
  categoriaId: string | null;
  unidadId: string | null;
  tipo: TipoProducto;
  seguimiento: Seguimiento;
  costo: number;
  precio: number;
  activo: boolean;
}

export interface Almacen {
  id: string;
  nombre: string;
  codigo: string;
}

export interface Ubicacion {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: TipoUbicacion;
  padreId: string | null;
  almacenId: string | null;
  esStockPrincipal: boolean;
  activo: boolean;
}

export interface TipoOperacion {
  id: string;
  nombre: string;
  codigo: string;
  clase: ClaseOperacion;
  almacenId: string | null;
  ubicacionOrigenId: string | null;
  ubicacionDestinoId: string | null;
  prefijo: string;
  correlativo: number;
  activo: boolean;
}

export interface Lote {
  id: string;
  productoId: string;
  nombre: string;
  fechaVencimiento: string | null;
  creadoEn: string;
}

export interface Movimiento {
  id: string;
  transferenciaId: string;
  productoId: string;
  unidadId: string | null;
  loteId: string | null;
  ubicacionOrigenId: string;
  ubicacionDestinoId: string;
  cantidad: number;
  cantidadHecha: number | null;
  costoUnitario: number | null;
  estado: EstadoMovimiento;
}

export interface Transferencia {
  id: string;
  referencia: string;
  tipoOperacionId: string | null;
  clase: ClaseOperacion;
  ubicacionOrigenId: string;
  ubicacionDestinoId: string;
  estado: EstadoTransferencia;
  contraparte: string | null;
  nota: string | null;
  fechaProgramada: string | null;
  fechaValidacion: string | null;
  creadoPor: string | null;
  creadoEn: string;
}

export interface Quant {
  id: string;
  productoId: string;
  ubicacionId: string;
  loteId: string | null;
  cantidad: number;
  reservado: number;
}

export interface Regla {
  id: string;
  productoId: string;
  ubicacionId: string;
  minimo: number;
  maximo: number;
  activo: boolean;
}

// -----------------------------------------------------------------------------
//  Etiquetas en español
// -----------------------------------------------------------------------------

export const ETIQUETA_TIPO_PRODUCTO: Record<TipoProducto, string> = {
  almacenable: "Almacenable",
  consumible: "Consumible",
  servicio: "Servicio",
};

export const ETIQUETA_SEGUIMIENTO: Record<Seguimiento, string> = {
  ninguno: "Sin seguimiento",
  lote: "Por lote",
  serie: "Por número de serie",
};

export const ETIQUETA_TIPO_UBICACION: Record<TipoUbicacion, string> = {
  interna: "Interna",
  proveedor: "Proveedores",
  cliente: "Clientes",
  ajuste: "Ajuste de inventario",
  transito: "Tránsito",
  vista: "Vista",
};

export const ETIQUETA_CLASE: Record<ClaseOperacion, string> = {
  recepcion: "Recepción",
  entrega: "Entrega",
  interna: "Transferencia interna",
  ajuste: "Ajuste de inventario",
};

export const ETIQUETA_ESTADO: Record<EstadoTransferencia, string> = {
  borrador: "Borrador",
  listo: "Listo",
  hecho: "Hecho",
  cancelado: "Cancelado",
};

/** Clases de Tailwind para el chip de estado de una transferencia. */
export const TONO_ESTADO: Record<EstadoTransferencia, string> = {
  borrador: "bg-borde text-gris",
  listo: "bg-amber-100 text-amber-700",
  hecho: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-rose-100 text-rose-600",
};

// -----------------------------------------------------------------------------
//  Cálculos puros
// -----------------------------------------------------------------------------

/** Lo que de verdad se puede comprometer: lo que hay menos lo ya reservado. */
export function disponible(q: { cantidad: number; reservado: number }): number {
  return redondear(q.cantidad - q.reservado);
}

/** Una ubicación cuenta como stock propio solo si es interna. */
export function esUbicacionDeStock(tipo: TipoUbicacion): boolean {
  return tipo === "interna";
}

/**
 * El signo de un movimiento para una ubicación: +1 si entra, -1 si sale, 0 si
 * no la toca. La base de la doble entrada: lo que sale de una entra en la otra.
 */
export function signoParaUbicacion(mov: { ubicacionOrigenId: string; ubicacionDestinoId: string }, ubicacionId: string): number {
  if (mov.ubicacionDestinoId === ubicacionId) return 1;
  if (mov.ubicacionOrigenId === ubicacionId) return -1;
  return 0;
}

/** Suma a mano de una lista de quants (p. ej. todas las ubicaciones de un producto). */
export function sumarCantidad(quants: { cantidad: number }[]): number {
  return redondear(quants.reduce((s, q) => s + q.cantidad, 0));
}

/** Valor del inventario a costo estándar: cantidad a mano × costo del producto. */
export function valorizar(cantidad: number, costo: number): number {
  return redondear(cantidad * costo);
}

/** Cuánto falta reponer según una regla mín/máx y el disponible actual. */
export function sugerenciaDeReposicion(disp: number, regla: { minimo: number; maximo: number }): number {
  if (disp >= regla.minimo) return 0;
  const hasta = Math.max(regla.maximo, regla.minimo);
  return redondear(hasta - disp);
}

/** Días desde hoy hasta una fecha (negativo si ya pasó). null si no hay fecha. */
export function diasHasta(fecha: string | null, hoy: Date = new Date()): number | null {
  if (!fecha) return null;
  const f = new Date(fecha + "T00:00:00");
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((f.getTime() - base.getTime()) / 86_400_000);
}

export const DIAS_AVISO_VENCIMIENTO = 30;

/** Un lote está por vencer si vence dentro de la ventana de aviso (o ya venció). */
export function porVencer(fecha: string | null, hoy: Date = new Date()): boolean {
  const d = diasHasta(fecha, hoy);
  return d !== null && d <= DIAS_AVISO_VENCIMIENTO;
}

// Redondea a 3 decimales para no arrastrar basura de punto flotante en las cantidades.
export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Formatea una cantidad sin decimales de más (3 → "3", 3.5 → "3,5"). */
export function formatearCantidad(n: number): string {
  return redondear(n).toLocaleString("es-CL", { maximumFractionDigits: 3 });
}

/** Formatea un monto en pesos chilenos. */
export function formatearMonto(n: number): string {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

/** La referencia siguiente de un tipo de operación: REC00001, ENT00042… */
export function siguienteReferencia(prefijo: string, correlativo: number): string {
  return `${prefijo}${String(correlativo + 1).padStart(5, "0")}`;
}
