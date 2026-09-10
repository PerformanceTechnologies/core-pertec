import type { FilaVenta } from "./datos";
import {
  arriendoActivo,
  arriendoAtrasado,
  cotizacionDormida,
  cotizacionVencida,
  diasDesde,
  esConfirmada,
  esCotizacion,
  porFacturar,
} from "./ventas-filtro";

// Las series que dibujan los gráficos del detalle de Ventas y Arriendo. Puras y sin React
// (ver scripts/probar-ventas.mts): los componentes de ApexCharts solo reciben lo que estas
// funciones devuelven, y trabajan sobre las órdenes YA FILTRADAS.

export interface PuntoMensual {
  /** "2026-08": la clave con la que el clic arma el rango de fechas. */
  mes: string;
  cotizado: number;
  confirmado: number;
  arrendado: number;
}

/**
 * Cotizado, confirmado y arrendado por mes, del más viejo al más nuevo y sin huecos.
 *
 * Las tres series separadas y no un total: cotizar por 300 millones y confirmar 80 es una
 * historia distinta a cotizar 90 y confirmar 80, y sumadas se ven iguales.
 */
export function tendenciaMensual(ventas: FilaVenta[]): PuntoMensual[] {
  const porMes = new Map<string, PuntoMensual>();
  for (const v of ventas) {
    const mes = v.fecha_orden?.slice(0, 7);
    if (!mes) continue;
    const punto = porMes.get(mes) ?? { mes, cotizado: 0, confirmado: 0, arrendado: 0 };
    if (esCotizacion(v)) punto.cotizado += v.monto_total;
    if (esConfirmada(v)) punto.confirmado += v.monto_total;
    if (v.es_arriendo) punto.arrendado += v.monto_total;
    porMes.set(mes, punto);
  }
  const meses = [...porMes.keys()].sort();
  if (meses.length === 0) return [];
  return mesesEntre(meses[0], meses[meses.length - 1]).map(
    (mes) => porMes.get(mes) ?? { mes, cotizado: 0, confirmado: 0, arrendado: 0 },
  );
}

/** Todos los meses de un extremo al otro, inclusive. Tope de 600 (50 años) por seguridad. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [anio, mes] = desde.split("-").map(Number);
  for (let i = 0; i < 600; i += 1) {
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    meses.push(clave);
    if (clave >= hasta) break;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

/** El primer y el último día de un mes "2026-08", para el filtro de fechas. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export interface Porcion {
  filtro: string;
  etiqueta: string;
  cantidad: number;
  monto: number;
}

/**
 * En qué está la plata: cotizada, confirmada sin facturar, o ya facturada.
 *
 * Es el reparto que contesta "cuánto de lo que hay en Odoo es plata que todavía no
 * entró". Se reparte por MONTO y no por cantidad: una cotización de 300 millones y una de
 * 300 mil cuentan igual en un conteo y no significan lo mismo.
 */
export function dondeEstaLaPlata(ventas: FilaVenta[]): Porcion[] {
  const grupos: { filtro: string; etiqueta: string; monto: (v: FilaVenta) => number }[] = [
    { filtro: "cotizaciones", etiqueta: "Cotizado", monto: (v) => (esCotizacion(v) ? v.monto_total : 0) },
    {
      filtro: "por_facturar",
      etiqueta: "Confirmado sin facturar",
      monto: (v) => (esConfirmada(v) ? (v.monto_por_facturar ?? 0) : 0),
    },
    {
      filtro: "facturadas",
      etiqueta: "Ya facturado",
      monto: (v) => (esConfirmada(v) ? (v.monto_facturado ?? 0) : 0),
    },
  ];
  return grupos
    .map((g) => ({
      filtro: g.filtro,
      etiqueta: g.etiqueta,
      cantidad: ventas.filter((v) => g.monto(v) > 0).length,
      monto: ventas.reduce((a, v) => a + g.monto(v), 0),
    }))
    .filter((p) => p.monto > 0);
}

export interface EstadoDeArriendo {
  estado: string;
  filtro: string;
  cantidad: number;
  monto: number;
}

/**
 * Los arriendos por estado, de los más avanzados a los menos.
 *
 * Solo los que SON arriendo: en este Odoo el campo de estado de arriendo viene en "draft"
 * también para las ventas normales, así que contarlas mezcladas da un gráfico donde todo
 * es borrador.
 */
export function arriendosPorEstado(ventas: FilaVenta[]): EstadoDeArriendo[] {
  const porEstado = new Map<string, EstadoDeArriendo>();
  for (const v of ventas) {
    if (!v.es_arriendo) continue;
    const estado = v.estado_arriendo ?? "Sin estado";
    const grupo = porEstado.get(estado) ?? { estado, filtro: "arriendos", cantidad: 0, monto: 0 };
    grupo.cantidad += 1;
    grupo.monto += v.monto_total;
    porEstado.set(estado, grupo);
  }
  return [...porEstado.values()].sort((a, b) => b.cantidad - a.cantidad || b.monto - a.monto);
}

export interface Vendedor {
  nombre: string;
  cotizaciones: number;
  confirmadas: number;
  montoCotizado: number;
  montoConfirmado: number;
}

/** Cada vendedor con lo que cotizó y lo que cerró, ordenado por lo confirmado. */
export function porVendedor(ventas: FilaVenta[], cuantos = 8): Vendedor[] {
  const porNombre = new Map<string, Vendedor>();
  for (const v of ventas) {
    const nombre = v.vendedor ?? "Sin asignar";
    const vend =
      porNombre.get(nombre) ??
      { nombre, cotizaciones: 0, confirmadas: 0, montoCotizado: 0, montoConfirmado: 0 };
    if (esCotizacion(v)) {
      vend.cotizaciones += 1;
      vend.montoCotizado += v.monto_total;
    }
    if (esConfirmada(v)) {
      vend.confirmadas += 1;
      vend.montoConfirmado += v.monto_total;
    }
    porNombre.set(nombre, vend);
  }
  return [...porNombre.values()]
    .sort((a, b) => b.montoConfirmado - a.montoConfirmado || b.montoCotizado - a.montoCotizado)
    .slice(0, cuantos);
}

export interface TramoDeVencimiento {
  etiqueta: string;
  /** Días hasta el fin del arriendo; negativo es "ya pasó". */
  desde: number;
  hasta: number | null;
  cantidad: number;
  monto: number;
}

/** Los tramos del calendario de arriendos, del más urgente al menos. */
export const TRAMOS_DE_VENCIMIENTO: { etiqueta: string; desde: number; hasta: number | null }[] = [
  { etiqueta: "Pasado de fecha", desde: Number.NEGATIVE_INFINITY, hasta: -1 },
  { etiqueta: "Esta semana", desde: 0, hasta: 7 },
  { etiqueta: "8 a 15 días", desde: 8, hasta: 15 },
  { etiqueta: "16 a 30", desde: 16, hasta: 30 },
  { etiqueta: "Más de 30", desde: 31, hasta: null },
];

/**
 * Cuándo terminan los arriendos en curso.
 *
 * Es el calendario de lo que hay que ir a buscar. Solo los activos: uno devuelto ya no
 * vence, y uno en cotización todavía no empezó.
 */
export function vencimientosDeArriendo(ventas: FilaVenta[], hoy: string): TramoDeVencimiento[] {
  const tramos: TramoDeVencimiento[] = TRAMOS_DE_VENCIMIENTO.map((t) => ({ ...t, cantidad: 0, monto: 0 }));
  for (const v of ventas) {
    if (!arriendoActivo(v)) continue;
    const dias = diasDesde(v.fecha_fin_arriendo, hoy);
    if (dias === null) continue;
    // `diasDesde` cuenta hacia atrás: 3 significa "terminó hace 3 días". Acá se quiere
    // "cuántos días FALTAN", así que se invierte.
    const faltan = -dias;
    const tramo = tramos.find((t) => faltan >= t.desde && (t.hasta === null || faltan <= t.hasta));
    if (!tramo) continue;
    tramo.cantidad += 1;
    tramo.monto += v.monto_total;
  }
  return tramos;
}

export interface Aviso {
  /** El filtro que muestra exactamente lo que el aviso cuenta. */
  filtro: string;
  texto: string;
  cantidad: number;
  monto: number;
}

/**
 * Lo que hay que hacer algo con, contado y con su plata.
 *
 * Va arriba porque es la única parte de esta pantalla que pide una acción hoy: un arriendo
 * pasado de fecha es un equipo que no volvió, y una orden confirmada sin facturar es plata
 * vendida que no se cobró.
 */
export function avisos(ventas: FilaVenta[], hoy: string): Aviso[] {
  const contar = (
    filtro: string,
    texto: string,
    cumple: (v: FilaVenta) => boolean,
    monto: (v: FilaVenta) => number = (v) => v.monto_total,
  ): Aviso => {
    const suyas = ventas.filter(cumple);
    return { filtro, texto, cantidad: suyas.length, monto: suyas.reduce((a, v) => a + monto(v), 0) };
  };

  return [
    contar("arriendos_atrasados", "arriendo(s) pasados de su fecha de fin", (v) => arriendoAtrasado(v, hoy)),
    contar("por_facturar", "confirmada(s) con saldo sin facturar", porFacturar, (v) => v.monto_por_facturar ?? 0),
    contar("cotizaciones_vencidas", "cotización(es) con la validez vencida", (v) => cotizacionVencida(v, hoy)),
    contar("cotizaciones_dormidas", "cotización(es) sin moverse hace más de un mes", (v) => cotizacionDormida(v, hoy)),
    contar("con_danos", "arriendo(s) con daños registrados", (v) => v.tiene_danos === true, (v) => v.costo_danos ?? 0),
    contar(
      "margen_bajo",
      "con margen bajo el objetivo y sin aprobar",
      (v) => v.margen_bajo === true && v.margen_aprobado !== true,
    ),
  ].filter((a) => a.cantidad > 0);
}
