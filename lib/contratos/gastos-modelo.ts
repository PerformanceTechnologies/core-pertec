// Presupuesto y cotizaciones de Gastos de arranque: tipos, lectura de montos y los cálculos.
//
// Sin "server-only" y sin base, por lo mismo que arranque-modelo.ts: lo importan componentes
// cliente (los formularios, el comparador) y la plata tiene que poder probarse sin Supabase.
//
// Todo está en NETO (sin IVA) y en pesos. Lo que se cotiza en UF o dólares se convierte al
// registrarlo; se guarda el precio original, el tipo de cambio usado y el total en pesos.

import { diasHasta } from "./acreditacion-modelo";
import { faseDe, formatearPesos } from "./arranque-modelo";

// -----------------------------------------------------------------------------
//  Monedas y modalidades
// -----------------------------------------------------------------------------

export type Moneda = "CLP" | "UF" | "USD";

export const MONEDAS: Moneda[] = ["CLP", "UF", "USD"];

export const ETIQUETAS_DE_MONEDA: Record<Moneda, string> = {
  CLP: "Pesos (CLP)",
  UF: "UF",
  USD: "Dólares (USD)",
};

export function esMoneda(valor: unknown): valor is Moneda {
  return valor === "CLP" || valor === "UF" || valor === "USD";
}

/** Cómo se compra una línea. Las dos últimas no pasan por cotizar. */
export type Modalidad = "cotizacion" | "compra_directa" | "otra_via";

export const MODALIDADES: Modalidad[] = ["cotizacion", "compra_directa", "otra_via"];

export const ETIQUETAS_DE_MODALIDAD: Record<Modalidad, string> = {
  cotizacion: "Cotización",
  compra_directa: "Compra directa",
  otra_via: "Por otra vía",
};

export const AYUDA_DE_MODALIDAD: Record<Modalidad, string> = {
  cotizacion: "Se piden cotizaciones y se aprueba una.",
  compra_directa: "Retail o compra inmediata: no se cotiza.",
  otra_via: "Convenio u otro canal: se cotiza fuera del core.",
};

export function esModalidad(valor: unknown): valor is Modalidad {
  return valor === "cotizacion" || valor === "compra_directa" || valor === "otra_via";
}

// -----------------------------------------------------------------------------
//  Leer y mostrar montos
// -----------------------------------------------------------------------------

/**
 * Un número escrito por una persona, en el formato de Chile: «1.234,56», «1234,5», «12.5», «1.500».
 *
 * La coma es el decimal y el punto agrupa miles, que es como se escribe acá; pero lo que se pega
 * desde un correo de afuera suele traer el punto como decimal («12.5»). Se resuelve así: con coma,
 * la coma manda; sin coma, un punto seguido de EXACTAMENTE tres dígitos es de miles («1.500»), y
 * cualquier otro punto es decimal («12.5», «0.75»). Es ambiguo solo en «1.500» escrito como
 * decimal —que es poco común—, y se prefiere eso a rechazar lo que se copia de una planilla.
 */
export function leerDecimal(valor: unknown, etiqueta: string): number | null {
  const texto = String(valor ?? "")
    .trim()
    .replace(/[$\s]/g, "");
  if (!texto) return null;

  let numero: number;
  if (texto.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(texto)) {
      throw new Error(`${etiqueta}: escribe un número válido (por ejemplo 1.234,56).`);
    }
    numero = Number(texto.replace(/\./g, "").replace(",", "."));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    numero = Number(texto.replace(/\./g, ""));
  } else if (/^\d+(\.\d+)?$/.test(texto)) {
    numero = Number(texto);
  } else {
    throw new Error(`${etiqueta}: escribe un número válido (por ejemplo 1.234,56).`);
  }

  if (!Number.isFinite(numero) || numero > 1e12) throw new Error(`${etiqueta}: el monto es demasiado grande.`);
  return numero;
}

/**
 * El precio unitario de una cotización, en su moneda. En pesos no admite decimales (el peso no los
 * tiene, y uno casi seguro es un error de tipeo); en UF y dólares, hasta dos.
 */
export function leerPrecioUnitario(valor: unknown, moneda: Moneda, etiqueta: string): number | null {
  const n = leerDecimal(valor, etiqueta);
  if (n === null) return null;
  if (moneda === "CLP") {
    if (!Number.isInteger(n)) throw new Error(`${etiqueta}: en pesos va sin decimales (por ejemplo 8.390.000).`);
    return n;
  }
  return Math.round(n * 100) / 100;
}

/** El tipo de cambio de una moneda extranjera: pesos por unidad. Pesos vale 1 y no se pregunta. */
export function leerTipoDeCambio(valor: unknown, moneda: Moneda): number {
  if (moneda === "CLP") return 1;
  const n = leerDecimal(valor, "El tipo de cambio");
  if (n === null || n <= 0) {
    throw new Error(`Falta el tipo de cambio: cuántos pesos vale un ${moneda === "UF" ? "UF" : "dólar"}.`);
  }
  return Math.round(n * 10_000) / 10_000;
}

/** El total en pesos de una cotización: precio × cantidad × tipo de cambio, al peso. */
export function calcularTotalClp(precioUnitario: number, cantidad: number, tipoCambio: number): number {
  return Math.round(precioUnitario * cantidad * tipoCambio);
}

const NUMERO = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** «$419.740», «UF 1.250,5», «US$ 9.800»: un monto con su moneda. */
export function formatearMoneda(valor: number | null | undefined, moneda: Moneda): string {
  if (valor === null || valor === undefined) return "—";
  if (moneda === "CLP") return formatearPesos(valor);
  return `${moneda === "UF" ? "UF" : "US$"} ${NUMERO.format(valor)}`;
}

/** Un monto como se vuelve a poner en un campo: «1500000» → «1.500.000». */
export function montoEnCampo(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "" : NUMERO.format(valor);
}

// -----------------------------------------------------------------------------
//  Cotizaciones
// -----------------------------------------------------------------------------

export type EstadoDeCotizacion = "solicitada" | "recibida" | "aprobada" | "descartada";

export const ESTADOS_DE_COTIZACION: EstadoDeCotizacion[] = ["solicitada", "recibida", "aprobada", "descartada"];

export const ETIQUETAS_DE_COTIZACION: Record<EstadoDeCotizacion, string> = {
  solicitada: "Solicitada",
  recibida: "Recibida",
  aprobada: "Aprobada",
  descartada: "Descartada",
};

export function esEstadoDeCotizacion(valor: unknown): valor is EstadoDeCotizacion {
  return ESTADOS_DE_COTIZACION.includes(valor as EstadoDeCotizacion);
}

export interface Cotizacion {
  id: string;
  partidaId: string;
  proveedor: string;
  descripcion: string | null;
  cantidad: number;
  moneda: Moneda;
  precioUnitario: number | null;
  tipoCambio: number;
  totalClp: number | null;
  plazoEntregaDias: number | null;
  garantia: string | null;
  condicionesPago: string | null;
  vigenciaHasta: string | null;
  respuestaEsperada: string | null;
  estado: EstadoDeCotizacion;
  motivoDecision: string | null;
  porConfirmar: string | null;
  notas: string | null;
  carpetaItemId: string | null;
  carpetaUrl: string | null;
  aprobadoPorNombre: string | null;
  aprobadoEn: string | null;
  creadoPor: string | null;
  creadoEn: string;
}

/** Suma `dias` a una fecha «AAAA-MM-DD». */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Una cotización con precio que cuenta para comparar: recibida o aprobada. */
export function comparable(c: Pick<Cotizacion, "estado" | "totalClp">): boolean {
  return (c.estado === "recibida" || c.estado === "aprobada") && c.totalClp !== null;
}

export interface FilaDelComparador {
  cotizacion: Cotizacion;
  /** Es la de menor total entre las comparables. */
  esLaMasBarata: boolean;
  /** Cuánto más cara que la más barata, en %. 0 para ella misma; null si no se puede comparar. */
  masCaraPct: number | null;
  /**
   * ¿La entrega llega antes del límite? Null si falta el plazo o el límite. `holgura` son los días
   * que sobran (negativo = llega tarde).
   */
  llegaATiempo: boolean | null;
  holgura: number | null;
  /** La respuesta que se esperaba ya debería estar y sigue «solicitada». */
  respuestaAtrasada: boolean;
  /** Recibida cuya vigencia ya pasó, o pasa en la semana: el precio puede no valer ya. */
  vigencia: "vencida" | "por_vencer" | "vigente" | null;
}

export interface AnalisisDeCotizaciones {
  filas: FilaDelComparador[];
  /** Cuánto se ahorró aprobando esta y no la más cara comparable. Null si no hay de dónde comparar. */
  ahorro: { monto: number; pct: number } | null;
  /** Hay más de una con precio: tiene sentido hablar de «la más barata». */
  hayQueComparar: boolean;
}

/** Días antes del fin de la vigencia en que una cotización pasa a «por vencer». */
export const DIAS_AVISO_VIGENCIA = 7;

/**
 * El comparador de una línea.
 *
 * `fechaLimite` es para cuándo tiene que estar lo comprado: la fecha de la línea si la tiene, o la
 * fecha límite del módulo. La entrega se cuenta desde HOY, no desde la fecha de la cotización:
 * lo que importa es si, decidiendo hoy, llega a tiempo.
 */
export function analizarCotizaciones(
  cotizaciones: Cotizacion[],
  opciones: { hoy: string; fechaLimite: string | null },
): AnalisisDeCotizaciones {
  const comparables = cotizaciones.filter(comparable);
  const minimo = comparables.length > 0 ? Math.min(...comparables.map((c) => c.totalClp as number)) : null;
  const maximo = comparables.length > 0 ? Math.max(...comparables.map((c) => c.totalClp as number)) : null;
  const hayQueComparar = comparables.length > 1;

  const filas = cotizaciones.map((c): FilaDelComparador => {
    const esComparable = comparable(c);
    const total = c.totalClp;

    let llegaATiempo: boolean | null = null;
    let holgura: number | null = null;
    if (typeof c.plazoEntregaDias === "number" && opciones.fechaLimite) {
      const entrega = sumarDias(opciones.hoy, c.plazoEntregaDias);
      holgura = diasHasta(opciones.fechaLimite, entrega);
      llegaATiempo = holgura !== null ? holgura >= 0 : null;
    }

    const diasDeVigencia = c.estado === "recibida" ? diasHasta(c.vigenciaHasta, opciones.hoy) : null;

    return {
      cotizacion: c,
      esLaMasBarata: hayQueComparar && esComparable && total === minimo,
      masCaraPct:
        esComparable && minimo !== null && minimo > 0 && total !== null
          ? Math.round(((total - minimo) / minimo) * 100)
          : null,
      llegaATiempo,
      holgura,
      respuestaAtrasada:
        c.estado === "solicitada" &&
        c.respuestaEsperada !== null &&
        (diasHasta(c.respuestaEsperada, opciones.hoy) ?? 0) < 0,
      vigencia:
        diasDeVigencia === null
          ? null
          : diasDeVigencia < 0
            ? "vencida"
            : diasDeVigencia <= DIAS_AVISO_VIGENCIA
              ? "por_vencer"
              : "vigente",
    };
  });

  const aprobada = comparables.find((c) => c.estado === "aprobada");
  const ahorro =
    aprobada && hayQueComparar && maximo !== null && aprobada.totalClp !== null && maximo > aprobada.totalClp
      ? { monto: maximo - aprobada.totalClp, pct: Math.round(((maximo - aprobada.totalClp) / maximo) * 100) }
      : null;

  return { filas, ahorro, hayQueComparar };
}

/**
 * El estado que le toca a una línea según sus cotizaciones.
 *
 * Solo ADELANTA hasta «aprobado»: una línea que ya tiene OC emitida o está pagada no retrocede
 * porque alguien edite una cotización, y una anulada no se toca. Dentro del tramo de cotizar
 * (presupuestado → cotizando → cotizada → aprobado) sí sigue a lo que hay: si se descarta la
 * aprobada, vuelve a «cotizada».
 */
export function estadoDeLineaSegunCotizaciones(
  estadoActual: string,
  cotizaciones: Pick<Cotizacion, "estado">[],
): string {
  const tramo = ["presupuestado", "cotizando", "cotizada", "aprobado"];
  if (!tramo.includes(estadoActual)) return estadoActual;

  if (cotizaciones.some((c) => c.estado === "aprobada")) return "aprobado";
  if (cotizaciones.some((c) => c.estado === "recibida")) return "cotizada";
  if (cotizaciones.some((c) => c.estado === "solicitada")) return "cotizando";
  return "presupuestado";
}

/** Si ya hay una orden de compra o un pago, la cotización aprobada no se puede mover. */
export function lineaTieneOrdenDeCompra(estadoDeLinea: string): boolean {
  return estadoDeLinea === "comprometido" || estadoDeLinea === "pagado";
}

/**
 * Un monto a partir del cual aprobar con UNA sola cotización exige explicar por qué. Por debajo, un
 * trámite de más: comparar tres precios de una botella con logo no vale el tiempo.
 */
export const UMBRAL_DE_COTIZACION_UNICA = 500_000;

/** Aprobar esta cotización sin otra con la que compararla, siendo cara: pide un motivo. */
export function aprobacionPideMotivo(
  cotizacion: Pick<Cotizacion, "totalClp">,
  hermanas: Pick<Cotizacion, "estado" | "totalClp">[],
): boolean {
  const otras = hermanas.filter(comparable).length;
  return otras <= 1 && (cotizacion.totalClp ?? 0) >= UMBRAL_DE_COTIZACION_UNICA;
}

// -----------------------------------------------------------------------------
//  Presupuesto contra gasto
// -----------------------------------------------------------------------------

/** Lo que el presupuesto necesita saber de cada línea. */
export interface LineaParaPresupuesto {
  categoriaId: string;
  estado: string;
  montoPresupuestado: number | null;
  montoReal: number | null;
  montoComprometido: number | null;
  /** El total de la más barata de sus cotizaciones recibidas, si hay. */
  mejorCotizacionClp: number | null;
}

/**
 * Cuánto pesa una línea como COMPROMETIDA: lo que ya se decidió gastar.
 *
 * Aprobada (o con OC) cuenta por el monto aprobado; pagada, por lo realmente pagado. Una línea en
 * «presupuestado», «cotizando» o «cotizada» todavía no se comprometió: es plata por comprometer.
 * Una anulada no es nada.
 */
export function comprometidoDe(l: LineaParaPresupuesto): number {
  const fase = faseDe("gastos", l.estado);
  if (fase === "fuera") return 0;
  if (fase === "final") return l.montoReal ?? l.montoComprometido ?? l.montoPresupuestado ?? 0;
  if (l.estado === "aprobado" || l.estado === "comprometido") {
    return l.montoComprometido ?? l.montoReal ?? l.montoPresupuestado ?? 0;
  }
  return 0;
}

/** Lo ya pagado de una línea. */
export function pagadoDe(l: LineaParaPresupuesto): number {
  return faseDe("gastos", l.estado) === "final" ? comprometidoDe(l) : 0;
}

/**
 * Lo que todavía no se compromete pero se espera gastar: la mejor cotización recibida, o el
 * estimado de la línea si aún no hay ninguna. Es lo que permite avisar de que el presupuesto va a
 * quedar corto ANTES de aprobar, no después.
 */
export function porComprometerDe(l: LineaParaPresupuesto): number {
  const fase = faseDe("gastos", l.estado);
  if (fase === "fuera" || fase === "final") return 0;
  if (l.estado === "aprobado" || l.estado === "comprometido") return 0;
  return l.mejorCotizacionClp ?? l.montoPresupuestado ?? 0;
}

export interface ItemDePresupuesto {
  id: string;
  nombre: string;
  activo: boolean;
  /** Null = sin presupuesto asignado todavía. */
  presupuesto: number | null;
  comprometido: number;
  pagado: number;
  porComprometer: number;
  /** Comprometido + lo que se espera comprometer. */
  proyectado: number;
  lineas: number;
  /** El proyectado supera lo asignado. Solo si hay presupuesto asignado. */
  sobre: boolean;
}

export interface ResumenDePresupuesto {
  /** Null mientras nadie define el presupuesto total. */
  total: number | null;
  /** El primero que se definió; null si nunca se definió. */
  original: number | null;
  /** Suma de lo asignado a los ítems. */
  asignado: number;
  /** Lo del total que todavía no se reparte entre ítems (negativo si se repartió de más). */
  sinRepartir: number | null;
  comprometido: number;
  pagado: number;
  porComprometer: number;
  proyectado: number;
  /** Total menos comprometido. Null sin total. */
  disponible: number | null;
  /** Total menos proyectado: cuánto sobraría si todo sale como se espera. Null sin total. */
  disponibleProyectado: number | null;
  /** El proyectado supera el total. */
  enRiesgo: boolean;
  items: ItemDePresupuesto[];
  /** Plata ahorrada aprobando la cotización más barata, sumada de todas las líneas. */
  ahorroLogrado: number;
  /** Cuántas líneas hay en la cuenta (sin las anuladas). */
  lineas: number;
}

export function resumirPresupuesto(entrada: {
  total: number | null;
  original: number | null;
  categorias: { id: string; nombre: string; activo: boolean; presupuesto: number | null }[];
  lineas: LineaParaPresupuesto[];
  ahorroLogrado?: number;
}): ResumenDePresupuesto {
  const porItem = new Map<string, ItemDePresupuesto>(
    entrada.categorias.map((c) => [
      c.id,
      {
        id: c.id,
        nombre: c.nombre,
        activo: c.activo,
        presupuesto: c.presupuesto,
        comprometido: 0,
        pagado: 0,
        porComprometer: 0,
        proyectado: 0,
        lineas: 0,
        sobre: false,
      },
    ]),
  );

  let comprometido = 0;
  let pagado = 0;
  let porComprometer = 0;
  let lineas = 0;

  for (const l of entrada.lineas) {
    if (faseDe("gastos", l.estado) === "fuera") continue;
    lineas++;

    const c = comprometidoDe(l);
    const p = pagadoDe(l);
    const x = porComprometerDe(l);
    comprometido += c;
    pagado += p;
    porComprometer += x;

    const item = porItem.get(l.categoriaId);
    if (item) {
      item.comprometido += c;
      item.pagado += p;
      item.porComprometer += x;
      item.lineas++;
    }
  }

  const items = [...porItem.values()].map((i) => {
    const proyectado = i.comprometido + i.porComprometer;
    return { ...i, proyectado, sobre: i.presupuesto !== null && proyectado > i.presupuesto };
  });

  const asignado = items.reduce((s, i) => s + (i.presupuesto ?? 0), 0);
  const proyectado = comprometido + porComprometer;
  const total = entrada.total;

  return {
    total,
    original: entrada.original,
    asignado,
    sinRepartir: total === null ? null : total - asignado,
    comprometido,
    pagado,
    porComprometer,
    proyectado,
    disponible: total === null ? null : total - comprometido,
    disponibleProyectado: total === null ? null : total - proyectado,
    enRiesgo: total !== null && proyectado > total,
    items,
    ahorroLogrado: entrada.ahorroLogrado ?? 0,
    lineas,
  };
}

/** El ahorro de una línea: lo que se evitó gastar aprobando esa y no la más cara comparable. */
export function ahorroDeLinea(cotizaciones: Cotizacion[]): number {
  const comparables = cotizaciones.filter(comparable);
  const aprobada = comparables.find((c) => c.estado === "aprobada");
  if (!aprobada || comparables.length < 2) return 0;
  const maximo = Math.max(...comparables.map((c) => c.totalClp as number));
  return Math.max(0, maximo - (aprobada.totalClp as number));
}

/** La más barata entre todas las cotizaciones con precio (recibidas o aprobada): la referencia para comparar. */
export function masBarataDeLinea(cotizaciones: Cotizacion[]): number | null {
  const conPrecio = cotizaciones.filter(comparable);
  return conPrecio.length === 0 ? null : Math.min(...conPrecio.map((c) => c.totalClp as number));
}

/** La más barata de las recibidas de una línea (la que se espera aprobar), o null. */
export function mejorCotizacionDeLinea(cotizaciones: Cotizacion[]): number | null {
  const recibidas = cotizaciones.filter((c) => c.estado === "recibida" && c.totalClp !== null);
  return recibidas.length === 0 ? null : Math.min(...recibidas.map((c) => c.totalClp as number));
}

// -----------------------------------------------------------------------------
//  Lo que está esperando respuesta
// -----------------------------------------------------------------------------

export interface PendientesDeCotizacion {
  /** Pedidas y sin respuesta todavía. */
  esperandoRespuesta: number;
  /** De esas, las que ya pasaron la fecha en que se esperaba respuesta. */
  respuestaAtrasada: number;
  /** Recibidas cuya vigencia ya pasó o pasa en la semana. */
  porVencer: number;
}

export function contarPendientesDeCotizacion(cotizaciones: Cotizacion[], hoy: string): PendientesDeCotizacion {
  let esperandoRespuesta = 0;
  let respuestaAtrasada = 0;
  let porVencer = 0;

  for (const c of cotizaciones) {
    if (c.estado === "solicitada") {
      esperandoRespuesta++;
      if (c.respuestaEsperada && (diasHasta(c.respuestaEsperada, hoy) ?? 0) < 0) respuestaAtrasada++;
    } else if (c.estado === "recibida" && c.vigenciaHasta) {
      const dias = diasHasta(c.vigenciaHasta, hoy);
      if (dias !== null && dias <= DIAS_AVISO_VIGENCIA) porVencer++;
    }
  }
  return { esperandoRespuesta, respuestaAtrasada, porVencer };
}

/** Cuántas unidades: un entero de 1 a 100.000. Vacío vale 1. */
export function leerCantidad(valor: unknown): number {
  const texto = String(valor ?? "").trim();
  if (!texto) return 1;
  if (!/^\d+$/.test(texto)) throw new Error("La cantidad es un número entero (por ejemplo 4).");
  const n = Number(texto);
  if (n < 1 || n > 100_000) throw new Error("La cantidad tiene que estar entre 1 y 100.000.");
  return n;
}
