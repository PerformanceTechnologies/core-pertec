// -----------------------------------------------------------------------------
//  Banco automático (Emisso Connect → Tesorería): la parte PURA, sin red ni base.
//
//  Emisso lee el portal Itaú Corporate con el usuario consultivo y guarda saldos y los últimos 100 movimientos de
//  cada cuenta. Aquí se traducen al formato del Core. Las trampas, verificadas con datos reales (17-11-2026):
//
//  · 'type' va según el LIBRO DEL BANCO: 'debit' es plata que ENTRA (abono) y 'credit' plata que SALE (cargo).
//    Al revés de la lectura intuitiva. En el Core un abono es positivo y un cargo negativo.
//  · 'monto' viene SIN signo. null en 'monto' o en 'type' = el portal no trajo la celda: la fila no se adivina.
//  · El 'id' de Emisso incluye los primeros 28 caracteres de la glosa: si el banco la corrige, cambia. La
//    identidad del Core es cuenta + 'documento' (el número de movimiento correlativo de Itaú en «últimos
//    movimientos»), que no depende de la glosa. Sin documento se cae al id de Emisso.
//  · Tesorería es en pesos (numeric(18,0)): de la cuenta dólar solo se guardan los saldos, no los movimientos.
//  · La cartola histórica (superficie «cartola_historica», meses anteriores) trae el número de cuenta SIN el 0
//    inicial (9 dígitos) y sin documento en más de la mitad de las filas. La cuenta se reconoce por el número sin
//    ceros a la izquierda, y de la cartola solo entra lo anterior al primer día que ya trae «últimos movimientos»:
//    así las dos fuentes no se pisan (sus claves no coinciden, porque la de la cartola cae al id de Emisso).
// -----------------------------------------------------------------------------

export type Iso = string;

export interface ContraparteEmisso {
  rut: string | null;
  nombre: string | null;
  banco: string | null;
}

export interface MovimientoEmisso {
  id: string;
  numeroCuenta: string;
  currency: string;
  periodo: string;
  fecha: string | null;
  descripcion: string | null;
  documento: string | null;
  monto: number | null;
  type: "credit" | "debit" | null;
  saldo: number | null;
  oficina?: string | null;
  contraparte: ContraparteEmisso | null;
  superficie?: string | null;
  syncedAt: string;
}

export interface SaldoEmisso {
  numeroCuenta: string;
  currency: string;
  observedDay: string;
  observedAt: string;
  saldoTotal: number | null;
  retenciones: number | null;
  saldoDisponible: number | null;
  saldoDisponibleLineaCredito: number | null;
  syncedAt: string;
}

export interface LineaNominaEmisso {
  idLinea: string;
  beneficiario: string;
  beneficiarioRut: string;
  monto: number;
  moneda: string;
  estado: string;
}

export interface NominaEmisso {
  idNomina: string;
  fechaPago: string | null;
  fechaCreacion: string;
  descripcion: string;
  estado: string;
  moneda: string;
  monto: number;
  lineas: LineaNominaEmisso[];
}

/** Sistema de Emisso que alimenta esto. Itaú Empresas (otro portal) tendría su propio origen. */
export const SISTEMA_ITAU = "itau_corporate";

/** El vínculo guardado en fin_cuentas.origen_externo y en fin_saldos_diarios.origen. */
export function origenDe(sistema: string, numeroCuenta: string): string {
  return `emisso:${sistema}:${numeroCuenta}`;
}

/** Abono positivo, cargo negativo. null si el banco no informó monto o sentido. */
export function montoConSigno(m: Pick<MovimientoEmisso, "monto" | "type">): number | null {
  if (m.monto === null || m.monto === undefined || !Number.isFinite(m.monto)) return null;
  if (m.type === "debit") return Math.abs(m.monto);
  if (m.type === "credit") return -Math.abs(m.monto);
  return null;
}

/** Identidad del movimiento en el banco, estable aunque cambie la glosa. */
export function claveExterna(sistema: string, m: Pick<MovimientoEmisso, "numeroCuenta" | "documento" | "id">): string {
  const doc = (m.documento ?? "").trim();
  return doc ? `${sistema}:${m.numeroCuenta}:${doc}` : `${sistema}:${m.numeroCuenta}:id:${m.id}`;
}

/** RUT en el formato del Core (cuerpo-DV, sin puntos, DV en mayúscula), o null. */
export function rutNormalizado(rut: string | null | undefined): string | null {
  const limpio = (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return null;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

export interface FilaBanco {
  clave: string;
  numeroCuenta: string;
  /** De qué parte del portal viene: la cartola de meses anteriores o los últimos movimientos. */
  deCartola?: boolean;
  fecha: Iso;
  glosa: string;
  monto: number;
  documento: string | null;
  contraparteRut: string | null;
}

export type Traduccion = { ok: true; fila: FilaBanco } | { ok: false; motivo: string };

/** Un movimiento de Emisso → una fila de Tesorería, o el motivo por el que no entra. */
export function traducirMovimiento(sistema: string, m: MovimientoEmisso): Traduccion {
  if (m.currency !== "CLP") return { ok: false, motivo: `moneda ${m.currency}` };
  if (!m.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) return { ok: false, motivo: "sin fecha" };
  const monto = montoConSigno(m);
  if (monto === null) return { ok: false, motivo: "sin monto o sin sentido" };
  if (monto === 0) return { ok: false, motivo: "monto cero" };
  const glosa = (m.descripcion ?? "").replace(/\s+/g, " ").trim() || "(sin glosa)";
  return {
    ok: true,
    fila: {
      clave: claveExterna(sistema, m),
      numeroCuenta: m.numeroCuenta,
      ...(m.superficie === "cartola_historica" ? { deCartola: true } : {}),
      fecha: m.fecha,
      glosa,
      monto: Math.round(monto),
      documento: m.documento?.trim() || null,
      contraparteRut: rutNormalizado(m.contraparte?.rut),
    },
  };
}

export interface Traducidos {
  filas: FilaBanco[];
  omitidos: { motivo: string; cantidad: number }[];
}

/** Traduce el lote. Una clave repetida en el mismo lote se queda con la primera (la más reciente). */
export function traducirMovimientos(sistema: string, movs: MovimientoEmisso[]): Traducidos {
  const filas = new Map<string, FilaBanco>();
  const omitidos = new Map<string, number>();
  for (const m of movs) {
    const t = traducirMovimiento(sistema, m);
    if (!t.ok) omitidos.set(t.motivo, (omitidos.get(t.motivo) ?? 0) + 1);
    else if (!filas.has(t.fila.clave)) filas.set(t.fila.clave, t.fila);
  }
  return { filas: [...filas.values()], omitidos: [...omitidos].map(([motivo, cantidad]) => ({ motivo, cantidad })) };
}

/** El número de cuenta para comparar: sin ceros a la izquierda (la cartola histórica los omite). */
export const numeroComparable = (numero: string): string => numero.trim().replace(/^0+/, "");

/**
 * Las cuentas en pesos con movimientos: las que pasan a ser cuentas de Tesorería. La línea de crédito no tiene. Si la
 * misma cuenta viene escrita de dos formas (con y sin el 0 inicial), queda una sola: la de «últimos movimientos».
 */
export function cuentasConMovimientos(filas: FilaBanco[]): string[] {
  const porComparable = new Map<string, string>();
  for (const f of [...filas].sort((a, b) => Number(Boolean(a.deCartola)) - Number(Boolean(b.deCartola)))) {
    const k = numeroComparable(f.numeroCuenta);
    if (!porComparable.has(k)) porComparable.set(k, f.numeroCuenta);
  }
  return [...porComparable.values()].sort();
}

/**
 * De la cartola histórica, solo lo anterior al primer día con «últimos movimientos» de esa cuenta (en este lote o ya
 * guardado en el Core: `desdeGuardado`, por número comparable). Lo demás no se toca.
 */
export function sinSolaparCartola(filas: FilaBanco[], desdeGuardado: Map<string, Iso> = new Map()): { filas: FilaBanco[]; descartadas: number } {
  const corte = new Map<string, Iso>(desdeGuardado);
  for (const f of filas) {
    if (f.deCartola) continue;
    const k = numeroComparable(f.numeroCuenta);
    if (!corte.has(k) || f.fecha < corte.get(k)!) corte.set(k, f.fecha);
  }
  const salida = filas.filter((f) => !f.deCartola || !corte.has(numeroComparable(f.numeroCuenta)) || f.fecha < corte.get(numeroComparable(f.numeroCuenta))!);
  return { filas: salida, descartadas: filas.length - salida.length };
}

/** Nombre con que se crea la cuenta la primera vez (después se puede cambiar en Configuración). */
export function nombreCuenta(banco: string, numeroCuenta: string): string {
  return `${banco} CC ${numeroCuenta.slice(-4)}`;
}

export function numeroEnmascarado(numeroCuenta: string): string {
  return `•••${numeroCuenta.slice(-4)}`;
}

/** La foto más reciente por cuenta y moneda (Emisso las entrega de la más nueva a la más vieja, pero no se confía en el orden). */
export function saldosVigentes(saldos: SaldoEmisso[]): SaldoEmisso[] {
  const ultimo = new Map<string, SaldoEmisso>();
  for (const s of saldos) {
    const k = `${s.numeroCuenta}|${s.currency}`;
    const prev = ultimo.get(k);
    if (!prev || s.observedAt > prev.observedAt) ultimo.set(k, s);
  }
  return [...ultimo.values()].sort((a, b) => a.numeroCuenta.localeCompare(b.numeroCuenta) || a.currency.localeCompare(b.currency));
}

/** Lo que cambió de una fila ya guardada: solo glosa, documento y RUT. El monto y la fecha no se tocan (podría estar conciliada). */
export function cambiosDeFila(
  guardada: { glosa: string; numero_documento: string | null; contraparte_rut: string | null },
  nueva: FilaBanco,
): Partial<{ glosa: string; numero_documento: string | null; contraparte_rut: string | null }> | null {
  const c: Partial<{ glosa: string; numero_documento: string | null; contraparte_rut: string | null }> = {};
  if (guardada.glosa !== nueva.glosa) c.glosa = nueva.glosa;
  if ((guardada.numero_documento ?? null) !== nueva.documento) c.numero_documento = nueva.documento;
  if ((guardada.contraparte_rut ?? null) !== nueva.contraparteRut && nueva.contraparteRut) c.contraparte_rut = nueva.contraparteRut;
  return Object.keys(c).length ? c : null;
}

/** Motivos de Emisso que exigen que una persona actúe (y por eso NO se reintenta: Itaú bloquea la clave). */
const MOTIVOS_DE_PERSONA = ["credencial_rechazada", "clave_bloqueada", "connection_credential_required", "credencial", "bloque"];

export function requierePersona(codigoOMotivo: string | null | undefined): boolean {
  const t = (codigoOMotivo ?? "").toLowerCase();
  return MOTIVOS_DE_PERSONA.some((m) => t.includes(m));
}

/** Horas desde la última lectura del banco. Más de 30 = Emisso dejó de sincronizar (pausa por fallos, por ejemplo). */
export function horasDesde(marca: string | null | undefined, ahora: Date): number | null {
  if (!marca) return null;
  const t = Date.parse(marca);
  return Number.isFinite(t) ? (ahora.getTime() - t) / 3_600_000 : null;
}

export const HORAS_DATO_VIEJO = 30;

/** Hoy y el mes anterior en calendario chileno (AAAA-MM). */
export function periodosRecientes(ahora: Date): string[] {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).format(ahora);
  const [a, m] = dia.split("-").map(Number);
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  return [anterior, `${a}-${String(m).padStart(2, "0")}`];
}

export interface FilaNomina {
  idNomina: string;
  fechaPago: Iso | null;
  fechaCreacion: Iso;
  descripcion: string | null;
  estado: string;
  moneda: string;
  monto: number;
  lineas: { idLinea: string; rut: string; nombre: string | null; monto: number; moneda: string; estado: string }[];
}

/**
 * Las nóminas de Emisso → filas de Tesorería. Una nómina sin identificador o sin fecha de creación válida no entra
 * (no hay forma de reconocerla después); un identificador repetido se queda con la primera. El RUT se guarda en el
 * formato del Core (cuerpo-DV): la comparación con BUK ignora puntos y guion de todos modos.
 */
export function traducirNominas(noms: NominaEmisso[]): { filas: FilaNomina[]; omitidas: number } {
  const filas = new Map<string, FilaNomina>();
  let omitidas = 0;
  const iso = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  for (const n of noms) {
    const creada = iso(n.fechaCreacion);
    if (!n.idNomina || !creada || filas.has(n.idNomina)) {
      omitidas++;
      continue;
    }
    const lineas = new Map<string, FilaNomina["lineas"][number]>();
    for (const l of n.lineas ?? []) {
      if (!l.idLinea || lineas.has(l.idLinea)) continue;
      lineas.set(l.idLinea, { idLinea: l.idLinea, rut: rutNormalizado(l.beneficiarioRut) ?? "", nombre: l.beneficiario?.replace(/\s+/g, " ").trim() || null, monto: l.monto, moneda: l.moneda || "CLP", estado: l.estado });
    }
    filas.set(n.idNomina, {
      idNomina: n.idNomina, fechaPago: iso(n.fechaPago), fechaCreacion: creada, descripcion: n.descripcion?.trim() || null,
      estado: n.estado, moneda: n.moneda || "CLP", monto: n.monto, lineas: [...lineas.values()],
    });
  }
  return { filas: [...filas.values()], omitidas };
}
