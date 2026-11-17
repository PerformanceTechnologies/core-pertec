import { sumarDias, type Iso } from "./reglas";

// -----------------------------------------------------------------------------
//  Remuneraciones: el libro de BUK convertido en lo que Finanzas necesita ver, y cruzado con el banco.
//
//  Sin "server-only" y sin tocar la red: son funciones puras, para probarlas con `npm run probar-remuneraciones`
//  (datos inventados: este repositorio es público y acá no puede haber sueldos ni RUT reales).
//
//  De dónde sale cada cifra. BUK entrega, por mes, la «centralización contable»: los asientos del libro, línea a
//  línea. El debe es el costo de la empresa (sueldos, beneficios y aportes del empleador) y el haber es lo que se
//  debe pagar: el líquido a las personas, lo previsional (Previred) y el impuesto único. Debe y haber cuadran.
//  NUNCA se llevan a pantalla los RUT de las personas: se agrupa por concepto y solo se cuenta cuántas son.
// -----------------------------------------------------------------------------

/** Remuneraciones existe solo para la empresa a la que pertenece el BUK. */
export const SLUG_EMPRESA_REMUNERACIONES = "pertec";

/** Una línea del libro tal como la entrega BUK (solo los campos que se usan). */
export interface ItemContable {
  description: string;
  amount: number;
  entry_type: string;
  account: string | null;
  cost_center: string | null;
  employee_rut: string | null;
}

export interface BloqueContable {
  id: number;
  items: ItemContable[];
}

export interface LineaResumen {
  concepto: string;
  monto: number;
  personas: number;
}

export interface GrupoPrevisional {
  grupo: string;
  monto: number;
  /** Por institución (AFP, isapre…), de mayor a menor. */
  detalle: LineaResumen[];
}

export interface CentroCosto {
  centro: string;
  costo: number;
  personas: number;
}

export interface ResumenMes {
  /** «2026-10». */
  periodo: string;
  personas: number;
  /** Lo que se transfiere a las personas. */
  liquido: number;
  /** Lo previsional que se paga en Previred (AFP, salud, cesantía, mutual, caja). */
  previred: number;
  /** Impuesto único retenido: va en el F29, no en Previred. */
  impuesto: number;
  /** Otros descuentos con cargo a pagar que no calzan en lo de arriba (anticipos, préstamos…). */
  otros: number;
  /** Total del debe: lo que le cuesta el mes a la empresa. */
  costoEmpresa: number;
  /** Debe y haber del libro cuadran (con $1 de tolerancia por redondeo). */
  cuadra: boolean;
  diferencia: number;
  haberes: LineaResumen[];
  aportes: LineaResumen[];
  previsional: GrupoPrevisional[];
  centros: CentroCosto[];
}

// ---------- Clasificación de las líneas del libro --------------------------------

const CUENTA_IMPUESTO = "2120004";
const CUENTA_PREVISIONAL = "2110016";
const ES_LIQUIDO = /^l[ií]quido/i;
const ES_IMPUESTO = /^impuesto/i;
const ES_PREVISIONAL = /(prevision|previsi[oó]n|afp|isapre|fonasa|salud|cesant|mutual|caja|invalidez|rentabilidad|expectativa)/i;
const ES_APORTE_EMPLEADOR = /(mutual|cesant[ií]a empleador|seguro invalidez|aporte rentabilidad|expectativa de vida|afp prevision empleador|empleador)/i;
const CUENTA_APORTE_EMPLEADOR = "8210004";

export type TipoHaber = "liquido" | "impuesto" | "previred" | "otro";

/** Qué es una línea del HABER: lo que se le debe a las personas, al fisco o a las instituciones previsionales. */
export function clasificarHaber(it: Pick<ItemContable, "description" | "account">): TipoHaber {
  if (ES_LIQUIDO.test(it.description)) return "liquido";
  if (it.account === CUENTA_IMPUESTO || ES_IMPUESTO.test(it.description)) return "impuesto";
  if (it.account === CUENTA_PREVISIONAL || ES_PREVISIONAL.test(it.description)) return "previred";
  return "otro";
}

/** Una línea del DEBE es un aporte del empleador (mutual, cesantía, SIS…) o un haber/beneficio de la persona. */
export function esAporteEmpleador(it: Pick<ItemContable, "description" | "account">): boolean {
  return it.account === CUENTA_APORTE_EMPLEADOR || ES_APORTE_EMPLEADOR.test(it.description);
}

const GRUPOS_PREVISIONALES: [string, RegExp][] = [
  ["AFP", /(prevision|previsi[oó]n|afp|invalidez|rentabilidad|expectativa)/i],
  ["Salud", /(isapre|fonasa|salud)/i],
  ["Seguro de cesantía", /cesant/i],
  ["Mutual de seguridad", /mutual/i],
  ["Caja de compensación", /caja/i],
];

function grupoPrevisional(descripcion: string): string {
  return GRUPOS_PREVISIONALES.find(([, re]) => re.test(descripcion))?.[0] ?? "Otros previsionales";
}

/** «Prevision (PlanVital)» → «PlanVital»; «Fonasa (2.8%)» → «Fonasa»; «Mutual» → «Mutual». */
function institucion(descripcion: string): string {
  const m = descripcion.match(/\(([^()]*)\)\s*$/);
  if (m && !/[0-9%]/.test(m[1])) return m[1].trim();
  return descripcion.replace(/\s*\([^()]*\)\s*$/, "").trim() || descripcion;
}

// ---------- Resumen del mes -------------------------------------------------------

interface Acum {
  monto: number;
  ruts: Set<string>;
}

function sumar(mapa: Map<string, Acum>, clave: string, it: ItemContable): void {
  const a = mapa.get(clave) ?? { monto: 0, ruts: new Set<string>() };
  a.monto += it.amount;
  if (it.employee_rut) a.ruts.add(it.employee_rut);
  mapa.set(clave, a);
}

function lineas(mapa: Map<string, Acum>): LineaResumen[] {
  return [...mapa.entries()].map(([concepto, a]) => ({ concepto, monto: a.monto, personas: a.ruts.size })).sort((x, y) => y.monto - x.monto);
}

/** El libro de un mes (todas sus líneas, de todos los bloques de BUK) resumido por concepto. Nunca incluye RUT. */
export function resumirCentralizacion(periodo: string, bloques: BloqueContable[]): ResumenMes {
  const items = bloques.flatMap((b) => b.items);
  const personas = new Set(items.map((i) => i.employee_rut).filter((r): r is string => Boolean(r)));
  const haberes = new Map<string, Acum>();
  const aportes = new Map<string, Acum>();
  const centros = new Map<string, Acum>();
  const prev = new Map<string, Map<string, Acum>>();
  let liquido = 0, previred = 0, impuesto = 0, otros = 0, debe = 0, haber = 0;

  for (const it of items) {
    if (it.entry_type === "debit") {
      debe += it.amount;
      sumar(esAporteEmpleador(it) ? aportes : haberes, it.description, it);
      sumar(centros, it.cost_center?.trim() || "Sin centro de costo", it);
      // `sumar` sobre un mapa distinto no repite el monto: cada mapa es una vista del mismo debe.
      continue;
    }
    if (it.entry_type !== "credit") continue;
    haber += it.amount;
    const tipo = clasificarHaber(it);
    if (tipo === "liquido") liquido += it.amount;
    else if (tipo === "impuesto") impuesto += it.amount;
    else if (tipo === "otro") otros += it.amount;
    else {
      previred += it.amount;
      const grupo = grupoPrevisional(it.description);
      const m = prev.get(grupo) ?? new Map<string, Acum>();
      sumar(m, institucion(it.description), it);
      prev.set(grupo, m);
    }
  }

  const previsional: GrupoPrevisional[] = [...prev.entries()]
    .map(([grupo, m]) => {
      const detalle = lineas(m);
      return { grupo, monto: detalle.reduce((s, d) => s + d.monto, 0), detalle };
    })
    .sort((a, b) => b.monto - a.monto);

  return {
    periodo,
    personas: personas.size,
    liquido,
    previred,
    impuesto,
    otros,
    costoEmpresa: debe,
    cuadra: Math.abs(debe - haber) <= 1,
    diferencia: debe - haber,
    haberes: lineas(haberes),
    aportes: lineas(aportes),
    previsional,
    centros: [...centros.entries()].map(([centro, a]) => ({ centro, costo: a.monto, personas: a.ruts.size })).sort((x, y) => y.costo - x.costo),
  };
}

// ---------- Libro por persona (el que se le entrega a Contabilidad) -------------------

/** Los descuentos que se le hacen a la persona: lo que separa el total de haberes de su líquido. */
export interface DescuentosPersona {
  afp: number;
  salud: number;
  /** Seguro de cesantía de cargo del trabajador (el del empleador va en los aportes). */
  cesantia: number;
  impuesto: number;
  /** Lo que no calza en lo demás (anticipos, préstamos…). */
  otros: number;
}

export interface PersonaLibro {
  rut: string;
  nombre: string | null;
  cargo: string | null;
  centros: string[];
  /** Institución de AFP e isapre (o «Fonasa»), tal como las nombra BUK. */
  afp: string | null;
  salud: string | null;
  /** Sueldo base, gratificación, bonos, colación… por concepto. */
  haberes: Record<string, number>;
  /** Mutual, cesantía del empleador, SIS… por concepto: lo que paga la empresa además del sueldo. */
  aportes: Record<string, number>;
  descuentos: DescuentosPersona;
  totalHaberes: number;
  totalDescuentos: number;
  liquido: number;
  totalAportes: number;
  /** Total haberes + aportes del empleador. */
  costoEmpresa: number;
  /** haberes − descuentos − líquido: tiene que dar 0. Si no, algo del libro de BUK no se supo clasificar. */
  diferencia: number;
}

export type TipoDescuento = keyof DescuentosPersona;

/** A qué descuento de la persona corresponde una línea del haber que NO es líquido ni aporte del empleador. */
export function tipoDescuento(it: Pick<ItemContable, "description" | "account">): TipoDescuento {
  if (clasificarHaber(it) === "impuesto") return "impuesto";
  if (/(prevision|previsi[oó]n|afp)/i.test(it.description)) return "afp";
  if (/(isapre|fonasa|salud|caja)/i.test(it.description)) return "salud";
  if (/cesant/i.test(it.description)) return "cesantia";
  return "otros";
}

const sumaDe = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);

/**
 * El libro de un mes persona por persona. Una persona puede aparecer en varios bloques de BUK (se parten por AFP e
 * isapre): aquí se juntan por RUT. El nombre y el cargo no vienen en la centralización: se agregan con `conFichas`.
 */
export function desglosarPorPersona(bloques: BloqueContable[]): PersonaLibro[] {
  const porRut = new Map<string, PersonaLibro>();
  const persona = (rut: string): PersonaLibro => {
    let p = porRut.get(rut);
    if (!p) {
      p = {
        rut, nombre: null, cargo: null, centros: [], afp: null, salud: null, haberes: {}, aportes: {},
        descuentos: { afp: 0, salud: 0, cesantia: 0, impuesto: 0, otros: 0 },
        totalHaberes: 0, totalDescuentos: 0, liquido: 0, totalAportes: 0, costoEmpresa: 0, diferencia: 0,
      };
      porRut.set(rut, p);
    }
    return p;
  };

  for (const it of bloques.flatMap((b) => b.items)) {
    if (!it.employee_rut) continue;
    const p = persona(it.employee_rut);
    if (it.entry_type === "debit") {
      const destino = esAporteEmpleador(it) ? p.aportes : p.haberes;
      destino[it.description] = (destino[it.description] ?? 0) + it.amount;
      const centro = it.cost_center?.trim();
      if (centro && !p.centros.includes(centro)) p.centros.push(centro);
    } else if (it.entry_type === "credit") {
      if (clasificarHaber(it) === "liquido") p.liquido += it.amount;
      else if (!esAporteEmpleador(it)) {
        const t = tipoDescuento(it);
        p.descuentos[t] += it.amount;
        if (t === "afp" && !p.afp) p.afp = institucion(it.description);
        // La isapre manda sobre «Fonasa» y sobre la salud voluntaria, que se descuenta además de la obligatoria.
        if (t === "salud" && /isapre/i.test(it.description)) p.salud = institucion(it.description);
        else if (t === "salud" && /fonasa/i.test(it.description) && !p.salud) p.salud = "Fonasa";
      }
    }
  }

  for (const p of porRut.values()) {
    p.totalHaberes = sumaDe(p.haberes);
    p.totalAportes = sumaDe(p.aportes);
    p.totalDescuentos = sumaDe(p.descuentos as unknown as Record<string, number>);
    p.costoEmpresa = p.totalHaberes + p.totalAportes;
    p.diferencia = p.totalHaberes - p.totalDescuentos - p.liquido;
    p.centros.sort();
  }
  return ordenarPersonas([...porRut.values()]);
}

/** Alfabético por nombre; las que no tienen nombre, al final y por RUT. */
export function ordenarPersonas(ps: PersonaLibro[]): PersonaLibro[] {
  return [...ps].sort((a, b) => (a.nombre && b.nombre ? a.nombre.localeCompare(b.nombre, "es") : a.nombre ? -1 : b.nombre ? 1 : a.rut.localeCompare(b.rut)));
}

export interface FichaPersona {
  nombre: string;
  cargo: string | null;
}

/** Agrega nombre y cargo (de la ficha de BUK, por RUT) y deja la lista en orden alfabético. */
export function conFichas(personas: PersonaLibro[], fichas: Map<string, FichaPersona>): PersonaLibro[] {
  return ordenarPersonas(personas.map((p) => ({ ...p, nombre: fichas.get(p.rut)?.nombre ?? p.nombre, cargo: fichas.get(p.rut)?.cargo ?? p.cargo })));
}

/** Una línea del asiento de centralización: lo que Contabilidad registra. */
export interface LineaCentralizacion {
  cuenta: string;
  glosa: string;
  centro: string;
  debe: number;
  haber: number;
}

/** El asiento del mes, sumado por cuenta, concepto y centro de costo (sin personas). Primero el debe y después el haber. */
export function centralizar(bloques: BloqueContable[]): LineaCentralizacion[] {
  const m = new Map<string, LineaCentralizacion>();
  for (const it of bloques.flatMap((b) => b.items)) {
    if (it.entry_type !== "debit" && it.entry_type !== "credit") continue;
    const cuenta = it.account ?? "";
    const centro = it.cost_center?.trim() ?? "";
    const k = `${it.entry_type}|${cuenta}|${it.description}|${centro}`;
    const l = m.get(k) ?? { cuenta, glosa: it.description, centro, debe: 0, haber: 0 };
    if (it.entry_type === "debit") l.debe += it.amount;
    else l.haber += it.amount;
    m.set(k, l);
  }
  return [...m.values()].sort((a, b) => Number(b.debe > 0) - Number(a.debe > 0) || a.cuenta.localeCompare(b.cuenta) || a.glosa.localeCompare(b.glosa, "es") || a.centro.localeCompare(b.centro));
}

// ---------- Fechas ------------------------------------------------------------------

/** Un mes pedido por la URL: «YYYY-MM», de 2020 en adelante y no futuro. Todo lo demás se rechaza antes de consultar BUK. */
export function periodoValido(p: unknown, hoy: Iso): p is string {
  return typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p) && p >= "2020-01" && p <= hoy.slice(0, 7);
}

/** «2026-10» + n meses. */
export function sumarMeses(periodo: string, n: number): string {
  const d = new Date(`${periodo}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

export function ultimoDiaDelMes(periodo: string): Iso {
  const d = new Date(`${sumarMeses(periodo, 1)}-01T12:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Si cae fin de semana, al lunes. No conoce feriados: es un plazo de referencia, no una obligación calculada. */
function alHabil(iso: Iso): Iso {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dia === 6 ? sumarDias(iso, 2) : dia === 0 ? sumarDias(iso, 1) : iso;
}

/** Plazo de referencia para pagar en Previred las cotizaciones de un mes: el 13 del mes siguiente (o el lunes siguiente). */
export function plazoPrevired(periodo: string): Iso {
  return alHabil(`${sumarMeses(periodo, 1)}-13`);
}

// ---------- Estado de pago, cruzado con el banco ------------------------------------

export type EstadoPago = "Pagado" | "Parcial" | "Por pagar" | "Pendiente" | "Sin cartola";

/** Un movimiento de banco de Tesorería (solo lo que hace falta para reconocer el pago). */
export interface MovimientoBanco {
  id: string;
  fecha: Iso;
  glosa: string;
  /** Negativo = salida de plata. */
  monto: number;
  categoria: string | null;
  cuenta: string;
}

export interface ResultadoPago {
  estado: EstadoPago;
  esperado: number;
  pagado: number;
  /** Lo que falta (nunca negativo). */
  saldo: number;
  /** La fecha en que debía pagarse. */
  fecha: Iso;
  /** Los movimientos del banco que se reconocieron como este pago. */
  movimientos: MovimientoBanco[];
}

const ES_PREVIRED = /previred/i;
const ES_SUELDO = /(remuneraci|sueldo|n[oó]mina)/i;

const esSalida = (m: MovimientoBanco) => m.monto < 0;
const textoDe = (m: MovimientoBanco) => `${m.glosa} ${m.categoria ?? ""}`;

/**
 * Movimientos que son el pago de sueldos de un mes: salidas del banco cercanas a la fecha de pago, que Tesorería
 * categorizó como remuneraciones o cuya glosa dice sueldo/remuneración/nómina. Lo de Previred no entra.
 */
export function movimientosDeSueldos(movs: MovimientoBanco[], fechaPago: Iso): MovimientoBanco[] {
  const desde = sumarDias(fechaPago, -5);
  const hasta = sumarDias(fechaPago, 10);
  return movs.filter((m) => esSalida(m) && m.fecha >= desde && m.fecha <= hasta && !ES_PREVIRED.test(textoDe(m)) && ES_SUELDO.test(textoDe(m)));
}

/** Movimientos que son el pago en Previred de las cotizaciones de un mes: del 1 del mes siguiente hasta 10 días después del plazo. */
export function movimientosDePrevired(movs: MovimientoBanco[], periodo: string): MovimientoBanco[] {
  const desde = `${sumarMeses(periodo, 1)}-01`;
  const hasta = sumarDias(plazoPrevired(periodo), 10);
  return movs.filter((m) => esSalida(m) && m.fecha >= desde && m.fecha <= hasta && ES_PREVIRED.test(textoDe(m)));
}

/** Desde y hasta qué fechas hay movimientos de banco cargados en Tesorería. */
export interface CoberturaCartola {
  desde: Iso;
  hasta: Iso;
}

/**
 * Pagado / Parcial / Por pagar / Pendiente / Sin cartola.
 *  · «Por pagar»: todavía no llega la fecha.
 *  · «Pendiente»: ya pasó la fecha, la cartola cargada CUBRE esa fecha y el pago no aparece.
 *  · «Sin cartola»: ya pasó la fecha pero el banco cargado no llega o no empieza ahí: no se puede saber (no es un atraso).
 */
export function resultadoPago(d: { esperado: number; fecha: Iso; hoy: Iso; movimientos: MovimientoBanco[]; cobertura: CoberturaCartola | null }): ResultadoPago {
  const pagado = d.movimientos.reduce((s, m) => s - m.monto, 0);
  const tolerancia = Math.max(1000, Math.round(d.esperado * 0.005));
  const saldo = Math.max(0, d.esperado - pagado);
  let estado: EstadoPago;
  // `pagado > 0`: sin ningún movimiento no hay pago, por pequeño que sea lo esperado (la tolerancia no lo vuelve «pagado»).
  if (pagado > 0 && pagado >= d.esperado - tolerancia) estado = "Pagado";
  else if (pagado > 0) estado = "Parcial";
  else if (d.hoy <= d.fecha) estado = "Por pagar";
  else if (d.cobertura !== null && d.cobertura.desde <= d.fecha && d.cobertura.hasta >= d.fecha) estado = "Pendiente";
  else estado = "Sin cartola";
  return { estado, esperado: d.esperado, pagado, saldo: estado === "Pagado" ? 0 : saldo, fecha: d.fecha, movimientos: d.movimientos };
}

// ---------- Una fila por mes y la sugerencia para el flujo de caja -------------------

export interface FilaMes {
  periodo: string;
  resumen: ResumenMes;
  /** El proceso del mes en BUK ya se cerró (si no, las cifras son provisorias). */
  cerrado: boolean;
  nombreProceso: string | null;
  sueldos: ResultadoPago;
  previred: ResultadoPago;
}

/** Hasta cuántos días atrás se arrastra un pago que venció y no aparece en el banco. */
const DIAS_ATRASO_MAXIMO = 45;

export interface ParteSugerencia {
  concepto: string;
  monto: number;
  nota: string;
}

export interface SugerenciaFlujo {
  /** Primer día del mes del flujo de caja. */
  mes: Iso;
  monto: number;
  partes: ParteSugerencia[];
  /** Alguna parte es una estimación (todavía no hay libro de ese mes). */
  estimado: boolean;
}

/** Lo que se le dice a quien mira la sugerencia, según cómo va ese pago en el banco. */
function notaDePago(estado: EstadoPago, base: string): string {
  if (estado === "Pagado") return "Ya pagado";
  if (estado === "Parcial") return "Falta una parte";
  if (estado === "Pendiente") return "Atrasado: no aparece en el banco";
  if (estado === "Sin cartola") return `${base} (sin cartola al día: no se sabe si ya se pagó)`;
  return base;
}

/**
 * Cuánto de remuneraciones sale de la caja en cada mes del flujo.
 *  · Los sueldos de un mes salen cuando se pagan (su fecha de pago) y lo previsional, cuando vence en Previred.
 *  · Lo que el banco ya muestra pagado no se suma: el flujo parte de la caja real de hoy y ya no lo tiene.
 *  · Lo atrasado (venció, el banco está al día y no aparece) cae en el primer mes, como el resto del flujo. Solo se arrastra
 *    lo de los últimos 45 días: algo más viejo que no aparece suele ser un pago que no se supo reconocer, no una deuda.
 *  · Un mes sin libro todavía se estima igual que el último que sí lo tiene.
 * El impuesto único no entra: va en el F29, que tiene su propia fila en el flujo (Impuestos).
 */
export function sugerirFlujo(mesesFlujo: Iso[], filas: FilaMes[], hoy: Iso): SugerenciaFlujo[] {
  if (mesesFlujo.length === 0) return [];
  const ordenadas = [...filas].sort((a, b) => b.periodo.localeCompare(a.periodo));
  const ultima = ordenadas[0] ?? null;
  const mesDe = (f: Iso) => f.slice(0, 7);
  const primero = mesDe(mesesFlujo[0]);
  const limiteAtraso = sumarDias(hoy, -DIAS_ATRASO_MAXIMO);
  const sueldosEn = new Map<string, FilaMes[]>();
  const previredEn = new Map<string, FilaMes[]>();
  for (const f of filas) {
    const a = mesDe(f.sueldos.fecha);
    sueldosEn.set(a, [...(sueldosEn.get(a) ?? []), f]);
    const b = mesDe(f.previred.fecha);
    previredEn.set(b, [...(previredEn.get(b) ?? []), f]);
  }

  return mesesFlujo.map((mes, i) => {
    const m = mesDe(mes);
    const partes: ParteSugerencia[] = [];
    let estimado = false;

    const delMes = [...(sueldosEn.get(m) ?? [])];
    const previredDelMes = [...(previredEn.get(m) ?? [])];
    // Lo atrasado de meses anteriores, solo en el primer mes del flujo y solo si es reciente.
    if (i === 0) {
      for (const f of filas) {
        if (mesDe(f.sueldos.fecha) < primero && f.sueldos.estado === "Pendiente" && f.sueldos.fecha >= limiteAtraso) delMes.push(f);
        if (mesDe(f.previred.fecha) < primero && f.previred.estado === "Pendiente" && f.previred.fecha >= limiteAtraso) previredDelMes.push(f);
      }
    }

    if (delMes.length > 0) {
      for (const f of delMes) partes.push({ concepto: `Sueldos de ${f.periodo}`, monto: f.sueldos.saldo, nota: notaDePago(f.sueldos.estado, f.cerrado ? "Libro cerrado en BUK" : "Provisorio: el libro sigue abierto en BUK") });
    } else if (ultima) {
      partes.push({ concepto: `Sueldos (estimado)`, monto: ultima.resumen.liquido, nota: `Igual que ${ultima.periodo}, el último libro` });
      estimado = true;
    }

    if (previredDelMes.length > 0) {
      for (const f of previredDelMes) partes.push({ concepto: `Previred de ${f.periodo}`, monto: f.previred.saldo, nota: notaDePago(f.previred.estado, `Vence ${f.previred.fecha.split("-").reverse().join("-")}`) });
    } else if (ultima) {
      partes.push({ concepto: `Previred (estimado)`, monto: ultima.resumen.previred, nota: `Igual que ${ultima.periodo}, el último libro` });
      estimado = true;
    }

    return { mes, monto: partes.reduce((s, p) => s + p.monto, 0), partes, estimado };
  });
}
