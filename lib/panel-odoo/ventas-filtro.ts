import type { FilaVenta } from "./datos";

// Filtrado, orden y totales del detalle de Ventas y Arriendo. Todo puro y sin React (ver
// scripts/probar-ventas.mts): el componente solo dibuja lo que estas funciones devuelven.
//
// Mismo patrón que ./facturas-filtro.ts y ./crm-filtro.ts. Lo propio de acá es que en el
// mismo modelo de Odoo (sale.order) conviven tres cosas que se miran distinto: las
// cotizaciones abiertas, las ventas confirmadas y los arriendos.

export type CampoOrden =
  | "fecha_orden"
  | "monto_total"
  | "monto_por_facturar"
  | "margen_porcentaje"
  | "partner_nombre"
  | "fecha_fin_arriendo"
  | "validez_hasta";
export type Sentido = "asc" | "desc";

export interface Criterios {
  texto: string;
  estado: string;
  vendedor: string;
  desde: string;
  hasta: string;
  orden: CampoOrden;
  sentido: Sentido;
}

export const CRITERIOS_INICIALES: Criterios = {
  texto: "",
  estado: "",
  vendedor: "",
  desde: "",
  hasta: "",
  orden: "fecha_orden",
  sentido: "desc",
};

/** Días de antigüedad a partir de los cuales una cotización abierta se considera dormida. */
export const DIAS_PARA_DORMIRSE = 30;

/** Cuántos días antes del fin del arriendo se avisa. */
export const DIAS_DE_AVISO_DE_ARRIENDO = 15;

const DIA = 24 * 60 * 60 * 1000;

/** Días entre una fecha de Odoo (que puede traer hora) y hoy. Negativo si es futura. */
export function diasDesde(fecha: string | null, hoy: string): number | null {
  if (!fecha) return null;
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`)) / DIA);
}

/** Una cotización: todavía no es venta. En Odoo son los estados draft y sent. */
export function esCotizacion(v: FilaVenta): boolean {
  return v.estado === "draft" || v.estado === "sent";
}

/** Confirmada: ya es venta. */
export function esConfirmada(v: FilaVenta): boolean {
  return v.estado === "sale";
}

/**
 * Confirmada con saldo sin facturar.
 *
 * Es el número más fuerte de esta pantalla: hoy TODAS las órdenes confirmadas están en
 * "to invoice", así que la tarjeta mostraba "Ventas (mes) $0" mientras había cientos de
 * millones vendidos y sin facturar.
 */
export function porFacturar(v: FilaVenta): boolean {
  return esConfirmada(v) && (v.monto_por_facturar ?? 0) > 0;
}

/** Cotización cuya fecha de validez ya pasó: hay que renovarla o cerrarla. */
export function cotizacionVencida(v: FilaVenta, hoy: string): boolean {
  return esCotizacion(v) && !!v.validez_hasta && v.validez_hasta < hoy;
}

/** Cotización abierta que nadie movió en un mes. */
export function cotizacionDormida(v: FilaVenta, hoy: string): boolean {
  if (!esCotizacion(v)) return false;
  const dias = diasDesde(v.fecha_orden, hoy);
  return dias !== null && dias >= DIAS_PARA_DORMIRSE;
}

/** Un arriendo en curso: confirmado y todavía no devuelto. */
export function arriendoActivo(v: FilaVenta): boolean {
  if (!v.es_arriendo) return false;
  if (v.producto_devuelto === true) return false;
  return v.estado_arriendo !== null && !["draft", "quotation", "returned", "available"].includes(v.estado_arriendo);
}

/** Arriendo activo cuya fecha de fin ya pasó. */
export function arriendoAtrasado(v: FilaVenta, hoy: string): boolean {
  if (!arriendoActivo(v)) return false;
  if ((v.dias_atraso ?? 0) > 0) return true;
  return !!v.fecha_fin_arriendo && v.fecha_fin_arriendo.slice(0, 10) < hoy;
}

/** Arriendo activo que termina dentro de los próximos días. */
export function arriendoPorVencer(v: FilaVenta, hoy: string): boolean {
  if (!arriendoActivo(v) || arriendoAtrasado(v, hoy)) return false;
  const dias = diasDesde(v.fecha_fin_arriendo, hoy);
  return dias !== null && dias <= 0 && dias >= -DIAS_DE_AVISO_DE_ARRIENDO;
}

export type GrupoDeEstado = "Comercial" | "Arriendo" | "Atención";

export const ESTADO_FILTROS: {
  valor: string;
  etiqueta: string;
  grupo: GrupoDeEstado;
  cumple: (v: FilaVenta, hoy: string) => boolean;
}[] = [
  { valor: "cotizaciones", etiqueta: "Cotizaciones abiertas", grupo: "Comercial", cumple: esCotizacion },
  { valor: "confirmadas", etiqueta: "Confirmadas", grupo: "Comercial", cumple: esConfirmada },
  { valor: "por_facturar", etiqueta: "Confirmadas por facturar", grupo: "Comercial", cumple: porFacturar },
  {
    valor: "facturadas",
    etiqueta: "Ya facturadas",
    grupo: "Comercial",
    cumple: (v) => v.estado_facturacion === "invoiced",
  },
  { valor: "ventas", etiqueta: "Solo ventas (sin arriendo)", grupo: "Comercial", cumple: (v) => !v.es_arriendo },
  { valor: "arriendos", etiqueta: "Solo arriendos", grupo: "Arriendo", cumple: (v) => v.es_arriendo },
  { valor: "arriendos_activos", etiqueta: "Arriendos en curso", grupo: "Arriendo", cumple: arriendoActivo },
  { valor: "arriendos_devueltos", etiqueta: "Arriendos devueltos", grupo: "Arriendo", cumple: (v) => v.es_arriendo && v.producto_devuelto === true },
  { valor: "con_danos", etiqueta: "Con daños", grupo: "Arriendo", cumple: (v) => v.tiene_danos === true },
  { valor: "arriendos_atrasados", etiqueta: "Arriendos pasados de fecha", grupo: "Atención", cumple: arriendoAtrasado },
  { valor: "arriendos_por_vencer", etiqueta: `Arriendos que vencen en ${DIAS_DE_AVISO_DE_ARRIENDO} días`, grupo: "Atención", cumple: arriendoPorVencer },
  { valor: "cotizaciones_vencidas", etiqueta: "Cotizaciones con validez vencida", grupo: "Atención", cumple: cotizacionVencida },
  { valor: "cotizaciones_dormidas", etiqueta: `Cotizaciones sin mover hace +${DIAS_PARA_DORMIRSE} días`, grupo: "Atención", cumple: cotizacionDormida },
  {
    valor: "margen_bajo",
    etiqueta: "Margen bajo el objetivo",
    grupo: "Atención",
    cumple: (v) => v.margen_bajo === true && v.margen_aprobado !== true,
  },
];

export const GRUPOS_DE_ESTADO: GrupoDeEstado[] = ["Comercial", "Arriendo", "Atención"];

function normalizar(valor: string): string {
  // Sin tildes ni mayúsculas: "compania" tiene que encontrar "COMPAÑÍA".
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function textoBuscable(v: FilaVenta): string {
  return [
    v.numero,
    v.partner_nombre,
    v.vendedor,
    v.equipo,
    v.referencia_cliente,
    v.origen,
    v.oportunidad,
    v.garantia_documento,
    ...(v.etiquetas ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function filtrarVentas(ventas: FilaVenta[], criterios: Criterios, hoy: string): FilaVenta[] {
  const aguja = normalizar(criterios.texto);
  const filtroEstado = ESTADO_FILTROS.find((e) => e.valor === criterios.estado);

  return ventas.filter((v) => {
    if (aguja && !normalizar(textoBuscable(v)).includes(aguja)) return false;
    if (filtroEstado && !filtroEstado.cumple(v, hoy)) return false;
    if (criterios.vendedor && (v.vendedor ?? "Sin asignar") !== criterios.vendedor) return false;
    // El rango es sobre la fecha de la ORDEN: es la que toda orden tiene.
    const fecha = v.fecha_orden?.slice(0, 10) ?? null;
    if (criterios.desde && (!fecha || fecha < criterios.desde)) return false;
    if (criterios.hasta && (!fecha || fecha > criterios.hasta)) return false;
    return true;
  });
}

export function ordenarVentas(ventas: FilaVenta[], campo: CampoOrden, sentido: Sentido): FilaVenta[] {
  const signo = sentido === "asc" ? 1 : -1;
  // Copia: el arreglo que llega es el del servidor y ordenarlo en el lugar haría que un
  // re-render vea otro orden del que pidió.
  return [...ventas].sort((a, b) => {
    const va = a[campo];
    const vb = b[campo];
    // Los nulos siempre al final, sin importar el sentido.
    if ((va === null || va === undefined) && (vb === null || vb === undefined)) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * signo;
    return String(va).localeCompare(String(vb), "es") * signo;
  });
}

export interface ResumenVentas {
  cantidad: number;
  cotizaciones: number;
  montoCotizado: number;
  confirmadas: number;
  montoConfirmado: number;
  montoPorFacturar: number;
  montoFacturado: number;
  arriendosActivos: number;
  montoArriendosActivos: number;
  arriendosAtrasados: number;
  arriendosPorVencer: number;
  cotizacionesVencidas: number;
  conDanos: number;
  costoDeDanos: number;
  /** Confirmadas sobre el total de órdenes cerradas o abiertas; null si no hay ninguna. */
  tasaDeCierre: number | null;
}

export function resumirVentas(ventas: FilaVenta[], hoy: string): ResumenVentas {
  const resumen: ResumenVentas = {
    cantidad: ventas.length,
    cotizaciones: 0,
    montoCotizado: 0,
    confirmadas: 0,
    montoConfirmado: 0,
    montoPorFacturar: 0,
    montoFacturado: 0,
    arriendosActivos: 0,
    montoArriendosActivos: 0,
    arriendosAtrasados: 0,
    arriendosPorVencer: 0,
    cotizacionesVencidas: 0,
    conDanos: 0,
    costoDeDanos: 0,
    tasaDeCierre: null,
  };

  for (const v of ventas) {
    if (esCotizacion(v)) {
      resumen.cotizaciones += 1;
      resumen.montoCotizado += v.monto_total;
    }
    if (esConfirmada(v)) {
      resumen.confirmadas += 1;
      resumen.montoConfirmado += v.monto_total;
      resumen.montoPorFacturar += v.monto_por_facturar ?? 0;
      resumen.montoFacturado += v.monto_facturado ?? 0;
    }
    if (arriendoActivo(v)) {
      resumen.arriendosActivos += 1;
      resumen.montoArriendosActivos += v.monto_total;
    }
    if (arriendoAtrasado(v, hoy)) resumen.arriendosAtrasados += 1;
    if (arriendoPorVencer(v, hoy)) resumen.arriendosPorVencer += 1;
    if (cotizacionVencida(v, hoy)) resumen.cotizacionesVencidas += 1;
    if (v.tiene_danos === true) {
      resumen.conDanos += 1;
      resumen.costoDeDanos += v.costo_danos ?? 0;
    }
  }

  const decididas = resumen.cotizaciones + resumen.confirmadas;
  resumen.tasaDeCierre = decididas > 0 ? resumen.confirmadas / decididas : null;
  return resumen;
}

/** Hoy en Chile como YYYY-MM-DD, para comparar contra las fechas de Odoo. */
export function hoyEnChileIso(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}
