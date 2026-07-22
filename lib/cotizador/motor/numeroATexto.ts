const UNIDADES = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

function seccionAMenosDeMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  let out = "";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) out += CENTENAS[c] + " ";
  if (resto < 20) {
    out += UNIDADES[resto];
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d === 2 && u > 0) out += "veinti" + UNIDADES[u];
    else {
      out += DECENAS[d];
      if (u > 0) out += " y " + UNIDADES[u];
    }
  }
  return out.trim();
}

/** Convierte un entero (CLP) a su glosa en palabras, es-CL, mayúsculas. */
export function numeroATexto(valor: number): string {
  const n = Math.round(Math.abs(valor));
  if (n === 0) return "CERO PESOS";
  if (n === 1) return "UN PESO";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const unidades = n % 1000;

  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "un millón" : `${seccionAMenosDeMil(millones)} millones`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${seccionAMenosDeMil(miles)} mil`);
  }
  if (unidades > 0) {
    partes.push(seccionAMenosDeMil(unidades));
  }

  const texto = partes.join(" ").trim() || "cero";
  const sufijo = n === 1 ? "PESO" : "PESOS";
  return `${texto.toUpperCase()} ${sufijo}`;
}
