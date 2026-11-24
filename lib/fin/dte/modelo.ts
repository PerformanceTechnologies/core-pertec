// Facturación electrónica: el documento tributario (DTE) tal como lo entiende el SII, sin proveedor.
//
// Sin "server-only": lo usan el editor (para calcular y avisar mientras se escribe), el servidor (que es
// quien lo hace cumplir) y las pruebas (`npm run probar-dte`). Nada de base de datos ni de red acá.
//
// Los nombres de los campos siguen el formato DTE del SII (Encabezado › IdDoc / Emisor / Receptor /
// Transporte / Totales, Detalle, DscRcgGlobal, Referencia). El adaptador de cada proveedor (hoy
// SimpleFactura, lib/fin/dte/simplefactura-mapeo.ts) traduce desde aquí; si mañana se cambia de
// proveedor, esto no cambia.
//
// Montos en pesos chilenos, enteros (el SII no acepta decimales en los totales de un DTE en CLP).

import { peso } from "../reglas";
import { comunaOficial, LARGO, rutUsable } from "../../contactos-modelo";

export type Iso = string;

// ---------- Tipos de documento ---------------------------------------------------------------

/** Los que el Core emite. 39/41 (boletas) y 110+ (exportación) no aplican hoy a las empresas del grupo. */
export const TIPOS_EMITIBLES = [33, 34, 52, 56, 61] as const;
export type TipoEmitible = (typeof TIPOS_EMITIBLES)[number];
export const esTipoEmitible = (x: unknown): x is TipoEmitible => TIPOS_EMITIBLES.includes(Number(x) as TipoEmitible);

export const NOMBRE_DTE: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta electrónica",
  46: "Factura de compra electrónica",
  52: "Guía de despacho electrónica",
  56: "Nota de débito electrónica",
  61: "Nota de crédito electrónica",
  39: "Boleta electrónica",
  41: "Boleta exenta electrónica",
  110: "Factura de exportación electrónica",
};

/** Para qué sirve cada uno, en una línea (el editor la muestra al elegir el tipo). */
export const AYUDA_DTE: Record<TipoEmitible, string> = {
  33: "Venta o servicio afecto a IVA. Es la factura de todos los días.",
  34: "Venta o servicio exento de IVA (p. ej. ciertos servicios o arriendo de inmuebles sin amoblar).",
  52: "Respalda el traslado de bienes: venta con despacho, arriendo de equipos, traslado entre bodegas o faenas.",
  56: "Aumenta el monto de una factura ya emitida (intereses, cobro faltante) o anula una nota de crédito.",
  61: "Anula, rebaja o corrige una factura ya emitida.",
};

// ---------- Catálogos del SII ----------------------------------------------------------------

/** IndTraslado de la guía de despacho (obligatorio en la 52). */
export const IND_TRASLADO = [
  { codigo: 1, texto: "Operación constituye venta", ayuda: "Despacho de algo vendido; la factura puede ir después." },
  { codigo: 2, texto: "Ventas por efectuar", ayuda: "Se despacha y se vende después (p. ej. a prueba)." },
  { codigo: 3, texto: "Consignaciones", ayuda: "Queda en poder de un tercero que lo vende por ti." },
  { codigo: 4, texto: "Entrega gratuita", ayuda: "Muestras o regalos." },
  { codigo: 5, texto: "Traslado interno", ayuda: "Entre bodegas, sucursales o faenas de la misma empresa." },
  { codigo: 6, texto: "Otros traslados no venta", ayuda: "Arriendo de equipos, préstamo, envío a reparación o a mantención." },
  { codigo: 7, texto: "Guía de devolución", ayuda: "Devolución de bienes recibidos." },
  { codigo: 8, texto: "Traslado para exportación (no venta)", ayuda: "" },
  { codigo: 9, texto: "Venta para exportación", ayuda: "" },
] as const;

/** TipoDespacho de la guía (opcional): quién transporta. */
export const TIPO_DESPACHO = [
  { codigo: 1, texto: "Por cuenta del receptor" },
  { codigo: 2, texto: "Por cuenta del emisor a instalaciones del cliente" },
  { codigo: 3, texto: "Por cuenta del emisor a otras instalaciones" },
] as const;

/** CodRef de una referencia de NC/ND (qué hace sobre el documento referenciado). */
export const COD_REF = [
  { codigo: 1, texto: "Anula el documento", ayuda: "Deja sin efecto toda la factura. El monto es el total de la factura." },
  { codigo: 2, texto: "Corrige texto", ayuda: "Corrige razón social, giro, dirección u otro texto. Va sin montos." },
  { codigo: 3, texto: "Corrige montos", ayuda: "Rebaja (NC) o aumenta (ND) parte del monto." },
] as const;
export type CodRef = 1 | 2 | 3;

/**
 * TpoDocRef habituales en las referencias. Los numéricos son documentos del SII; los alfanuméricos son
 * códigos que el SII acepta para documentos comerciales (la minería exige HES y HEM en la factura).
 */
export const TIPOS_REFERENCIA = [
  { codigo: "801", texto: "Orden de compra" },
  { codigo: "HES", texto: "Hoja de entrada de servicios (HES)" },
  { codigo: "HEM", texto: "Hoja de entrada de materiales (HEM)" },
  { codigo: "802", texto: "Nota de pedido" },
  { codigo: "803", texto: "Contrato" },
  { codigo: "52", texto: "Guía de despacho" },
  { codigo: "33", texto: "Factura electrónica" },
  { codigo: "34", texto: "Factura exenta electrónica" },
  { codigo: "56", texto: "Nota de débito electrónica" },
  { codigo: "61", texto: "Nota de crédito electrónica" },
] as const;

/** FmaPago: 1 contado, 2 crédito, 3 sin costo (entrega gratuita). */
export const FORMA_PAGO = [
  { codigo: 1, texto: "Contado" },
  { codigo: 2, texto: "Crédito" },
  { codigo: 3, texto: "Sin costo" },
] as const;

// ---------- Largos del formato DTE (v2.5) ----------------------------------------------------

export const LARGO_DTE = {
  nombreItem: 80,
  descripcionItem: 1000,
  unidad: 4,
  codigoItem: 35,
  razonRef: 90,
  folioRef: 18,
  patente: 8,
  nombreChofer: 30,
  direccionDestino: 70,
  comunaDestino: 20,
  ciudadDestino: 20,
  terminosPago: 100,
  maxLineas: 60,
  maxReferencias: 40,
} as const;

// ---------- El documento ---------------------------------------------------------------------

export interface ReceptorDte {
  rut: string;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  /** «Atención A:» (nombre y teléfono). */
  contacto: string | null;
  /** Correo del «Atención A:» (sale impreso). */
  correo: string | null;
}

export interface LineaDte {
  nombre: string;
  descripcion: string | null;
  cantidad: number;
  unidad: string | null;
  /** Precio unitario neto, en pesos (puede tener decimales: el SII admite 6). */
  precio: number;
  /** 0 a 100. */
  descuentoPct: number;
  exento: boolean;
  codigo: string | null;
}

export interface ReferenciaDte {
  tipo: string;
  folio: string;
  fecha: Iso;
  /** Solo NC/ND sobre un DTE: 1 anula, 2 corrige texto, 3 corrige montos. */
  codRef: CodRef | null;
  razon: string | null;
}

export interface TransporteDte {
  patente: string | null;
  rutTransportista: string | null;
  rutChofer: string | null;
  nombreChofer: string | null;
  direccionDestino: string | null;
  comunaDestino: string | null;
  ciudadDestino: string | null;
}

export interface DocumentoDte {
  tipo: TipoEmitible;
  fechaEmision: Iso;
  /** Solo facturas y ND a crédito. */
  fechaVencimiento: Iso | null;
  formaPago: 1 | 2 | 3 | null;
  receptor: ReceptorDte;
  lineas: LineaDte[];
  /** Descuento global sobre lo afecto (porcentaje 0–100). Opcional. */
  descuentoGlobalPct: number;
  referencias: ReferenciaDte[];
  /** Guía de despacho. */
  indTraslado: number | null;
  tipoDespacho: number | null;
  transporte: TransporteDte | null;
  /** Texto libre que sale en la factura (TermPagoGlosa). */
  observaciones: string | null;
}

export interface TotalesDte {
  /** Suma afecta antes del descuento global. */
  afectoBruto: number;
  descuentoGlobal: number;
  neto: number;
  exento: number;
  iva: number;
  total: number;
}

/** Monto de una línea: cantidad × precio − descuento, a peso (MontoItem del SII). */
export function montoLinea(l: Pick<LineaDte, "cantidad" | "precio" | "descuentoPct">): number {
  const bruto = Number(l.cantidad) * Number(l.precio);
  const dcto = Math.max(0, Math.min(100, Number(l.descuentoPct) || 0));
  return peso(bruto - peso((bruto * dcto) / 100));
}

/** Descuento de una línea en pesos (DescuentoMonto). */
export function descuentoLinea(l: Pick<LineaDte, "cantidad" | "precio" | "descuentoPct">): number {
  const dcto = Math.max(0, Math.min(100, Number(l.descuentoPct) || 0));
  return peso((Number(l.cantidad) * Number(l.precio) * dcto) / 100);
}

/**
 * Totales como los calcula el SII. La factura exenta (34) no tiene neto ni IVA: todo va a exento. El
 * descuento global solo rebaja lo afecto (así lo emite el Core; un descuento sobre lo exento se pone por línea).
 */
export function calcularTotales(doc: Pick<DocumentoDte, "tipo" | "lineas" | "descuentoGlobalPct">, tasaIva: number): TotalesDte {
  const exentaEntera = doc.tipo === 34;
  let afecto = 0;
  let exento = 0;
  for (const l of doc.lineas) {
    const m = montoLinea(l);
    if (exentaEntera || l.exento) exento += m;
    else afecto += m;
  }
  const pct = Math.max(0, Math.min(100, Number(doc.descuentoGlobalPct) || 0));
  const descuentoGlobal = exentaEntera ? 0 : peso((afecto * pct) / 100);
  const neto = afecto - descuentoGlobal;
  const iva = exentaEntera ? 0 : peso(neto * tasaIva);
  return { afectoBruto: afecto, descuentoGlobal, neto, exento, iva, total: neto + exento + iva };
}

// ---------- Validación (lo mismo en el editor y en el servidor) -------------------------------

export interface ProblemaDte {
  campo: string;
  texto: string;
}

const vacio = (s: string | null | undefined) => !s || !s.trim();

/** ¿Es una referencia a otro DTE (lo que NC/ND exigen)? */
const esRefDte = (r: ReferenciaDte) => ["33", "34", "52", "56", "61", "46"].includes(r.tipo);

/**
 * Todo lo que impide emitir el documento, en el orden del formulario. Vacío = se puede emitir.
 * `hoy` es la fecha de Santiago (inyectable para las pruebas).
 */
export function validarDocumento(doc: DocumentoDte, hoy: Iso, tasaIva: number): ProblemaDte[] {
  const p: ProblemaDte[] = [];
  const t = doc.tipo;
  if (!esTipoEmitible(t)) p.push({ campo: "tipo", texto: "Tipo de documento no soportado." });

  // Fecha: no futura (el SII rechaza) y no más de 30 días atrás (regla del Core: evita emitir en un mes ya declarado).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.fechaEmision)) p.push({ campo: "fechaEmision", texto: "Falta la fecha de emisión." });
  else {
    if (doc.fechaEmision > hoy) p.push({ campo: "fechaEmision", texto: "La fecha de emisión no puede ser futura." });
    const dias = (Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${doc.fechaEmision}T12:00:00Z`)) / 86_400_000;
    if (dias > 30) p.push({ campo: "fechaEmision", texto: "La fecha de emisión tiene más de 30 días: revisa con contabilidad (puede ser un período ya declarado)." });
  }
  if (doc.fechaVencimiento && doc.fechaVencimiento < doc.fechaEmision) p.push({ campo: "fechaVencimiento", texto: "El vencimiento es anterior a la emisión." });

  // Receptor (área Receptor del SII).
  const r = doc.receptor;
  if (vacio(r.rut)) p.push({ campo: "receptor.rut", texto: "Falta el RUT del receptor." });
  else if (!rutUsable(r.rut)) p.push({ campo: "receptor.rut", texto: "El RUT del receptor no es válido." });
  if (vacio(r.razonSocial)) p.push({ campo: "receptor.razonSocial", texto: "Falta la razón social del receptor." });
  else if (r.razonSocial.length > LARGO.razonSocial) p.push({ campo: "receptor.razonSocial", texto: `La razón social pasa de ${LARGO.razonSocial} caracteres.` });
  // Factura y guía exigen giro, dirección y comuna; en NC/ND son opcionales para el SII.
  const exigeDomicilio = t === 33 || t === 34 || t === 52;
  if (exigeDomicilio) {
    if (vacio(r.giro)) p.push({ campo: "receptor.giro", texto: "Falta el giro del receptor (complétalo en Contactos)." });
    if (vacio(r.direccion)) p.push({ campo: "receptor.direccion", texto: "Falta la dirección del receptor (complétala en Contactos)." });
    if (vacio(r.comuna)) p.push({ campo: "receptor.comuna", texto: "Falta la comuna del receptor (complétala en Contactos)." });
  }
  if (r.giro && r.giro.length > LARGO.giro) p.push({ campo: "receptor.giro", texto: `El giro pasa de ${LARGO.giro} caracteres: acórtalo en Contactos.` });
  if (r.direccion && r.direccion.length > LARGO.direccion) p.push({ campo: "receptor.direccion", texto: `La dirección pasa de ${LARGO.direccion} caracteres.` });
  if (r.comuna && !comunaOficial(r.comuna)) p.push({ campo: "receptor.comuna", texto: `«${r.comuna}» no es una comuna de Chile.` });

  // Líneas.
  const correccionTexto = (t === 61 || t === 56) && doc.referencias.some((x) => x.codRef === 2);
  if (doc.lineas.length === 0) p.push({ campo: "lineas", texto: "Agrega al menos una línea." });
  if (doc.lineas.length > LARGO_DTE.maxLineas) p.push({ campo: "lineas", texto: `El SII admite hasta ${LARGO_DTE.maxLineas} líneas por documento.` });
  doc.lineas.forEach((l, i) => {
    const n = i + 1;
    if (vacio(l.nombre)) p.push({ campo: `lineas.${i}.nombre`, texto: `Línea ${n}: falta el nombre.` });
    else if (l.nombre.length > LARGO_DTE.nombreItem) p.push({ campo: `lineas.${i}.nombre`, texto: `Línea ${n}: el nombre pasa de ${LARGO_DTE.nombreItem} caracteres (usa la descripción para el detalle).` });
    if (l.descripcion && l.descripcion.length > LARGO_DTE.descripcionItem) p.push({ campo: `lineas.${i}.descripcion`, texto: `Línea ${n}: la descripción pasa de ${LARGO_DTE.descripcionItem} caracteres.` });
    if (l.unidad && l.unidad.length > LARGO_DTE.unidad) p.push({ campo: `lineas.${i}.unidad`, texto: `Línea ${n}: la unidad admite ${LARGO_DTE.unidad} caracteres (UN, HR, DIA, MES, KG…).` });
    if (!(Number(l.cantidad) > 0) && !correccionTexto) p.push({ campo: `lineas.${i}.cantidad`, texto: `Línea ${n}: la cantidad debe ser mayor que cero.` });
    if (Number(l.precio) < 0) p.push({ campo: `lineas.${i}.precio`, texto: `Línea ${n}: el precio no puede ser negativo.` });
    if (Number(l.descuentoPct) < 0 || Number(l.descuentoPct) > 100) p.push({ campo: `lineas.${i}.descuentoPct`, texto: `Línea ${n}: el descuento va de 0 a 100 %.` });
    if (t === 34 && !l.exento) {
      /* en la 34 todo es exento: se fuerza al armar; no es error */
    }
  });

  const tot = calcularTotales(doc, tasaIva);
  // Una guía de traslado que no es venta puede ir sin valores; una corrección de texto, sin montos. Lo demás, con monto.
  const guiaSinVenta = t === 52 && doc.indTraslado !== null && doc.indTraslado !== 1;
  if (tot.total <= 0 && !guiaSinVenta && !correccionTexto) p.push({ campo: "lineas", texto: "El documento no puede quedar en cero." });
  if (t === 33 && tot.neto <= 0) p.push({ campo: "lineas", texto: "Una factura afecta necesita al menos una línea afecta a IVA. Si todo es exento, usa la factura exenta (34)." });

  // Referencias.
  if (doc.referencias.length > LARGO_DTE.maxReferencias) p.push({ campo: "referencias", texto: `Máximo ${LARGO_DTE.maxReferencias} referencias.` });
  doc.referencias.forEach((x, i) => {
    const n = i + 1;
    if (vacio(x.tipo)) p.push({ campo: `referencias.${i}.tipo`, texto: `Referencia ${n}: falta el tipo.` });
    if (vacio(x.folio)) p.push({ campo: `referencias.${i}.folio`, texto: `Referencia ${n}: falta el folio o número.` });
    else if (x.folio.length > LARGO_DTE.folioRef) p.push({ campo: `referencias.${i}.folio`, texto: `Referencia ${n}: el número pasa de ${LARGO_DTE.folioRef} caracteres.` });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.fecha ?? "")) p.push({ campo: `referencias.${i}.fecha`, texto: `Referencia ${n}: falta la fecha.` });
    if (x.razon && x.razon.length > LARGO_DTE.razonRef) p.push({ campo: `referencias.${i}.razon`, texto: `Referencia ${n}: la razón pasa de ${LARGO_DTE.razonRef} caracteres.` });
  });
  if (t === 61 || t === 56) {
    const refDte = doc.referencias.filter(esRefDte);
    if (refDte.length === 0) p.push({ campo: "referencias", texto: "Una nota de crédito o débito tiene que referenciar el documento que modifica." });
    for (const x of refDte) {
      if (!x.codRef) p.push({ campo: "referencias", texto: "Indica qué hace la nota: anula, corrige texto o corrige montos." });
      if (vacio(x.razon)) p.push({ campo: "referencias", texto: "Escribe la razón de la nota (sale impresa y la ve el cliente)." });
    }
  }

  // Guía.
  if (t === 52) {
    if (!doc.indTraslado || !IND_TRASLADO.some((x) => x.codigo === doc.indTraslado)) p.push({ campo: "indTraslado", texto: "Indica el motivo del traslado." });
    if (doc.tipoDespacho !== null && !TIPO_DESPACHO.some((x) => x.codigo === doc.tipoDespacho)) p.push({ campo: "tipoDespacho", texto: "Tipo de despacho inválido." });
    const tr = doc.transporte;
    // Res. Ex. SII 154/2025: si despacha el emisor (2 o 3), el RUT del transportista es obligatorio (SimpleFactura lo exige).
    if ((doc.tipoDespacho === 2 || doc.tipoDespacho === 3) && !tr?.rutTransportista?.trim()) {
      p.push({ campo: "transporte.rutTransportista", texto: "Si despacha la empresa, falta el RUT del transportista (el tuyo si es camión propio)." });
    }
    if (tr) {
      if (tr.patente && tr.patente.replace(/[\s-]/g, "").length > LARGO_DTE.patente) p.push({ campo: "transporte.patente", texto: "La patente es muy larga." });
      if (tr.rutChofer && !rutUsable(tr.rutChofer)) p.push({ campo: "transporte.rutChofer", texto: "El RUT del chofer no es válido." });
      if (tr.rutTransportista && !rutUsable(tr.rutTransportista)) p.push({ campo: "transporte.rutTransportista", texto: "El RUT del transportista no es válido." });
      if (tr.rutChofer && vacio(tr.nombreChofer)) p.push({ campo: "transporte.nombreChofer", texto: "Con RUT de chofer, falta su nombre." });
      if (tr.comunaDestino && !comunaOficial(tr.comunaDestino)) p.push({ campo: "transporte.comunaDestino", texto: `«${tr.comunaDestino}» no es una comuna de Chile.` });
    }
  }
  if (doc.observaciones && doc.observaciones.length > LARGO_DTE.terminosPago) p.push({ campo: "observaciones", texto: `Las observaciones admiten ${LARGO_DTE.terminosPago} caracteres.` });
  return p;
}

/** Normaliza lo que llega del formulario: recorta textos, fuerza exento en la 34 y limpia vacíos. */
export function normalizarDocumento(doc: DocumentoDte): DocumentoDte {
  const txt = (s: string | null | undefined, max: number) => {
    const v = (s ?? "").replace(/\s+/g, " ").trim();
    return v ? v.slice(0, max) : null;
  };
  const transporte = doc.tipo === 52 && doc.transporte ? {
    patente: txt(doc.transporte.patente?.toUpperCase().replace(/[\s.-]/g, ""), LARGO_DTE.patente),
    rutTransportista: txt(doc.transporte.rutTransportista, 12),
    rutChofer: txt(doc.transporte.rutChofer, 12),
    nombreChofer: txt(doc.transporte.nombreChofer, LARGO_DTE.nombreChofer),
    direccionDestino: txt(doc.transporte.direccionDestino, LARGO_DTE.direccionDestino),
    comunaDestino: txt(doc.transporte.comunaDestino, LARGO_DTE.comunaDestino),
    ciudadDestino: txt(doc.transporte.ciudadDestino, LARGO_DTE.ciudadDestino),
  } : null;
  const transporteVacio = transporte && Object.values(transporte).every((v) => v === null);
  return {
    ...doc,
    fechaVencimiento: doc.tipo === 52 ? null : doc.fechaVencimiento || null,
    lineas: doc.lineas.map((l) => ({
      nombre: (l.nombre ?? "").replace(/\s+/g, " ").trim(),
      descripcion: (l.descripcion ?? "").trim() || null,
      cantidad: Number(l.cantidad) || 0,
      unidad: txt(l.unidad?.toUpperCase(), LARGO_DTE.unidad),
      precio: Math.max(0, Number(l.precio) || 0),
      descuentoPct: Math.max(0, Math.min(100, Number(l.descuentoPct) || 0)),
      exento: doc.tipo === 34 ? true : Boolean(l.exento),
      codigo: txt(l.codigo, LARGO_DTE.codigoItem),
    })),
    referencias: doc.referencias
      .map((r) => ({ tipo: (r.tipo ?? "").trim(), folio: (r.folio ?? "").trim(), fecha: r.fecha, codRef: r.codRef ? (Number(r.codRef) as CodRef) : null, razon: txt(r.razon, LARGO_DTE.razonRef) }))
      .filter((r) => r.tipo || r.folio),
    indTraslado: doc.tipo === 52 ? doc.indTraslado : null,
    tipoDespacho: doc.tipo === 52 ? doc.tipoDespacho : null,
    transporte: transporteVacio ? null : transporte,
    observaciones: txt(doc.observaciones, LARGO_DTE.terminosPago),
  };
}

/** Un documento vacío del tipo pedido, listo para el editor. */
export function documentoVacio(tipo: TipoEmitible, hoy: Iso): DocumentoDte {
  return {
    tipo,
    fechaEmision: hoy,
    fechaVencimiento: null,
    formaPago: tipo === 52 ? null : 2,
    receptor: { rut: "", razonSocial: "", giro: null, direccion: null, comuna: null, ciudad: null, contacto: null, correo: null },
    lineas: [],
    descuentoGlobalPct: 0,
    referencias: [],
    indTraslado: tipo === 52 ? 1 : null,
    tipoDespacho: null,
    transporte: null,
    observaciones: null,
  };
}

// ---------- Estados de la emisión ------------------------------------------------------------

/**
 * La vida de una emisión en el Core:
 *   borrador  → se guarda sin mandar nada (se puede editar o descartar)
 *   enviando  → se llamó al proveedor y aún no hay respuesta (si se corta, NO se reintenta a ciegas: se consulta)
 *   emitido   → el proveedor devolvió folio (y el documento quedó en fin_documentos)
 *   error     → el proveedor rechazó; el borrador queda para corregir
 *   descartado→ borrador que no se emitirá
 */
export const ESTADOS_EMISION = ["borrador", "enviando", "emitido", "error", "descartado"] as const;
export type EstadoEmision = (typeof ESTADOS_EMISION)[number];

/** Estado del documento en el SII, normalizado desde lo que diga el proveedor. */
export type EstadoSii = "pendiente" | "aceptado" | "aceptado_reparos" | "rechazado" | "desconocido";

export const ETIQUETA_ESTADO_SII: Record<EstadoSii, string> = {
  pendiente: "Enviado al SII",
  aceptado: "Aceptado por el SII",
  aceptado_reparos: "Aceptado con reparos",
  rechazado: "Rechazado por el SII",
  desconocido: "Sin estado",
};

/** Normaliza el texto de estado que devuelva el proveedor (o el SII) a uno de los nuestros. */
export function estadoSiiDesde(texto: string | null | undefined): EstadoSii {
  const s = (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!s) return "desconocido";
  if (/repar/.test(s)) return "aceptado_reparos";
  // «Documento Rechazado», «Mal generado», «Envío no llegó al SII»: hay que corregir o reenviar.
  if (/rechaz|mal generado|no llego|rch|rfr|rct|error/.test(s)) return "rechazado";
  if (/acept|aprob|dok|epr|rlv|valid/.test(s)) return "aceptado";
  // «Emisión de Documento», «Documento Enviado al SII», «Enviado a Cliente», trackId recibido…
  if (/recib|envi|emisi|proces|pend|rsc|rpr|rec\b/.test(s)) return "pendiente";
  return "desconocido";
}

// ---------- Recibidos: acuse y reclamo (Ley 19.983) -------------------------------------------

/**
 * Lo que se le puede responder al SII sobre una factura recibida, dentro de los 8 días desde su recepción:
 *   ACD acepta el contenido · ERM otorga recibo de mercaderías o servicios (deja la factura con mérito ejecutivo)
 *   RCD reclama el contenido · RFP reclama falta parcial · RFT reclama falta total
 */
export const ACCIONES_RECIBIDO = [
  { codigo: "ACD", texto: "Aceptar contenido", reclamo: false },
  { codigo: "ERM", texto: "Acuse de recibo (mercaderías o servicios)", reclamo: false }, // SimpleFactura no lo expone: se registra en el SII
  { codigo: "RCD", texto: "Reclamar contenido", reclamo: true },
  { codigo: "RFP", texto: "Reclamar falta parcial", reclamo: true },
  { codigo: "RFT", texto: "Reclamar falta total", reclamo: true },
] as const;
export type AccionRecibido = (typeof ACCIONES_RECIBIDO)[number]["codigo"];
export const esAccionRecibido = (x: unknown): x is AccionRecibido => ACCIONES_RECIBIDO.some((a) => a.codigo === x);

// ---------- Cesión (factoring electrónico, AEC) -----------------------------------------------

export interface PersonaAutorizada {
  rut: string;
  nombre: string;
  correo: string;
}

export interface CesionDte {
  /** Factura que se cede: factura electrónica (33) a crédito, emitida por la empresa. */
  tipoDte: 33;
  folio: string;
  /** SimpleFactura cede el TOTAL de la factura (no admite cesión parcial): este monto es informativo. */
  montoCesion: number;
  /** El factor (cesionario). Si no está registrado en SimpleFactura, el Core lo registra antes de ceder. */
  cesionarioRut: string;
  cesionarioRazonSocial: string;
  cesionarioDireccion: string;
  cesionarioCorreo: string;
  /** Quien firma la cesión por la empresa (debe tener el certificado digital cargado en SimpleFactura). */
  personaAutorizada: PersonaAutorizada;
  /** Correo del deudor (el cliente que pagará al factor): recibe copia de la cesión. */
  correoDeudor: string;
  otrasCondiciones: string | null;
}

const correoOk = (c: string | null | undefined) => Boolean(c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));

/**
 * Lo que la ley y SimpleFactura exigen para ceder una factura (Ley 19.983):
 *  · factura electrónica (33) emitida por la empresa, vigente, a crédito y no cedida antes;
 *  · se cede el total (SimpleFactura no admite cesión parcial);
 *  · el cesionario necesita RUT, razón social, dirección y correo; la persona autorizada, RUT, nombre y correo;
 *  · el deudor (cliente) necesita correo para recibir la notificación.
 * El acuse de recibo (o 8 días sin reclamo) lo valida el SII al registrar la cesión: aquí solo se avisa.
 */
export function validarCesion(c: CesionDte, total: number): ProblemaDte[] {
  const p: ProblemaDte[] = [];
  if (c.tipoDte !== 33) p.push({ campo: "tipoDte", texto: "Solo se ceden facturas electrónicas (33)." });
  if (vacio(c.folio)) p.push({ campo: "folio", texto: "Falta el folio." });
  if (!(total > 0)) p.push({ campo: "montoCesion", texto: "La factura no tiene monto." });
  if (c.montoCesion !== total) p.push({ campo: "montoCesion", texto: "Se cede el total de la factura (SimpleFactura no admite cesión parcial)." });
  if (vacio(c.cesionarioRut) || !rutUsable(c.cesionarioRut)) p.push({ campo: "cesionarioRut", texto: "El RUT del factor no es válido." });
  if (vacio(c.cesionarioRazonSocial)) p.push({ campo: "cesionarioRazonSocial", texto: "Falta la razón social del factor." });
  if (vacio(c.cesionarioDireccion)) p.push({ campo: "cesionarioDireccion", texto: "Falta la dirección del factor." });
  if (!correoOk(c.cesionarioCorreo)) p.push({ campo: "cesionarioCorreo", texto: "Falta un correo válido del factor." });
  if (vacio(c.personaAutorizada?.rut) || !rutUsable(c.personaAutorizada.rut)) p.push({ campo: "personaAutorizada", texto: "Falta el RUT de la persona autorizada a ceder (Configuración)." });
  if (vacio(c.personaAutorizada?.nombre)) p.push({ campo: "personaAutorizada", texto: "Falta el nombre de la persona autorizada a ceder (Configuración)." });
  if (!correoOk(c.personaAutorizada?.correo)) p.push({ campo: "personaAutorizada", texto: "Falta el correo de la persona autorizada a ceder (Configuración)." });
  if (!correoOk(c.correoDeudor)) p.push({ campo: "correoDeudor", texto: "Falta el correo del cliente (deudor) para notificarle la cesión." });
  return p;
}

// ---------- Ayudas para armar desde el Core ----------------------------------------------------

/** El vencimiento a partir de la condición de pago (días); null si es contado. */
export function vencimientoDesde(fechaEmision: Iso, dias: number | null): Iso | null {
  if (!dias || dias <= 0) return null;
  return new Date(Date.parse(`${fechaEmision}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Las referencias de un documento que nace de hitos, sin repetir:
 *  · la OC del cliente (801) y, en facturas, la HES;
 *  · en facturas, las guías de despacho con que ya se despachó (52): el SII espera que la factura de una venta
 *    despachada con guía la referencie;
 *  · si ningún hito tiene OC, la cotización aceptada (802 «Nota de pedido», el código del SII más cercano), para que
 *    el cliente sepa a qué corresponde lo despachado o facturado aunque la OC no haya llegado.
 */
export function referenciasDeHitos(
  hitos: { ocClienteNumero: string | null; ocClienteFecha: Iso | null; hesNumero: string | null }[],
  hoy: Iso,
  extra: { paraGuia?: boolean; guias?: { folio: string; fecha: Iso }[]; cotizaciones?: { numero: string; fecha: Iso }[] } = {},
): ReferenciaDte[] {
  const out: ReferenciaDte[] = [];
  const visto = new Set<string>();
  const agregar = (r: ReferenciaDte) => {
    const k = `${r.tipo}|${r.folio}`;
    if (!r.folio || visto.has(k)) return;
    visto.add(k);
    out.push(r);
  };
  for (const h of hitos) if (h.ocClienteNumero) agregar({ tipo: "801", folio: h.ocClienteNumero, fecha: h.ocClienteFecha ?? hoy, codRef: null, razon: null });
  if (!extra.paraGuia) for (const h of hitos) if (h.hesNumero) agregar({ tipo: "HES", folio: h.hesNumero, fecha: hoy, codRef: null, razon: null });
  if (!extra.paraGuia) for (const g of extra.guias ?? []) agregar({ tipo: "52", folio: g.folio, fecha: g.fecha, codRef: null, razon: `Guía de despacho N° ${g.folio}`.slice(0, 90) });
  if (!hitos.some((h) => h.ocClienteNumero)) for (const c of extra.cotizaciones ?? []) agregar({ tipo: "802", folio: c.numero.slice(0, 18), fecha: c.fecha, codRef: null, razon: `Cotización ${c.numero}`.slice(0, 90) });
  return out;
}

/** Texto corto de un documento para listas y auditoría: «Factura electrónica N° 1234». */
export function nombreCorto(tipo: number, folio: string | number | null): string {
  return `${NOMBRE_DTE[tipo] ?? `DTE ${tipo}`}${folio ? ` N° ${folio}` : ""}`;
}
