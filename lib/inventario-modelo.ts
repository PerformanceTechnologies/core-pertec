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
export type MetodoCosto = "estandar" | "promedio";
export type Seguimiento = "ninguno" | "lote" | "serie";
/** Si el producto está en condiciones de usarse (una herramienta en reparación está «no operativo»). */
export type EstadoOperativo = "operativo" | "no_operativo";
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
  marca: string | null;
  descripcion: string | null;
  categoriaId: string | null;
  unidadId: string | null;
  tipo: TipoProducto;
  seguimiento: Seguimiento;
  costo: number;
  metodoCosto: MetodoCosto;
  precio: number;
  /** false = archivado: no sale en listados ni selectores y no admite movimientos nuevos. */
  activo: boolean;
  /** Cuándo y quién lo archivó (vacíos si está activo o se desactivó antes de registrarlo). */
  archivadoEn: string | null;
  archivadoPor: string | null;
  /** Bodega (ubicación interna) por omisión. */
  ubicacionId: string | null;
  requiereCertificacion: boolean;
  certificadoNombre: string | null;
  /** Hay documento subido (la ruta no sale del servidor). */
  tieneCertificado: boolean;
  certificadoVence: string | null;
  /** Cuántas fotos tiene (las rutas no salen del servidor). */
  cantidadFotos: number;
  /** Vencimiento del producto en sí (opcional). */
  fechaVencimiento: string | null;
  estadoOperativo: EstadoOperativo;
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
  /** Si es el saldo de una entrega parcial, la transferencia original. */
  backorderDe: string | null;
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

export const ETIQUETA_ESTADO_OPERATIVO: Record<EstadoOperativo, string> = {
  operativo: "Operativo",
  no_operativo: "No operativo",
};

export function esEstadoOperativo(v: unknown): v is EstadoOperativo {
  return v === "operativo" || v === "no_operativo";
}

export const ETIQUETA_SEGUIMIENTO: Record<Seguimiento, string> = {
  ninguno: "Sin seguimiento",
  lote: "Por lote",
  serie: "Por número de serie",
};

export const ETIQUETA_METODO_COSTO: Record<MetodoCosto, string> = {
  estandar: "Estándar (fijo)",
  promedio: "Costo promedio (AVCO)",
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

/**
 * Costo promedio ponderado (AVCO) tras una recepción, como lo calcula el motor:
 * lo que había a mano a su costo más lo que entra a su costo unitario. Un a mano
 * negativo no pondera (no hay unidades reales que valorizar).
 */
export function costoPromedio(aMano: number, costoActual: number, entra: number, costoEntrada: number): number {
  const base = Math.max(aMano, 0);
  if (base + entra <= 0) return costoActual;
  return Math.round(((base * costoActual + entra * costoEntrada) / (base + entra)) * 10_000) / 10_000;
}

/** Cantidad pronosticada, como el "Forecasted" de Odoo: a mano + lo que viene - lo que sale. */
export function pronosticado(aMano: number, entrante: number, saliente: number): number {
  return redondear(aMano + entrante - saliente);
}

/** Lo que queda para el backorder de una línea validada en forma parcial. */
export function saldoParaBackorder(cantidad: number, hecha: number): number {
  return redondear(Math.max(cantidad - hecha, 0));
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

// -----------------------------------------------------------------------------
//  Certificación y vencimiento del producto
// -----------------------------------------------------------------------------

export type EstadoCertificado = "no_aplica" | "falta" | "sin_fecha" | "vencido" | "por_vencer" | "vigente";

/** En qué está el certificado de un producto que lo requiere. */
export function estadoCertificado(
  p: { requiereCertificacion: boolean; tieneCertificado: boolean; certificadoVence: string | null },
  hoy: Date = new Date(),
): EstadoCertificado {
  if (!p.requiereCertificacion) return "no_aplica";
  if (!p.tieneCertificado) return "falta";
  if (!p.certificadoVence) return "sin_fecha";
  const d = diasHasta(p.certificadoVence, hoy)!;
  if (d < 0) return "vencido";
  if (d <= DIAS_AVISO_VENCIMIENTO) return "por_vencer";
  return "vigente";
}

export const ETIQUETA_CERTIFICADO: Record<EstadoCertificado, { texto: string; tono: string } | null> = {
  no_aplica: null,
  falta: { texto: "Falta certificado", tono: "bg-rose-500/10 text-rose-600" },
  sin_fecha: { texto: "Certificado sin fecha", tono: "bg-amber-500/10 text-amber-700" },
  vencido: { texto: "Certificado vencido", tono: "bg-rose-500/10 text-rose-600" },
  por_vencer: { texto: "Certificado por vencer", tono: "bg-amber-500/10 text-amber-700" },
  vigente: { texto: "Certificado vigente", tono: "bg-emerald-500/10 text-emerald-700" },
};

/** Lo que se acepta como certificado: MIME → extensión. */
export const TIPOS_CERTIFICADO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// -----------------------------------------------------------------------------
//  Valorización detallada (dashboard): por bodega, por categoría y ABC
// -----------------------------------------------------------------------------

/** Una cantidad a mano valorizada: un producto en una bodega. */
export interface LineaValor {
  productoId: string;
  nombre: string;
  sku: string | null;
  categoria: string;
  bodegaId: string;
  bodega: string;
  cantidad: number;
  costo: number;
  valor: number;
}

export interface GrupoValor {
  id: string;
  nombre: string;
  valor: number;
  unidades: number;
  productos: number;
  /** Fracción del total (0 a 1). */
  participacion: number;
}

export interface ProductoValor {
  productoId: string;
  nombre: string;
  sku: string | null;
  categoria: string;
  costo: number;
  cantidad: number;
  valor: number;
  participacion: number;
  /** Acumulado del ranking, para la clase ABC. */
  acumulado: number;
  clase: "A" | "B" | "C";
  /** Valor por bodega (id → valor). */
  porBodega: Record<string, number>;
}

export interface ResumenValorizacion {
  total: number;
  unidades: number;
  porBodega: GrupoValor[];
  porCategoria: GrupoValor[];
  productos: ProductoValor[];
  abc: Record<"A" | "B" | "C", { productos: number; valor: number }>;
  /** Productos con stock pero costo 0: no suman valor y conviene revisarlos. */
  sinCosto: number;
}

function agrupar(lineas: LineaValor[], clave: (l: LineaValor) => [string, string], total: number): GrupoValor[] {
  const m = new Map<string, { nombre: string; valor: number; unidades: number; productos: Set<string> }>();
  for (const l of lineas) {
    const [id, nombre] = clave(l);
    const g = m.get(id) ?? { nombre, valor: 0, unidades: 0, productos: new Set<string>() };
    g.valor += l.valor;
    g.unidades += l.cantidad;
    g.productos.add(l.productoId);
    m.set(id, g);
  }
  return [...m.entries()]
    .map(([id, g]) => ({
      id, nombre: g.nombre, valor: redondear(g.valor), unidades: redondear(g.unidades), productos: g.productos.size,
      participacion: total > 0 ? g.valor / total : 0,
    }))
    .sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Arma el dashboard de valorización. Clase ABC como se usa en bodega: A son los productos
 * que juntan el primer 80% del valor, B hasta el 95% y C el resto.
 */
export function resumirValorizacion(lineas: LineaValor[]): ResumenValorizacion {
  const conStock = lineas.filter((l) => l.cantidad > 0);
  const total = redondear(conStock.reduce((t, l) => t + l.valor, 0));

  const porProducto = new Map<string, ProductoValor>();
  for (const l of conStock) {
    const p = porProducto.get(l.productoId) ?? {
      productoId: l.productoId, nombre: l.nombre, sku: l.sku, categoria: l.categoria, costo: l.costo,
      cantidad: 0, valor: 0, participacion: 0, acumulado: 0, clase: "C" as const, porBodega: {},
    };
    p.cantidad = redondear(p.cantidad + l.cantidad);
    p.valor = redondear(p.valor + l.valor);
    p.porBodega[l.bodegaId] = redondear((p.porBodega[l.bodegaId] ?? 0) + l.valor);
    porProducto.set(l.productoId, p);
  }

  let acumulado = 0;
  const productos = [...porProducto.values()]
    .sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => {
      const participacion = total > 0 ? p.valor / total : 0;
      // La clase se decide por dónde EMPIEZA el producto en el acumulado: el que cruza el 80% sigue siendo A.
      const clase: "A" | "B" | "C" = acumulado < 0.8 ? "A" : acumulado < 0.95 ? "B" : "C";
      acumulado += participacion;
      return { ...p, participacion, acumulado, clase };
    });

  const abc = { A: { productos: 0, valor: 0 }, B: { productos: 0, valor: 0 }, C: { productos: 0, valor: 0 } };
  for (const p of productos) {
    if (p.valor <= 0) continue;
    abc[p.clase].productos++;
    abc[p.clase].valor = redondear(abc[p.clase].valor + p.valor);
  }

  return {
    total,
    unidades: redondear(conStock.reduce((t, l) => t + l.cantidad, 0)),
    porBodega: agrupar(conStock, (l) => [l.bodegaId, l.bodega], total),
    porCategoria: agrupar(conStock, (l) => [l.categoria, l.categoria], total),
    productos,
    abc,
    sinCosto: productos.filter((p) => p.costo <= 0).length,
  };
}

// ---------- Fotos del producto -------------------------------------------------

/** Lo que se guarda en inv_productos.fotos (jsonb): las dos versiones en SharePoint. */
export interface FotoGuardada {
  /** Para mirarla: hasta 1600 px. */
  ruta: string;
  /** Para listas y fichas: 240 px. */
  miniatura: string;
  nombre: string;
}

/** Lo que llega a la pantalla: enlaces firmados, nunca las rutas. */
export interface FotoProducto {
  indice: number;
  url: string;
  miniatura: string;
  nombre: string;
}

export const MAX_FOTOS_PRODUCTO = 8;
export const TIPOS_FOTO_PRODUCTO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
