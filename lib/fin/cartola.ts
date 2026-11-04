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

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const ES_FECHA = ["fecha", "fecha movimiento", "fecha operacion", "fecha transaccion", "fecha contable"];
const ES_GLOSA = ["glosa", "descripcion", "detalle", "descripcion movimiento", "concepto", "movimiento", "comercio", "descripcion operacion"];
const ES_CARGO = ["cargo", "cargos", "debito", "debitos", "giros", "monto cargo", "cargos ($)"];
const ES_ABONO = ["abono", "abonos", "credito", "creditos", "depositos", "monto abono", "abonos ($)"];
const ES_MONTO = ["monto", "importe", "valor", "monto ($)"];
const ES_DOC = ["n documento", "nro documento", "documento", "numero documento", "n° documento", "n operacion", "serie"];

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

export function leerCartola(filas: string[][]): { filas: FilaCartola[]; omitidas: number; error?: string } {
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
    const fecha = fechaCl(String(f[col.fecha] ?? ""));
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
    salida.push({ fecha, glosa: glosa.slice(0, 200), monto, documento: col.doc >= 0 ? String(f[col.doc] ?? "").trim() || null : null });
  }
  return { filas: salida, omitidas };
}
