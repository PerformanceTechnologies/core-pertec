// Gestión financiera: la clasificación de gastos e ingresos con la lista maestra de Finanzas (Categoría → Subcategoría).
//
// Puro: sin base ni red, para probarlo con `npm run probar-fin`. Recibe lo ya leído y devuelve qué clasificación le
// corresponde a un movimiento del banco y por qué. Lo usan la bandeja de Tesorería (sugerencias), la importación diaria
// de Emisso y la cartola manual (aplicar de una lo que es seguro) y el resumen por categoría.
//
// Cómo se clasifica un movimiento, en orden (lo primero que calce gana y queda anotado):
//   1. Heredado: si se concilia con un pago o un cobro, toma la clasificación de su compra o de su hito.
//      (Eso pasa al conciliar: ver clasificacionDeCompra / categoriaDeIngreso.)
//   2. Regla por RUT de la contraparte (Configuración › Categorías y reglas).
//   3. Regla por texto de la glosa (Uber, Copec, Previred, TGR…).
//   4. Igual a un movimiento anterior ya clasificado: la misma glosa sin números ni fechas, mismo signo.
//   5. Mismo RUT que un movimiento anterior ya clasificado.
//   6. Lo que propone la IA (lib/fin/clasificacion-ia.ts), con su seguridad y su porqué.
//   Si nada calza, queda «Por aclarar».
// Las reglas (2 y 3) son decisiones de Finanzas y se aplican solas al importar; lo aprendido de movimientos anteriores
// (4 y 5) y lo de la IA (6) solo se sugiere: Tesorería lo acepta con un clic. La IA se aplica sola únicamente si
// Finanzas lo activa y su seguridad supera el umbral que fijó.

import { reglaQueCalza, rutComparable, type Iso, type ReglaCategoria } from "./reglas";

export type OrigenClasificacion = "manual" | "regla" | "rut" | "historial" | "heredado" | "migracion" | "ia";

export const ETIQUETA_ORIGEN: Record<OrigenClasificacion, string> = {
  manual: "A mano",
  regla: "Regla por texto",
  rut: "Regla por RUT",
  historial: "Como un movimiento anterior",
  heredado: "Heredado del documento",
  migracion: "Desde la lista anterior",
  ia: "Sugerido por IA",
};

/** Lo que la IA propuso para un movimiento (columna fin_movimientos.sugerencia_ia). */
export interface SugerenciaIa {
  categoria_id: string;
  subcategoria_id: string | null;
  /** Seguridad de 0 a 1. */
  confianza: number;
  motivo: string;
  modelo: string;
  en: string;
}

export interface CategoriaLista {
  id: string;
  nombre: string;
  sentido: "ingreso" | "egreso" | "ambos";
  requiereProyecto: boolean;
  /** false en Financiamiento y Traspasos Internos: no son ingreso ni gasto y no suman en los totales. */
  afectaResultado: boolean;
  cuentaContable: string | null;
  orden: number;
  activa: boolean;
}

export interface Subcategoria {
  id: string;
  categoriaId: string;
  nombre: string;
  cuentaContable: string | null;
  orden: number;
  activa: boolean;
}

export interface Sugerencia {
  origen: Exclude<OrigenClasificacion, "manual" | "migracion" | "heredado">;
  categoriaId: string;
  subcategoriaId: string | null;
  proyectoId: string | null;
  /** La regla que la produjo (para contar cuántas veces sirve). */
  reglaId: string | null;
  /** Por qué, en palabras: «Regla «COPEC»», «Como TRANSF. A … del 12-11-2026». */
  motivo: string;
  /** Solo en las de IA: su seguridad de 0 a 1. */
  confianza?: number;
}

/** Lo que hace falta de un movimiento ya clasificado para aprender de él. */
export interface Clasificado {
  id: string;
  fecha: Iso;
  glosa: string;
  monto: number;
  contraparteRut: string | null;
  categoriaId: string;
  subcategoriaId: string | null;
  proyectoId: string | null;
}

/** ¿La categoría tiene subcategorías activas? Entonces el movimiento no está listo sin una. */
export function categoriasConSubcategorias(subcategorias: Subcategoria[]): Set<string> {
  return new Set(subcategorias.filter((s) => s.activa).map((s) => s.categoriaId));
}

/** Las categorías que se ofrecen para un monto: un cargo no puede ser «Servicios», ni un abono «Backoffice». */
export function categoriasPara(monto: number, categorias: CategoriaLista[]): CategoriaLista[] {
  const sentido = monto < 0 ? "egreso" : "ingreso";
  return categorias.filter((c) => c.activa && (c.sentido === "ambos" || c.sentido === sentido)).sort((a, b) => a.orden - b.orden);
}

/**
 * La glosa para comparar con movimientos anteriores: minúsculas, sin tildes, sin números ni fechas, sin signos.
 * «PAGO TGR 12/10/2026 FOLIO 3344» → «pago tgr folio». Si queda muy poco texto (o es una nómina, donde la glosa
 * es la misma para remuneraciones y proveedores) no sirve para aprender: devuelve "".
 */
export function glosaComparable(glosa: string): string {
  const t = glosa
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-zñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^nomina\b/.test(t)) return "";
  return t.replace(/\s/g, "").length >= 6 ? t : "";
}

const fechaCorta = (iso: Iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/**
 * Qué clasificación sugerir para un movimiento sin clasificar (o null si no hay ninguna confiable).
 * `anteriores` son los movimientos ya clasificados de la empresa; se usa el más reciente que calce.
 */
export function sugerirClasificacion(
  m: { id?: string; glosa: string; monto: number; cuentaId: string; contraparteRut?: string | null },
  reglas: ReglaCategoria[],
  anteriores: Clasificado[],
): Sugerencia | null {
  const regla = reglaQueCalza(m, reglas);
  if (regla) {
    const porRut = Boolean(regla.contraparteRut);
    return {
      origen: porRut ? "rut" : "regla", categoriaId: regla.categoriaId, subcategoriaId: regla.subcategoriaId ?? null, proyectoId: regla.proyectoId, reglaId: regla.id,
      motivo: porRut ? `Regla por RUT ${regla.contraparteRut}` : `Regla «${regla.patron}»`,
    };
  }
  const signo = Math.sign(m.monto);
  const mismos = anteriores.filter((a) => a.id !== m.id && Math.sign(a.monto) === signo).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const rut = rutComparable(m.contraparteRut);
  const clave = glosaComparable(m.glosa);
  if (clave) {
    // Con RUT, la glosa sola no basta: «TRANSF. DE <RUT>» sin números es igual para todos.
    const igual = mismos.find((a) => glosaComparable(a.glosa) === clave && (!rut || rutComparable(a.contraparteRut) === rut));
    if (igual) return deAnterior("historial", igual, `Como «${igual.glosa}» del ${fechaCorta(igual.fecha)}`);
  }
  if (rut) {
    const mismoRut = mismos.find((a) => rutComparable(a.contraparteRut) === rut);
    if (mismoRut) return deAnterior("historial", mismoRut, `Mismo RUT que «${mismoRut.glosa}» del ${fechaCorta(mismoRut.fecha)}`);
  }
  return null;
}

function deAnterior(origen: "historial", a: Clasificado, motivo: string): Sugerencia {
  return { origen, categoriaId: a.categoriaId, subcategoriaId: a.subcategoriaId, proyectoId: a.proyectoId, reglaId: null, motivo };
}

/**
 * ¿Se puede aplicar sola al importar? Solo lo que decidió Finanzas (reglas), con la clasificación completa
 * (subcategoría si la categoría las tiene) y sin pedir un proyecto que la regla no trae.
 */
export function aplicableSola(s: Sugerencia | null, categorias: CategoriaLista[], conSubcategorias: Set<string>): boolean {
  if (!s || (s.origen !== "regla" && s.origen !== "rut")) return false;
  const c = categorias.find((x) => x.id === s.categoriaId);
  if (!c || !c.activa) return false;
  if (conSubcategorias.has(c.id) && !s.subcategoriaId) return false;
  return !c.requiereProyecto || Boolean(s.proyectoId);
}

// -----------------------------------------------------------------------------
//  IA: sugerencia, acierto y reglas propuestas
// -----------------------------------------------------------------------------

/**
 * La sugerencia de la IA como Sugerencia, si sigue siendo válida con la lista de hoy (categoría activa del sentido del
 * monto y, si la categoría tiene subcategorías, una de ellas activa). Si no, null.
 */
export function sugerenciaDeIa(
  ia: SugerenciaIa | null | undefined,
  monto: number,
  categorias: CategoriaLista[],
  subcategorias: Subcategoria[],
): Sugerencia | null {
  if (!ia?.categoria_id) return null;
  const c = categoriasPara(monto, categorias).find((x) => x.id === ia.categoria_id);
  if (!c) return null;
  const subs = subcategorias.filter((x) => x.activa && x.categoriaId === c.id);
  const sub = ia.subcategoria_id ? subs.find((x) => x.id === ia.subcategoria_id) ?? null : null;
  if (subs.length > 0 && !sub) return null;
  const pct = Math.round(Math.max(0, Math.min(1, ia.confianza)) * 100);
  return { origen: "ia", categoriaId: c.id, subcategoriaId: sub?.id ?? null, proyectoId: null, reglaId: null, motivo: `IA (${pct} % segura): ${ia.motivo}`, confianza: ia.confianza };
}

/**
 * ¿Es una sugerencia segura para aceptar en bloque? Las de reglas y las de movimientos anteriores iguales, sí; las de
 * la IA, solo desde `umbral` de seguridad (90 % por omisión). Lo demás se revisa uno por uno.
 */
export function esSegura(s: Sugerencia | null, umbral = 0.9): boolean {
  if (!s) return false;
  return s.origen === "ia" ? (s.confianza ?? 0) >= umbral : true;
}

/** ¿Se aplica sola? Solo si Finanzas lo activó, la seguridad alcanza el umbral y la categoría no pide proyecto. */
export function iaAplicableSola(s: Sugerencia | null, umbral: number, categorias: CategoriaLista[]): boolean {
  if (!s || s.origen !== "ia" || (s.confianza ?? 0) < umbral) return false;
  const c = categorias.find((x) => x.id === s.categoriaId);
  return Boolean(c && c.activa && !c.requiereProyecto);
}

/** Al clasificar a mano un movimiento que tenía sugerencia de la IA: ¿eligió lo mismo? */
export function resultadoIa(ia: SugerenciaIa | null | undefined, categoriaId: string | null, subcategoriaId: string | null): "aceptada" | "corregida" | null {
  if (!ia?.categoria_id || !categoriaId) return null;
  return ia.categoria_id === categoriaId && (ia.subcategoria_id ?? null) === (subcategoriaId ?? null) ? "aceptada" : "corregida";
}

/** Cuánto acierta la IA: de lo que una persona revisó, qué parte dejó igual. */
export function aciertoIa(movimientos: { fecha: Iso; iaResultado: "aceptada" | "corregida" | null }[], desde: Iso | null = null) {
  const revisados = movimientos.filter((m) => m.iaResultado && (!desde || m.fecha >= desde));
  const aceptadas = revisados.filter((m) => m.iaResultado === "aceptada").length;
  return { revisados: revisados.length, aceptadas, corregidas: revisados.length - aceptadas, pct: revisados.length ? aceptadas / revisados.length : null };
}

export interface ReglaPropuesta {
  tipo: "texto" | "rut";
  /** El texto de la glosa o el RUT que reconocería. */
  valor: string;
  categoriaId: string;
  subcategoriaId: string | null;
  veces: number;
  ejemplo: string;
}

/** Las primeras palabras (sin números) que comparten todas las glosas: lo que una regla por texto reconocería. */
function inicioComun(glosas: string[]): string {
  const partes = glosas.map((g) => g.toLowerCase().split(/\s+/).filter(Boolean));
  const comun: string[] = [];
  for (let i = 0; i < Math.min(...partes.map((p) => p.length)); i++) {
    const w = partes[0][i];
    if (/\d/.test(w) || !partes.every((p) => p[i] === w)) break;
    comun.push(w);
  }
  return comun.join(" ");
}

/**
 * Reglas que conviene crear: lo que ya se clasificó igual al menos `minimo` veces (mismo RUT, o misma glosa sin números)
 * y ninguna regla activa reconoce todavía. Así el trabajo a mano baja semana a semana.
 */
export function proponerReglas(clasificados: Clasificado[], reglas: ReglaCategoria[], minimo = 3): ReglaPropuesta[] {
  const activas = reglas.filter((r) => r.activa);
  const cubierto = (m: Clasificado) => Boolean(reglaQueCalza({ glosa: m.glosa, monto: m.monto, cuentaId: "", contraparteRut: m.contraparteRut }, activas.map((r) => ({ ...r, cuentaId: null }))));
  const libres = clasificados.filter((m) => !cubierto(m));
  const salida: ReglaPropuesta[] = [];
  const grupos = new Map<string, { tipo: "texto" | "rut"; movs: Clasificado[] }>();
  for (const m of libres) {
    const rut = rutComparable(m.contraparteRut);
    const clave = rut ? `rut:${rut}` : glosaComparable(m.glosa) ? `texto:${glosaComparable(m.glosa)}` : null;
    if (!clave) continue;
    const g = grupos.get(clave) ?? { tipo: rut ? "rut" : "texto", movs: [] };
    g.movs.push(m);
    grupos.set(clave, g);
  }
  for (const [clave, g] of grupos) {
    // Solo si siempre se clasificó igual: si el mismo RUT a veces es una cosa y a veces otra, no hay regla segura.
    const destinos = new Set(g.movs.map((m) => `${m.categoriaId}|${m.subcategoriaId ?? ""}`));
    if (g.movs.length < minimo || destinos.size !== 1) continue;
    const valor = g.tipo === "rut" ? clave.slice(4) : inicioComun(g.movs.map((m) => m.glosa));
    if (g.tipo === "texto" && valor.replace(/\s/g, "").length < 4) continue;
    const m = g.movs[0];
    salida.push({ tipo: g.tipo, valor, categoriaId: m.categoriaId, subcategoriaId: m.subcategoriaId, veces: g.movs.length, ejemplo: m.glosa });
  }
  return salida.sort((a, b) => b.veces - a.veces);
}

/** El ingreso que corresponde a un cobro, según lo que se facturó: el tipo del hito y el del proyecto. */
export function categoriaDeIngreso(tipoHito: "servicio" | "arriendo" | "venta" | null, tipoProyecto: string | null): string {
  if (tipoProyecto === "spot") return "Proyecto Spot";
  if (tipoHito === "arriendo") return "Arriendos";
  if (tipoHito === "venta") return "Ventas";
  return "Servicios";
}

/** Nombres fijos de la lista maestra que el Core usa al conciliar (los textos son los del Excel de Finanzas). */
export const LISTA = {
  operaciones: "Operaciones y Proyectos",
  proveedores: "Proveedores / Subcontratos",
  traspasos: "Traspasos Internos",
  traspasoEntreCuentas: "Traspaso entre Cuentas",
  financiamiento: "Financiamiento",
  anticipoFactoring: "Anticipo Factoring",
} as const;

// -----------------------------------------------------------------------------
//  Resumen por categoría (lo que ve Tesorería y lo que se compara con el Excel de Finanzas)
// -----------------------------------------------------------------------------

export interface FilaResumen {
  categoriaId: string | null;
  nombre: string;
  afectaResultado: boolean;
  ingresos: number;
  egresos: number;
  movimientos: number;
  subcategorias: { subcategoriaId: string | null; nombre: string; ingresos: number; egresos: number; movimientos: number }[];
}

export interface ResumenCategorias {
  desde: Iso;
  hasta: Iso;
  /** Ingresos y gastos (sin Financiamiento ni Traspasos Internos). */
  resultado: FilaResumen[];
  /** Financiamiento y Traspasos Internos: entran y salen de caja, pero no son ingreso ni gasto. */
  sinResultado: FilaResumen[];
  totalIngresos: number;
  totalEgresos: number;
  porAclarar: { movimientos: number; ingresos: number; egresos: number };
}

export function resumenPorCategoria(
  movimientos: { fecha: Iso; monto: number; categoriaId: string | null; subcategoriaId?: string | null }[],
  categorias: CategoriaLista[],
  subcategorias: Subcategoria[],
  desde: Iso,
  hasta: Iso,
): ResumenCategorias {
  const enRango = movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const filas = new Map<string, FilaResumen>();
  const porAclarar = { movimientos: 0, ingresos: 0, egresos: 0 };
  for (const m of enRango) {
    const c = m.categoriaId ? categorias.find((x) => x.id === m.categoriaId) : null;
    if (!c) {
      porAclarar.movimientos++;
      if (m.monto > 0) porAclarar.ingresos += m.monto;
      else porAclarar.egresos += -m.monto;
      continue;
    }
    const f = filas.get(c.id) ?? { categoriaId: c.id, nombre: c.nombre, afectaResultado: c.afectaResultado, ingresos: 0, egresos: 0, movimientos: 0, subcategorias: [] };
    const sub = m.subcategoriaId ? subcategorias.find((s) => s.id === m.subcategoriaId) : null;
    let fs = f.subcategorias.find((x) => x.subcategoriaId === (sub?.id ?? null));
    if (!fs) {
      fs = { subcategoriaId: sub?.id ?? null, nombre: sub?.nombre ?? "Sin subcategoría", ingresos: 0, egresos: 0, movimientos: 0 };
      f.subcategorias.push(fs);
    }
    if (m.monto > 0) {
      f.ingresos += m.monto;
      fs.ingresos += m.monto;
    } else {
      f.egresos += -m.monto;
      fs.egresos += -m.monto;
    }
    f.movimientos++;
    fs.movimientos++;
    filas.set(c.id, f);
  }
  const orden = (a: FilaResumen, b: FilaResumen) => (categorias.find((c) => c.id === a.categoriaId)?.orden ?? 0) - (categorias.find((c) => c.id === b.categoriaId)?.orden ?? 0);
  const ordenSub = (a: { subcategoriaId: string | null }, b: { subcategoriaId: string | null }) =>
    (subcategorias.find((s) => s.id === a.subcategoriaId)?.orden ?? 999) - (subcategorias.find((s) => s.id === b.subcategoriaId)?.orden ?? 999);
  const todas = [...filas.values()].map((f) => ({ ...f, subcategorias: [...f.subcategorias].sort(ordenSub) })).sort(orden);
  const resultado = todas.filter((f) => f.afectaResultado);
  return {
    desde, hasta, resultado, sinResultado: todas.filter((f) => !f.afectaResultado),
    totalIngresos: resultado.reduce((s, f) => s + f.ingresos, 0), totalEgresos: resultado.reduce((s, f) => s + f.egresos, 0), porAclarar,
  };
}
