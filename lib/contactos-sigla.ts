/** Sigla de un contacto: hasta 4 letras, sin tildes, única en la libreta. */

const RELLENO = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "EN", "PARA", "POR", "CON", "SA", "S", "A", "SPA", "LTDA", "LIMITADA", "EIRL", "CIA", "COMPANIA", "SOCIEDAD", "ANONIMA", "CHILE", "THE", "AND", "OF", "INC", "LLC"]);

const palabras = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Las siglas posibles para ese nombre, de la más natural a la menos. */
export function candidatasDeSigla(nombre: string): string[] {
  const todas = palabras(nombre);
  const utiles = todas.filter((p) => !RELLENO.has(p));
  const w = utiles.length ? utiles : todas.length ? todas : ["X"];
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.slice(0, 4);
    if (t && !out.includes(t)) out.push(t);
  };
  if (w.length === 1) {
    const p = w[0];
    add(p.slice(0, 3));
    add(p.slice(0, 4));
    for (let i = 3; i < p.length; i++) add(p.slice(0, 2) + p[i]);
  } else {
    const ini = w.map((p) => p[0]).join("");
    add(ini);
    // Iniciales + una letra más de cada palabra, para desempatar.
    for (let k = 0; k < w.length && out.length < 12; k++) {
      for (let j = 1; j < w[k].length; j++) {
        const s = w.slice(0, Math.min(w.length, 3)).map((p, i) => (i === k ? p[0] + p[j] : p[0])).join("");
        add(s);
      }
    }
  }
  // Último recurso: la base + una letra cualquiera.
  const base = (out[0] ?? "X").slice(0, 3);
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") add(base + c);
  return out;
}

/** La primera sigla libre (que no esté en `usadas`). */
export function siglaLibre(nombre: string, usadas: Set<string>): string {
  for (const s of candidatasDeSigla(nombre)) if (!usadas.has(s)) return s;
  for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const s = "X" + a + b + c;
    if (!usadas.has(s)) return s;
  }
  return "XXXX";
}

export const siglaValida = (s: string) => /^[A-Z]{1,4}$/.test(s);
