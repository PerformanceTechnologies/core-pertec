import type { FilaFactura } from "./datos";
import type { FacturaSiiFila } from "@/lib/finanzas";

// El cruce entre las facturas de Odoo y el registro del SII que ya trae Panel Finanzas.
//
// Por qué existe: Odoo sabe si el DTE se envió y si le llegó al receptor
// (l10n_cl_dte_status), pero NO sabe si el cliente lo aceptó o lo reclamó -- para Odoo
// una factura reclamada por el cliente sigue diciendo "Aceptado por el SII", porque eso
// solo habla del envío. El estado que manda es el del registro del SII, que Panel
// Finanzas ya lee y guarda en facturas_sii. Así que el estado se saca de ahí y el de
// Odoo queda como dato secundario.
//
// Todo puro (ver scripts/probar-panel-odoo.mts): la carga de las dos listas la hace el
// componente de servidor.

/**
 * La empresa cuyo registro del SII se lee.
 *
 * facturas_sii son los documentos de Performance Technologies SpA: es su clave del portal
 * MIPYME la que se usa para leer el RCV. Para las otras dos empresas de Odoo no hay
 * registro con el que cruzar, y hay que decirlo en pantalla en vez de mostrar todo
 * "no está en el SII", que se leería como un problema.
 */
export const COMPANIA_CON_SII = 1;

export interface DatosSii {
  estado: string;
  razon_social: string | null;
  fecha_docto: string | null;
  fecha_recepcion: string | null;
  fecha_acuse: string | null;
  fecha_reclamo: string | null;
  monto_total: number | null;
  monto_neto: number | null;
  monto_exento: number | null;
  monto_iva: number | null;
  periodo: string;
}

export interface FacturaCruzada extends FilaFactura {
  /** La fila del registro del SII, si se encontró por folio. */
  sii: DatosSii | null;
  /** SII menos Odoo. 0 = calzan; null = no hay con qué comparar. */
  diferenciaDeMonto: number | null;
}

/** Un peso de diferencia es redondeo del IVA, no un descuadre. */
export const TOLERANCIA_DE_MONTO = 1;

export function tipoSiiDe(moveType: string): "venta" | "compra" | null {
  if (moveType === "out_invoice" || moveType === "out_refund") return "venta";
  if (moveType === "in_invoice" || moveType === "in_refund") return "compra";
  return null;
}

/** Sin puntos, sin espacios y con la K mayúscula: "76.929.210-1" y "77590822-k" tienen que cruzar. */
export function normalizarRut(rut: string | null): string {
  return (rut ?? "").replace(/[.\s]/g, "").toUpperCase();
}

/**
 * La llave del cruce: tipo + código de DTE + folio + RUT.
 *
 * Los cuatro, no solo el folio: los folios de venta y de compra son series distintas, y
 * dentro de las ventas una factura 33 y una nota de crédito 61 pueden compartir número.
 * Sin folio no hay cruce posible -- devuelve null y la factura queda como "no está en el
 * registro", que es la verdad.
 */
export function claveCruce(
  tipo: "venta" | "compra" | null,
  codigoDte: number | null,
  folio: number | null,
  rut: string | null,
): string | null {
  if (!tipo || folio === null || codigoDte === null) return null;
  return `${tipo}|${codigoDte}|${folio}|${normalizarRut(rut)}`;
}

function claveDeFilaSii(f: FacturaSiiFila): string {
  return `${f.tipo_documento}|${f.codigo_dte}|${f.folio}|${normalizarRut(f.rut_contraparte)}`;
}

function datosDe(f: FacturaSiiFila): DatosSii {
  // El IVA del registro viene partido en recuperable y no recuperable; para mirar la
  // factura los dos son IVA.
  const iva = (f.monto_iva_recuperable ?? 0) + (f.monto_iva_no_recuperable ?? 0);
  return {
    estado: f.estado,
    razon_social: f.razon_social,
    fecha_docto: f.fecha_docto,
    fecha_recepcion: f.fecha_recepcion,
    fecha_acuse: f.fecha_acuse,
    fecha_reclamo: f.fecha_reclamo,
    monto_total: f.monto_total === null ? null : Number(f.monto_total),
    monto_neto: f.monto_neto === null ? null : Number(f.monto_neto),
    monto_exento: f.monto_exento === null ? null : Number(f.monto_exento),
    monto_iva: iva === 0 ? null : iva,
    periodo: f.periodo,
  };
}

export function cruzarConSii(facturas: FilaFactura[], filasSii: FacturaSiiFila[]): FacturaCruzada[] {
  const porClave = new Map<string, FacturaSiiFila>();
  for (const fila of filasSii) {
    // Si el mismo folio aparece dos veces (una relectura de otro período), gana la
    // primera: listarFacturasSii viene ordenado y el upsert deja una sola fila por
    // documento, así que esto es una red y no una decisión.
    const clave = claveDeFilaSii(fila);
    if (!porClave.has(clave)) porClave.set(clave, fila);
  }

  return facturas.map((f) => {
    const clave = claveCruce(tipoSiiDe(f.move_type), f.codigo_dte, f.folio, f.rut_contraparte);
    const fila = clave ? porClave.get(clave) : undefined;
    const sii = fila ? datosDe(fila) : null;
    return {
      ...f,
      sii,
      diferenciaDeMonto: sii && sii.monto_total !== null ? sii.monto_total - f.monto_total : null,
    };
  });
}

/** El estado que se muestra: el del SII si está, y si no lo hay se dice que no está. */
export function estadoQueManda(f: FacturaCruzada): string | null {
  return f.sii?.estado ?? null;
}

export function hayDescuadreDeMonto(f: FacturaCruzada): boolean {
  return f.diferenciaDeMonto !== null && Math.abs(f.diferenciaDeMonto) > TOLERANCIA_DE_MONTO;
}

/**
 * Una factura contabilizada que el SII no tiene.
 *
 * Solo las contabilizadas: una en borrador todavía no se emitió y es normal que no esté
 * en el registro. Y solo las que tienen folio, porque sin folio el cruce nunca se
 * intentó.
 */
export function faltaEnElSii(f: FacturaCruzada): boolean {
  return f.state === "posted" && f.folio !== null && f.sii === null;
}

export interface Descuadres {
  sinRegistro: number;
  montoDistinto: number;
  reclamadas: number;
}

export function contarDescuadres(facturas: FacturaCruzada[]): Descuadres {
  return {
    sinRegistro: facturas.filter(faltaEnElSii).length,
    montoDistinto: facturas.filter(hayDescuadreDeMonto).length,
    reclamadas: facturas.filter((f) => f.sii?.estado === "reclamado").length,
  };
}
