import "server-only";
import { bukConfigurado, empresaBuk, fichasDePersonas, libroDeMes, procesosDeMes, type ProcesoBuk } from "./buk";
import type { ContextoFin, VistaFin } from "./datos";
import {
  centralizar,
  conFichas,
  desglosarPorPersona,
  movimientosDePrevired,
  movimientosDeSueldos,
  plazoPrevired,
  resultadoPago,
  resumirCentralizacion,
  sugerirFlujo,
  sumarMeses,
  ultimoDiaDelMes,
  type CoberturaCartola,
  type FilaMes,
  type LineaCentralizacion,
  type PersonaLibro,
  type ResumenMes,
  type MovimientoBanco,
  type SugerenciaFlujo,
} from "./remuneraciones-modelo";

// -----------------------------------------------------------------------------
//  Remuneraciones: arma la pantalla. Une tres cosas:
//    1. el libro de cada mes (BUK, solo lectura),
//    2. los movimientos del banco de Tesorería (para saber si ya se pagó), y
//    3. el flujo de caja (para sugerir qué cargar en su fila «Remuneraciones»).
//  Quién puede llamarlo lo decide remuneraciones-acceso.ts: aquí se asume que ya se verificó.
// -----------------------------------------------------------------------------

/** Meses que se traen: el actual y los anteriores. Cada uno son 2 consultas a BUK, que se guardan en memoria. */
export const MESES_EN_PANTALLA = 6;

export type DatosRemuneraciones =
  | { estado: "sin-configurar" }
  | { estado: "error"; mensaje: string }
  | {
      estado: "ok";
      empresaBuk: string;
      /** Cuándo se leyó de BUK el dato más viejo que se muestra (ms). */
      leidoEn: number;
      /** Del mes más reciente al más antiguo; los meses sin liquidaciones no aparecen. */
      filas: FilaMes[];
      /** Desde y hasta qué fechas hay banco cargado (null si no hay ningún movimiento). */
      cobertura: CoberturaCartola | null;
      sugerencias: SugerenciaFlujo[];
      /** Lo que hoy hay escrito a mano en la fila «Remuneraciones» del flujo de caja, por mes (YYYY-MM-01). */
      manualFlujo: Map<string, number>;
    };

async function enLotes<T, R>(items: T[], tamano: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < items.length; i += tamano) salida.push(...(await Promise.all(items.slice(i, i + tamano).map(f))));
  return salida;
}

/** La fecha de pago y si el libro del mes ya se cerró, a partir de los procesos de sueldo de BUK. */
function fechaYEstadoDelProceso(periodo: string, procesos: ProcesoBuk[]): { fechaPago: string; cerrado: boolean; nombre: string | null } {
  const sueldos = procesos.filter((p) => p.process_type === "salary_payment");
  const elegidos = sueldos.length > 0 ? sueldos : procesos;
  const ultimo = [...elegidos].sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""))[0];
  return {
    fechaPago: ultimo?.payment_date ?? ultimoDiaDelMes(periodo),
    // Con varios procesos, el mes está cerrado cuando todos lo están.
    cerrado: elegidos.length > 0 && elegidos.every((p) => p.status === "cerrado"),
    nombre: ultimo?.name ?? null,
  };
}

export async function cargarRemuneraciones(ctx: ContextoFin, v: VistaFin): Promise<DatosRemuneraciones> {
  if (!bukConfigurado()) return { estado: "sin-configurar" };
  try {
    const empresa = await empresaBuk(ctx.empresa.rut);
    const hoyPeriodo = ctx.hoy.slice(0, 7);
    const periodos = Array.from({ length: MESES_EN_PANTALLA }, (_, i) => sumarMeses(hoyPeriodo, -i));

    // Solo cuentas de banco: la tarjeta de crédito no paga sueldos ni Previred.
    const bancos = new Set(v.cuentas.filter((c) => c.tipo === "banco").map((c) => c.id));
    const movimientos: MovimientoBanco[] = v.movimientos
      .filter((m) => bancos.has(m.cuentaId))
      .map((m) => ({ id: m.id, fecha: m.fecha, glosa: m.glosa, monto: m.monto, categoria: m.categoriaNombre, cuenta: m.cuentaNombre }));
    const fechas = movimientos.map((m) => m.fecha).sort();
    const cobertura: CoberturaCartola | null = fechas.length > 0 ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : null;

    // De a tres: la API de BUK no documenta límites y no hay motivo para dispararle doce consultas juntas.
    const leidos = await enLotes(periodos, 3, async (periodo) => {
      const reciente = periodo >= sumarMeses(hoyPeriodo, -2);
      const [libro, procesos] = await Promise.all([libroDeMes(periodo, empresa.id, reciente), procesosDeMes(periodo, reciente)]);
      return { periodo, libro, procesos };
    });

    const filas: FilaMes[] = [];
    for (const { periodo, libro, procesos } of leidos) {
      if (libro.bloques.every((b) => b.items.length === 0)) continue; // mes sin liquidaciones
      const resumen = resumirCentralizacion(periodo, libro.bloques);
      const proceso = fechaYEstadoDelProceso(periodo, procesos);
      const plazo = plazoPrevired(periodo);
      filas.push({
        periodo,
        resumen,
        cerrado: proceso.cerrado,
        nombreProceso: proceso.nombre,
        sueldos: resultadoPago({ esperado: resumen.liquido, fecha: proceso.fechaPago, hoy: ctx.hoy, movimientos: movimientosDeSueldos(movimientos, proceso.fechaPago), cobertura }),
        previred: resultadoPago({ esperado: resumen.previred, fecha: plazo, hoy: ctx.hoy, movimientos: movimientosDePrevired(movimientos, periodo), cobertura }),
      });
    }

    return {
      estado: "ok",
      empresaBuk: empresa.name,
      leidoEn: Math.min(...leidos.map((l) => l.libro.leidoEn)),
      filas,
      cobertura,
      sugerencias: sugerirFlujo(v.flujo.meses.map((m) => m.mes), filas, ctx.hoy),
      manualFlujo: new Map(v.partidas.filter((p) => p.concepto === "remuneraciones").map((p) => [p.mes.slice(0, 7) + "-01", p.monto])),
    };
  } catch (e) {
    // El mensaje de BUK ya viene sin datos de personas (ver buk.ts); queda en el log del servidor para quien lo revise.
    const mensaje = e instanceof Error ? e.message.replace(/^\[buk\]\s*/, "") : "No se pudo leer BUK.";
    console.error(`[remuneraciones] ${mensaje}`);
    return { estado: "error", mensaje };
  }
}

// -----------------------------------------------------------------------------
//  El libro de UN mes, persona por persona (para el desglose y el Excel de Contabilidad).
//  Es lo más sensible del módulo: nombre, RUT y sueldo de cada persona. Solo se pide desde la página de desglose y la
//  ruta de descarga, y las dos verifican el permiso y dejan constancia de quién lo miró o lo bajó.
// -----------------------------------------------------------------------------

export interface LibroDelMes {
  periodo: string;
  empresaBuk: string;
  cerrado: boolean;
  fechaPago: string;
  plazoPrevired: string;
  resumen: ResumenMes;
  personas: PersonaLibro[];
  centralizacion: LineaCentralizacion[];
  /** Personas cuya ficha (nombre y cargo) no se pudo leer en BUK: salen solo con el RUT. */
  fichasFaltantes: number;
  leidoEn: number;
}

export type ResultadoLibro =
  | { estado: "sin-configurar" }
  | { estado: "error"; mensaje: string }
  | { estado: "vacio"; empresaBuk: string }
  | { estado: "ok"; libro: LibroDelMes };

export async function cargarLibroDelMes(ctx: ContextoFin, periodo: string): Promise<ResultadoLibro> {
  if (!bukConfigurado()) return { estado: "sin-configurar" };
  try {
    const empresa = await empresaBuk(ctx.empresa.rut);
    const reciente = periodo >= sumarMeses(ctx.hoy.slice(0, 7), -2);
    const [libro, procesos] = await Promise.all([libroDeMes(periodo, empresa.id, reciente), procesosDeMes(periodo, reciente)]);
    if (libro.bloques.every((b) => b.items.length === 0)) return { estado: "vacio", empresaBuk: empresa.name };
    const proceso = fechaYEstadoDelProceso(periodo, procesos);
    const sinNombre = desglosarPorPersona(libro.bloques);
    const { fichas, faltan } = await fichasDePersonas(sinNombre.map((p) => p.rut));
    return {
      estado: "ok",
      libro: {
        periodo,
        empresaBuk: empresa.name,
        cerrado: proceso.cerrado,
        fechaPago: proceso.fechaPago,
        plazoPrevired: plazoPrevired(periodo),
        resumen: resumirCentralizacion(periodo, libro.bloques),
        personas: conFichas(sinNombre, fichas),
        centralizacion: centralizar(libro.bloques),
        fichasFaltantes: faltan,
        leidoEn: libro.leidoEn,
      },
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message.replace(/^\[buk\]\s*/, "") : "No se pudo leer BUK.";
    console.error(`[remuneraciones] ${mensaje}`);
    return { estado: "error", mensaje };
  }
}
