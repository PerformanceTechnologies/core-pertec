// El RUT chileno: normalizar y validar. Sin "server-only": lo usa el formulario
// (para avisar mientras se escribe) y el servidor (que es quien lo hace cumplir).

/**
 * "12.669.370-2", "12669370-2" y "126693702" son la misma persona. Se guarda de
 * una sola forma —sin puntos, con guion, K en mayúscula— porque el RUT es la
 * llave única de la ficha y dos grafías serían dos fichas.
 */
export function normalizarRut(entrada: string): string {
  const limpio = entrada.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/** Módulo 11: el dígito verificador que corresponde al cuerpo. */
function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

export function rutEsValido(entrada: string): boolean {
  const rut = normalizarRut(entrada);
  const coincide = /^(\d{7,8})-([0-9K])$/.exec(rut);
  if (!coincide) return false;
  return digitoVerificador(coincide[1]) === coincide[2];
}

/** Para mostrar: "12669370-2" → "12.669.370-2". */
export function formatearRut(rut: string): string {
  const [cuerpo, dv] = rut.split("-");
  if (!cuerpo || !dv) return rut;
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}
