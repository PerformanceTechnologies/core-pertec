import type { FilaFondo, FilaGasto } from "./datos";
import {
  diasDesde,
  marcadoDuplicado,
  olvidado,
  porReembolsar,
  sinCategoria,
  sinRendir,
  sinRespaldo,
} from "./gastos-filtro";
import { traducir, CATEGORIAS_GASTO, TIPOS_DOCUMENTO_GASTO } from "./traducciones";

// Las series de los gráficos del detalle de Gastos. Puras y sin React (ver
// scripts/probar-gastos.mts), calculadas sobre los gastos YA FILTRADOS.

export interface PuntoMensual {
  /** "2026-08": la clave con la que el clic arma el rango de fechas. */
  mes: string;
  rendido: number;
  sinRendir: number;
  cantidad: number;
}

/**
 * Gasto por mes, separando lo que ya se rindió de lo que sigue en borrador.
 *
 * Separado y no un total: hoy hay $685.896 en borrador repartidos en trece meses, y
 * sumados con lo rendido se leen como si el gasto del mes fuera mayor de lo que la empresa
 * efectivamente tramitó.
 */
export function tendenciaMensual(gastos: FilaGasto[]): PuntoMensual[] {
  const porMes = new Map<string, PuntoMensual>();
  for (const g of gastos) {
    const mes = g.fecha?.slice(0, 7);
    if (!mes) continue;
    const punto = porMes.get(mes) ?? { mes, rendido: 0, sinRendir: 0, cantidad: 0 };
    if (sinRendir(g)) punto.sinRendir += g.monto_total;
    else punto.rendido += g.monto_total;
    punto.cantidad += 1;
    porMes.set(mes, punto);
  }
  const meses = [...porMes.keys()].sort();
  if (meses.length === 0) return [];
  return mesesEntre(meses[0], meses[meses.length - 1]).map(
    (mes) => porMes.get(mes) ?? { mes, rendido: 0, sinRendir: 0, cantidad: 0 },
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

export interface Grupo {
  /** Lo que se filtra al hacer clic: el valor crudo, no la etiqueta traducida. */
  clave: string;
  etiqueta: string;
  cantidad: number;
  monto: number;
}

function agrupar(
  gastos: FilaGasto[],
  clave: (g: FilaGasto) => string,
  etiquetar: (clave: string) => string,
): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const g of gastos) {
    const k = clave(g);
    const grupo = mapa.get(k) ?? { clave: k, etiqueta: etiquetar(k), cantidad: 0, monto: 0 };
    grupo.cantidad += 1;
    grupo.monto += g.monto_total;
    mapa.set(k, grupo);
  }
  return [...mapa.values()].sort((a, b) => b.monto - a.monto || b.cantidad - a.cantidad);
}

/**
 * Por categoría del panel.
 *
 * Los que no la tienen se agrupan en "Sin categoría" en vez de desaparecer: hoy son 25 de
 * 41, y una dona que los omite muestra un tercio del gasto como si fuera el total.
 */
export function porCategoria(gastos: FilaGasto[]): Grupo[] {
  return agrupar(
    gastos,
    (g) => g.categoria ?? "",
    (clave) => (clave ? traducir(CATEGORIAS_GASTO, clave) : "Sin categoría"),
  );
}

/** Por persona que lo cargó. */
export function porEmpleado(gastos: FilaGasto[], cuantos = 8): Grupo[] {
  return agrupar(
    gastos,
    (g) => g.empleado ?? "Sin asignar",
    (clave) => clave,
  ).slice(0, cuantos);
}

/** Por tipo de documento tributario: dice con qué respaldo se está gastando. */
export function porTipoDeDocumento(gastos: FilaGasto[], cuantos = 8): Grupo[] {
  return agrupar(
    gastos,
    (g) => g.tipo_documento ?? "",
    (clave) => (clave ? traducir(TIPOS_DOCUMENTO_GASTO, clave) : "Sin tipo"),
  ).slice(0, cuantos);
}

/** Por proveedor, para ver en quién se va la plata. */
export function porProveedor(gastos: FilaGasto[], cuantos = 8): Grupo[] {
  return agrupar(
    gastos,
    (g) => g.proveedor ?? "",
    (clave) => clave || "Sin proveedor",
  ).slice(0, cuantos);
}

export interface TramoDeAntiguedad {
  etiqueta: string;
  desde: number;
  hasta: number | null;
  cantidad: number;
  monto: number;
}

/** Los tramos de antigüedad de lo que sigue en borrador. */
export const TRAMOS_SIN_RENDIR: { etiqueta: string; desde: number; hasta: number | null }[] = [
  { etiqueta: "Esta semana", desde: 0, hasta: 7 },
  { etiqueta: "8 a 30 días", desde: 8, hasta: 30 },
  { etiqueta: "31 a 90", desde: 31, hasta: 90 },
  { etiqueta: "91 a 365", desde: 91, hasta: 365 },
  { etiqueta: "Más de un año", desde: 366, hasta: null },
];

/**
 * Hace cuánto que un gasto está en borrador.
 *
 * Solo los borradores: un gasto ya rendido no está esperando nada. Es la pregunta que
 * importa acá — hoy hay uno de julio de 2025 sin rendir.
 */
export function antiguedadSinRendir(gastos: FilaGasto[], hoy: string): TramoDeAntiguedad[] {
  const tramos: TramoDeAntiguedad[] = TRAMOS_SIN_RENDIR.map((t) => ({ ...t, cantidad: 0, monto: 0 }));
  for (const g of gastos) {
    if (!sinRendir(g)) continue;
    const dias = diasDesde(g.fecha, hoy);
    if (dias === null) continue;
    const tramo = tramos.find((t) => dias >= t.desde && (t.hasta === null || dias <= t.hasta)) ?? tramos[0];
    tramo.cantidad += 1;
    tramo.monto += g.monto_total;
  }
  return tramos;
}

export interface ResumenDeFondos {
  entregado: number;
  rendido: number;
  saldo: number;
  abiertos: number;
}

/**
 * Los fondos por rendir en tres números.
 *
 * "Abiertos" son los entregados y todavía sin cerrar: mientras tanto es plata de la
 * empresa que está afuera.
 */
export function resumirFondos(fondos: FilaFondo[]): ResumenDeFondos {
  const resumen: ResumenDeFondos = { entregado: 0, rendido: 0, saldo: 0, abiertos: 0 };
  for (const f of fondos) {
    resumen.entregado += f.monto_entregado;
    resumen.rendido += f.monto_rendido;
    if (f.estado === "delivered") {
      resumen.saldo += f.saldo;
      resumen.abiertos += 1;
    }
  }
  return resumen;
}

export interface Aviso {
  /** El filtro que muestra exactamente lo que el aviso cuenta. */
  filtro: string;
  texto: string;
  cantidad: number;
  monto: number;
}

/**
 * Lo que hay que arreglar, contado y con su plata.
 *
 * Va arriba porque es lo único de esta pantalla sobre lo que hay que hacer algo hoy: un
 * gasto sin respaldo no se puede defender ante el SII, uno sin categoría no entra en
 * ningún desglose, y uno en borrador de hace un año no se va a rendir solo.
 */
export function avisos(gastos: FilaGasto[], hoy: string): Aviso[] {
  const contar = (
    filtro: string,
    texto: string,
    cumple: (g: FilaGasto) => boolean,
    monto: (g: FilaGasto) => number = (g) => g.monto_total,
  ): Aviso => {
    const suyos = gastos.filter(cumple);
    return { filtro, texto, cantidad: suyos.length, monto: suyos.reduce((a, g) => a + monto(g), 0) };
  };

  return [
    contar("sin_respaldo", "sin respaldo adjunto en Odoo", sinRespaldo),
    contar("olvidados", "en borrador hace más de un mes", (g) => olvidado(g, hoy)),
    contar("sin_categoria", "sin categoría: no entran en el desglose", sinCategoria),
    contar("por_reembolsar", "por reembolsar a quien los pagó", porReembolsar, (g) => g.monto_pendiente ?? 0),
    contar("duplicados", "que Odoo marca como repetidos", marcadoDuplicado),
  ].filter((a) => a.cantidad > 0);
}
