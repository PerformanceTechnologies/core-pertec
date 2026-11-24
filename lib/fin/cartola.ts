// Gestión financiera: leer una cartola (CSV o Excel del banco o de la tarjeta) sin saber de qué
// banco es. Se busca la fila de encabezados (fecha + glosa + monto o cargo/abono) y se leen las
// filas de abajo. Puro, para probarlo: recibe las filas como texto.

import type { Iso } from "./reglas";

export interface FilaCartola {
  fecha: Iso;
  glosa: string;
  monto: number;
  documento: string | null;
}

// Una celda vacía puede llegar como undefined (Excel deja huecos entre columnas): se lee como texto vacío.
const plano = (s: string | null | undefined) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const ES_FECHA = ["fecha", "fecha movimiento", "fecha operacion", "fecha transaccion", "fecha contable"];
const ES_GLOSA = ["glosa", "descripcion", "detalle", "descripcion movimiento", "concepto", "movimiento", "comercio", "descripcion operacion"];
const ES_CARGO = ["cargo", "cargos", "debito", "debitos", "giros", "monto cargo", "cargos ($)"];
const ES_ABONO = ["abono", "abonos", "credito", "creditos", "depositos", "monto abono", "abonos ($)"];
const ES_MONTO = ["monto", "importe", "valor", "monto ($)"];
const ES_DOC = ["n documento", "nro documento", "documento", "numero documento", "n° documento", "n operacion", "serie", "numero de", "numero de operacion", "n de operacion"];

/** «$1.234.567», «-1.234», «1.234,5», «(1.234)» → número. Vacío → null. */
export function numeroCl(t: string): number | null {
  let s = t.replace(/[$\s]/g, "").trim();
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(negativo ? -n : n);
}

/** «03/11/2026», «03-11-26», «2026-11-03» → YYYY-MM-DD. */
export function fechaCl(t: string): Iso | null {
  const s = t.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = new Date(Date.UTC(Number(anio), Number(m[2]) - 1, Number(m[1])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * El período que declara la cartola en su encabezado («Período 01/01/2026 - 30/01/2026», como la de Itaú): sirve
 * cuando las filas traen la fecha sin año («02/01»).
 */
function periodoDeCartola(filas: string[][]): { desde: Iso; hasta: Iso } | null {
  for (const f of filas.slice(0, 40)) {
    const texto = f.map((x) => String(x ?? "")).join(" ");
    if (!/per[ií]odo/i.test(texto)) continue;
    const m = texto.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*(?:-|al|a)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i);
    const desde = m ? fechaCl(m[1]) : null;
    const hasta = m ? fechaCl(m[2]) : null;
    if (desde && hasta) return { desde, hasta };
  }
  return null;
}

/** «02/01» (sin año) con el año del período; si el período cruza el año, el que deja la fecha dentro. */
function fechaSinAnio(t: string, periodo: { desde: Iso; hasta: Iso } | null): Iso | null {
  const m = t.trim().match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (!m || !periodo) return null;
  for (const anio of [periodo.desde.slice(0, 4), periodo.hasta.slice(0, 4)]) {
    const f = fechaCl(`${m[1]}/${m[2]}/${anio}`);
    if (f && f >= periodo.desde && f <= periodo.hasta) return f;
  }
  return fechaCl(`${m[1]}/${m[2]}/${periodo.hasta.slice(0, 4)}`);
}

/** Un N° de documento que es solo ceros (Itaú pone «000000000» cuando no hay) no es un documento. */
const documento = (t: unknown): string | null => {
  const s = String(t ?? "").trim();
  return s && !/^0+$/.test(s) ? s : null;
};

export function leerCartola(filas: string[][]): { filas: FilaCartola[]; omitidas: number; error?: string } {
  const periodo = periodoDeCartola(filas);
  const buscar = (enc: string[], lista: string[]) => enc.findIndex((h) => lista.includes(plano(h)));
  let iEnc = -1;
  let col = { fecha: -1, glosa: -1, cargo: -1, abono: -1, monto: -1, doc: -1 };
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const enc = filas[i].map((x) => String(x ?? ""));
    const c = { fecha: buscar(enc, ES_FECHA), glosa: buscar(enc, ES_GLOSA), cargo: buscar(enc, ES_CARGO), abono: buscar(enc, ES_ABONO), monto: buscar(enc, ES_MONTO), doc: buscar(enc, ES_DOC) };
    if (c.fecha >= 0 && c.glosa >= 0 && (c.monto >= 0 || c.cargo >= 0 || c.abono >= 0)) {
      iEnc = i;
      col = c;
      break;
    }
  }
  if (iEnc < 0) return { filas: [], omitidas: 0, error: "No se encontró la fila de encabezados (Fecha, Descripción/Glosa y Monto o Cargo/Abono)." };
  const salida: FilaCartola[] = [];
  let omitidas = 0;
  for (const f of filas.slice(iEnc + 1)) {
    const textoFecha = String(f[col.fecha] ?? "");
    const fecha = fechaCl(textoFecha) ?? fechaSinAnio(textoFecha, periodo);
    const glosa = String(f[col.glosa] ?? "").replace(/\s+/g, " ").trim();
    let monto: number | null = null;
    if (col.monto >= 0) monto = numeroCl(String(f[col.monto] ?? ""));
    else {
      const cargo = col.cargo >= 0 ? numeroCl(String(f[col.cargo] ?? "")) : null;
      const abono = col.abono >= 0 ? numeroCl(String(f[col.abono] ?? "")) : null;
      if (cargo) monto = -Math.abs(cargo);
      else if (abono) monto = Math.abs(abono);
    }
    if (!fecha || !glosa || !monto) {
      if (f.some((x) => String(x ?? "").trim())) omitidas++;
      continue;
    }
    salida.push({ fecha, glosa: glosa.slice(0, 200), monto, documento: col.doc >= 0 ? documento(f[col.doc]) : null });
  }
  return { filas: salida, omitidas };
}

/** Lo que ya hay en el Core de una cuenta, para no volver a cargarlo desde una cartola. */
export interface MovimientoGuardado {
  fecha: Iso;
  monto: number;
  documento: string | null;
}

const docComparable = (d: string | null | undefined) => (d ?? "").replace(/\D/g, "").replace(/^0+/, "");

/**
 * Separa de la cartola lo que ya está en el Core por otra vía (el banco automático de Emisso, que guarda con otra
 * huella): mismo día y mismo monto, y mismo N° de documento si los dos lo traen (comparado sin ceros a la izquierda).
 * Se cuentan uno a uno: si ese día hubo seis transferencias iguales y el Core ya tiene seis, se saltan las seis; si
 * tiene cuatro, entran las dos que faltan.
 */
export function sinLoYaGuardado<T extends FilaCartola>(filas: T[], guardados: MovimientoGuardado[]): { nuevas: T[]; saltadas: number } {
  const libres = guardados.map((g) => ({ ...g, doc: docComparable(g.documento), usado: false }));
  const nuevas: T[] = [];
  // Primero las que traen documento (calzan sin ambigüedad), después las demás por día y monto.
  const orden = [...filas.keys()].sort((a, b) => Number(!docComparable(filas[a].documento)) - Number(!docComparable(filas[b].documento)));
  const saltar = new Set<number>();
  for (const i of orden) {
    const f = filas[i];
    const doc = docComparable(f.documento);
    const igual = libres.find((g) => !g.usado && g.fecha === f.fecha && g.monto === f.monto && (!doc || !g.doc || g.doc === doc));
    if (igual) {
      igual.usado = true;
      saltar.add(i);
    }
  }
  filas.forEach((f, i) => {
    if (!saltar.has(i)) nuevas.push(f);
  });
  return { nuevas, saltadas: saltar.size };
}
