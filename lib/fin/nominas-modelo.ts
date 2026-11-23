import { finDeMes, inicioDeMes, sumarDias, type Iso } from "./reglas";

// -----------------------------------------------------------------------------
//  Nóminas del banco (Itaú vía Emisso) cruzadas con el líquido de BUK. PURO: sin red ni base, para probarlo con
//  `npm run probar-nominas` (datos inventados: este repositorio es público y acá no puede haber sueldos ni RUT reales).
//
//  Qué se valida. BUK dice cuánto líquido le toca a cada persona en el mes; el banco dice cuánto se le pagó a cada
//  beneficiario en cada nómina. Se compara persona por persona y por RUT. Lo que se aprendió con datos reales
//  (septiembre y octubre de 2026):
//
//  · El líquido se paga en UNA nómina que cubre a todas las personas. Pero a las mismas personas se les paga además
//    fuera del líquido (anticipos, bonos, reembolsos), a veces en nóminas que mezclan proveedores. Por eso no se suma
//    todo lo pagado a una persona: se elige LA nómina que cubre más gente de BUK y lo demás se informa aparte, sin
//    mezclarlo con el líquido (mezclado daba diferencias falsas).
//  · Itaú registra el cargo hasta 3 días hábiles después de la fecha de pago de la nómina: el ligado al movimiento va
//    por monto exacto con unos días de margen, nunca por fecha exacta.
//  · La tolerancia es de $1 por persona (redondeo), no un porcentaje: una diferencia de $700 es justamente lo que se
//    quiere ver.
// -----------------------------------------------------------------------------

/** Un RUT para comparar: solo dígitos y K, sin puntos ni guion. */
export const claveRut = (rut: string | null | undefined): string => (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();

/** «Pagada» (la nómina) o «Pagado» (un pago). Rechazada, en proceso o validada no cuentan como pagadas. */
export const estaPagada = (estado: string | null | undefined): boolean => /pagad/i.test(estado ?? "");

export interface LineaNomina {
  idLinea: string;
  rut: string;
  nombre: string | null;
  monto: number;
  moneda: string;
  estado: string;
}

/** El cargo de Tesorería que pagó la nómina (solo lo que se muestra). */
export interface CargoDeNomina {
  fecha: Iso;
  glosa: string;
  monto: number;
}

export interface NominaBanco {
  idNomina: string;
  fechaPago: Iso | null;
  fechaCreacion: Iso;
  descripcion: string | null;
  estado: string;
  moneda: string;
  monto: number;
  lineas: LineaNomina[];
  movimientoId: string | null;
  movimiento: CargoDeNomina | null;
}

// ---------- Ligar cada nómina con su cargo en el banco ----------------------------------

/** Itaú publica el cargo entre el mismo día y 3 días después (fines de semana y feriados); uno de margen. */
export const DIAS_DE_DESFASE_DEL_CARGO = 4;

export interface CargoCandidato {
  id: string;
  fecha: Iso;
  /** Negativo = salida de plata. */
  monto: number;
}

export interface ResultadoLigado {
  /** idNomina → id del movimiento. Solo las nóminas que se ligaron ahora. */
  ligas: Map<string, string>;
  /** Más de un cargo calza igual: no se liga ninguno, lo decide una persona. */
  ambiguas: string[];
  /** Pagada, pero ningún cargo calza (el movimiento todavía no llega o no está en Tesorería). */
  sinCargo: string[];
}

/**
 * Liga las nóminas PAGADAS que aún no tienen cargo con el movimiento de salida del mismo monto, entre la fecha de pago y
 * unos días después. Un movimiento ya ligado a otra nómina no se reutiliza. Si dos cargos calzan igual, no se adivina.
 */
export function ligarNominas(
  nominas: Pick<NominaBanco, "idNomina" | "fechaPago" | "monto" | "estado" | "movimientoId">[],
  cargos: CargoCandidato[],
): ResultadoLigado {
  const usados = new Set(nominas.map((n) => n.movimientoId).filter((x): x is string => Boolean(x)));
  const res: ResultadoLigado = { ligas: new Map(), ambiguas: [], sinCargo: [] };
  const pendientes = nominas
    .filter((n) => estaPagada(n.estado) && n.fechaPago && !n.movimientoId)
    .sort((a, b) => (a.fechaPago as string).localeCompare(b.fechaPago as string) || a.idNomina.localeCompare(b.idNomina));
  for (const n of pendientes) {
    const pago = n.fechaPago as Iso;
    const tope = sumarDias(pago, DIAS_DE_DESFASE_DEL_CARGO);
    const monto = Math.round(n.monto);
    const candidatos = cargos.filter((c) => !usados.has(c.id) && c.monto === -monto && c.fecha >= pago && c.fecha <= tope);
    if (candidatos.length === 1) {
      res.ligas.set(n.idNomina, candidatos[0].id);
      usados.add(candidatos[0].id);
    } else if (candidatos.length > 1) res.ambiguas.push(n.idNomina);
    else res.sinCargo.push(n.idNomina);
  }
  return res;
}

// ---------- Validar el líquido de BUK contra lo pagado ----------------------------------

/** Redondeo: una diferencia de más de $1 en una persona es una diferencia real. */
export const TOLERANCIA_POR_PERSONA = 1;

/** Días antes y después de la fecha de pago de BUK en que se buscan nóminas del mes. */
const VENTANA_DIAS = 12;

export type EstadoValidacion = "Cuadra" | "Diferencias" | "Por pagar" | "Sin nómina" | "Sin datos";
export type EstadoPersona = "igual" | "difiere" | "sin pago";

export interface PersonaLiquido {
  rut: string;
  liquido: number;
}

export interface PersonaValidada {
  rut: string;
  liquido: number;
  pagado: number;
  /** Pagado − líquido: positivo = se pagó de más. */
  diferencia: number;
  estado: EstadoPersona;
}

/** Otra nómina del mes que le pagó a personas de BUK, fuera del líquido (anticipos, bonos, reembolsos). */
export interface OtroPago {
  idNomina: string;
  fechaPago: Iso | null;
  personas: number;
  monto: number;
  /** La nómina trae además pagos a gente que no es de BUK (proveedores). */
  mixta: boolean;
}

export interface ValidacionMes {
  estado: EstadoValidacion;
  /** La nómina elegida como el pago del líquido (null si no hay). */
  nomina: { idNomina: string; fechaPago: Iso | null; estado: string; monto: number; movimiento: CargoDeNomina | null } | null;
  ventana: { desde: Iso; hasta: Iso };
  totalBuk: number;
  /** Lo pagado en esa nómina a personas de BUK. */
  totalPagado: number;
  diferenciaNeta: number;
  igual: number;
  difieren: number;
  sinPago: number;
  /** Pagos de la misma nómina a quien no está en el libro de BUK de ese mes. */
  extras: { personas: number; monto: number };
  /** Pagos de esa nómina que el banco no realizó (rechazados o pendientes). */
  noPagados: number;
  otros: OtroPago[];
  alertas: string[];
  personas: PersonaValidada[];
}

/** Lo mismo sin el detalle por persona (sin RUT): lo que puede llegar a la pestaña Remuneraciones. */
export type ResumenValidacion = Omit<ValidacionMes, "personas">;

export function resumenDeValidacion(v: ValidacionMes): ResumenValidacion {
  const { personas: _personas, ...resto } = v;
  void _personas;
  return resto;
}

const sumar = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function validarMes(d: {
  /** El mes del libro: «2026-10». Los pagos extra se informan por mes calendario. */
  periodo: string;
  /** Fecha de pago según el proceso de BUK. */
  fechaPagoBuk: Iso;
  /** El libro del mes sigue abierto en BUK: el líquido es provisorio. */
  cerrado: boolean;
  personas: PersonaLiquido[];
  nominas: NominaBanco[];
  hoy: Iso;
}): ValidacionMes {
  const ventana = { desde: sumarDias(d.fechaPagoBuk, -VENTANA_DIAS), hasta: sumarDias(d.fechaPagoBuk, VENTANA_DIAS) };
  const buk = new Map<string, number>();
  for (const p of d.personas) if (p.liquido > 0) buk.set(claveRut(p.rut), (buk.get(claveRut(p.rut)) ?? 0) + p.liquido);
  const totalBuk = sumar([...buk.values()]);
  const base: ValidacionMes = {
    estado: "Sin datos", nomina: null, ventana, totalBuk, totalPagado: 0, diferenciaNeta: 0, igual: 0, difieren: 0, sinPago: 0,
    extras: { personas: 0, monto: 0 }, noPagados: 0, otros: [], alertas: [], personas: [],
  };
  if (!d.cerrado) base.alertas.push("El libro sigue abierto en BUK: el líquido es provisorio y puede cambiar antes del pago.");

  // Sin nóminas desde antes de esa fecha de pago, no hay nada con qué comparar (no es un atraso).
  const datosDesde = d.nominas.map((n) => n.fechaCreacion).sort()[0];
  if (!datosDesde || datosDesde > d.fechaPagoBuk) return base;

  const fechaDe = (n: NominaBanco): Iso => n.fechaPago ?? n.fechaCreacion;
  const enVentana = d.nominas.filter((n) => fechaDe(n) >= ventana.desde && fechaDe(n) <= ventana.hasta);

  const lineasDeBuk = (n: NominaBanco) => n.lineas.filter((l) => buk.has(claveRut(l.rut)));
  const cobertura = (n: NominaBanco) => new Set(lineasDeBuk(n).filter((l) => estaPagada(l.estado)).map((l) => claveRut(l.rut))).size;
  const pagadoABuk = (n: NominaBanco) => sumar(lineasDeBuk(n).filter((l) => estaPagada(l.estado)).map((l) => l.monto));

  // LA nómina del líquido: la pagada que cubre a más gente de BUK; si empatan, la de monto más cercano al líquido.
  const minimo = Math.max(1, Math.ceil(buk.size / 2));
  const elegida = enVentana
    .filter((n) => estaPagada(n.estado) && cobertura(n) >= minimo)
    .sort((a, b) => cobertura(b) - cobertura(a) || Math.abs(pagadoABuk(a) - totalBuk) - Math.abs(pagadoABuk(b) - totalBuk) || a.idNomina.localeCompare(b.idNomina))[0];

  // Los pagos extra se informan por mes calendario (un bono del día 16 es del mes aunque el líquido se pague el 30).
  const mesDesde = inicioDeMes(`${d.periodo}-01`);
  const mesHasta = finDeMes(`${d.periodo}-01`);
  const otras = d.nominas.filter((n) => n !== elegida && fechaDe(n) >= mesDesde && fechaDe(n) <= mesHasta);
  base.otros = otras
    .filter((n) => estaPagada(n.estado))
    .map((n) => ({ n, mias: lineasDeBuk(n).filter((l) => estaPagada(l.estado)) }))
    .filter((x) => x.mias.length > 0)
    .map((x) => ({ idNomina: x.n.idNomina, fechaPago: x.n.fechaPago, personas: new Set(x.mias.map((l) => claveRut(l.rut))).size, monto: sumar(x.mias.map((l) => l.monto)), mixta: x.mias.length < x.n.lineas.length }))
    .sort((a, b) => (a.fechaPago ?? "").localeCompare(b.fechaPago ?? ""));
  const sinPagar = otras.filter((n) => !estaPagada(n.estado) && lineasDeBuk(n).length > 0).length;
  if (sinPagar > 0) base.alertas.push(`Hay ${sinPagar} ${sinPagar === 1 ? "nómina rechazada o sin pagar" : "nóminas rechazadas o sin pagar"} con pagos a personas de BUK en este mes.`);

  if (!elegida) {
    // Todavía no llega la fecha de pago (con un día de margen para la nómina del mismo día): no es un atraso.
    base.estado = d.hoy <= sumarDias(d.fechaPagoBuk, 1) ? "Por pagar" : "Sin nómina";
    if (base.estado === "Sin nómina") base.alertas.push("No hay una nómina pagada que cubra a las personas de este libro: revisa en el banco cómo se pagaron los sueldos.");
    return base;
  }

  const lineas = elegida.lineas;
  const pagadas = lineas.filter((l) => estaPagada(l.estado));
  const personas: PersonaValidada[] = [...buk].map(([rut, liquido]) => {
    const propias = pagadas.filter((l) => claveRut(l.rut) === rut);
    const pagado = sumar(propias.map((l) => l.monto));
    const diferencia = pagado - liquido;
    const estado: EstadoPersona = propias.length === 0 ? "sin pago" : Math.abs(diferencia) <= TOLERANCIA_POR_PERSONA ? "igual" : "difiere";
    return { rut, liquido, pagado, diferencia, estado };
  });
  const extras = pagadas.filter((l) => !buk.has(claveRut(l.rut)));
  const noPagados = lineas.filter((l) => !estaPagada(l.estado)).length;

  base.nomina = { idNomina: elegida.idNomina, fechaPago: elegida.fechaPago, estado: elegida.estado, monto: elegida.monto, movimiento: elegida.movimiento };
  base.personas = personas;
  base.totalPagado = sumar(personas.map((p) => p.pagado));
  base.diferenciaNeta = base.totalPagado - totalBuk;
  base.igual = personas.filter((p) => p.estado === "igual").length;
  base.difieren = personas.filter((p) => p.estado === "difiere").length;
  base.sinPago = personas.filter((p) => p.estado === "sin pago").length;
  base.extras = { personas: new Set(extras.map((l) => claveRut(l.rut))).size, monto: sumar(extras.map((l) => l.monto)) };
  base.noPagados = noPagados;
  base.estado = base.difieren === 0 && base.sinPago === 0 && extras.length === 0 && noPagados === 0 ? "Cuadra" : "Diferencias";
  if (!elegida.movimiento) base.alertas.push("La nómina no tiene su cargo en Tesorería: el movimiento del banco todavía no llega o no está cargado.");
  return base;
}
