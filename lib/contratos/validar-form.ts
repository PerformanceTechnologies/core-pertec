// Lectura de lo que llega de un formulario o de una Server Action.
//
// Una Server Action es un endpoint: lo que recibe se puede armar a mano sin pasar por
// la interfaz, así que TODO es entrada no confiable. Estas funciones son la puerta.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leerUuid(valor: unknown, nombre: string): string {
  const texto = String(valor ?? "");
  if (!UUID.test(texto)) throw new Error(`${nombre} inválido.`);
  return texto;
}

/** Igual que `leerUuid`, pero vacío significa «ninguno». */
export function leerUuidOpcional(valor: unknown, nombre: string): string | null {
  const texto = String(valor ?? "").trim();
  return texto ? leerUuid(texto, nombre) : null;
}

/** «AAAA-MM-DD» real (rechaza 2026-02-31), o null si viene vacío. */
export function leerFecha(valor: unknown, etiqueta: string): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  const d = coincide ? new Date(Date.UTC(+coincide[1], +coincide[2] - 1, +coincide[3])) : null;
  if (!coincide || !d || d.toISOString().slice(0, 10) !== texto) {
    throw new Error(`${etiqueta}: la fecha no es válida.`);
  }
  return texto;
}

export function leerTexto(valor: unknown, largoMaximo = 200): string | null {
  const limpio = String(valor ?? "").trim();
  return limpio ? limpio.slice(0, largoMaximo) : null;
}

/**
 * Un nombre que SharePoint acepta: sin los caracteres que prohíbe, sin espacios
 * repetidos y sin puntos ni espacios al final (que tampoco admite).
 */
export function nombreParaSharePoint(nombre: string, largoMaximo: number): string {
  return nombre
    .replace(/["*:<>?|/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, largoMaximo)
    .replace(/[. ]+$/, "");
}

/**
 * Un entero de 0 a `maximo`, o null si el campo viene vacío («no se ha definido», que no es
 * lo mismo que 0). Rechaza decimales y negativos en vez de redondearlos: «2,5 personas» es
 * un error de tipeo, no un 2 ni un 3.
 */
export function leerEnteroOpcional(valor: unknown, etiqueta: string, maximo = 100_000): number | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (!/^\d+$/.test(texto)) throw new Error(`${etiqueta}: escribe un número entero, sin decimales.`);
  const n = Number(texto);
  if (n > maximo) throw new Error(`${etiqueta}: el máximo es ${maximo}.`);
  return n;
}
