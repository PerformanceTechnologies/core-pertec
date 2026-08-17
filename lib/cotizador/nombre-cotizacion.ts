/**
 * Cómo se nombra una cotización.
 *
 * Sin regla, el nombre lo escribía quien la creaba o —peor— lo armaba el
 * importador pegando el título completo del PDF. Así quedó la primera propuesta
 * importada: "OS 010-2026 · Servicio de traslado de rollos nuevos de correa a
 * CT-6 y CT-7", 71 caracteres en caja mixta que en el encabezado del editor
 * ocupaban tres líneas y en la tabla del listado no entraban en su columna.
 *
 * Las reglas, todas por la misma razón —que el listado se pueda leer de un
 * barrido y que dos cotizaciones del mismo trabajo se llamen igual—:
 *
 *  1. MAYÚSCULAS. Es lo que ya hacen los títulos del core (font-condensed
 *     uppercase), así que escribirlo en minúscula solo generaba la diferencia
 *     entre lo guardado y lo mostrado.
 *  2. Acotado a 70 caracteres, cortando en palabra entera y nunca al medio.
 *  3. Sin el relleno del principio: "OFERTA TÉCNICA Y ECONÓMICA", "PROPUESTA
 *     TÉCNICA", "SERVICIO DE". Ninguno distingue una cotización de otra —todas
 *     son ofertas de un servicio— y son los caracteres que empujan afuera lo que
 *     sí distingue.
 *  4. Un solo espacio entre palabras y sin punto final.
 *
 * Sin acentos NO: "MANTENCIÓN" se escribe con tilde también en mayúscula.
 */

export const LARGO_MAXIMO_NOMBRE = 70;

const NOMBRE_POR_DEFECTO = "COTIZACIÓN SIN NOMBRE";

/**
 * Prefijos que no aportan nada. Se sacan solo del PRINCIPIO: "SERVICIO DE
 * TRASLADO" pierde el prefijo, pero "MANTENCIÓN Y SERVICIO DE CORREAS" no se
 * toca, porque ahí la palabra está describiendo el alcance.
 */
const PREFIJOS_DE_RELLENO = [
  "OFERTA TÉCNICA Y ECONÓMICA",
  "OFERTA TECNICA Y ECONOMICA",
  "OFERTA TÉCNICA",
  "OFERTA ECONÓMICA",
  "PROPUESTA TÉCNICA Y ECONÓMICA",
  "PROPUESTA TÉCNICA",
  "PROPUESTA ECONÓMICA",
  "COTIZACIÓN DE",
  "COTIZACIÓN",
  "SERVICIO DE",
  "SERVICIOS DE",
  "PRESTACIÓN DE SERVICIOS DE",
];

/** Aplica las reglas a un texto cualquiera. */
export function normalizarNombreCotizacion(texto: string): string {
  let limpio = texto
    .replace(/\s+/g, " ")
    .trim()
    // toLocaleUpperCase y no toUpperCase: en es-CL no cambia nada hoy, pero es
    // lo correcto para un texto con idioma conocido.
    .toLocaleUpperCase("es-CL");

  for (const prefijo of PREFIJOS_DE_RELLENO) {
    if (limpio.startsWith(prefijo + " ")) {
      limpio = limpio.slice(prefijo.length).trim();
      break; // uno solo: sacar dos seguidos deja frases sin sujeto
    }
  }

  // Puntuación de cierre: un nombre no es una oración.
  limpio = limpio.replace(/[.,;:·\-–—\s]+$/u, "").trim();

  if (!limpio) return NOMBRE_POR_DEFECTO;
  return acotar(limpio, LARGO_MAXIMO_NOMBRE);
}

/**
 * Nombre de una cotización importada: número de oferta y qué es.
 *
 * El número va primero y NUNCA se recorta: es lo que se busca en el listado y lo
 * que aparece en el correo del cliente. Lo que se acorta es la descripción.
 */
export function nombreDeCotizacionImportada(
  numeroOferta: string | null,
  descripcionServicio: string | null,
): string {
  const numero = numeroOferta ? normalizarNumeroOferta(numeroOferta) : "";
  const descripcion = descripcionServicio ? normalizarNombreCotizacion(descripcionServicio) : "";

  if (!numero) return descripcion || NOMBRE_POR_DEFECTO;
  if (!descripcion) return numero;

  // El separador ocupa 3 caracteres (" · "), y el número se respeta entero.
  const espacioParaDescripcion = LARGO_MAXIMO_NOMBRE - numero.length - 3;
  if (espacioParaDescripcion < 12) return numero;

  return `${numero} · ${acotar(descripcion, espacioParaDescripcion)}`;
}

/**
 * "OS 010 – 2026" → "OS 010-2026".
 *
 * Los PDF escriben el número con guion largo y espacios alrededor, y así dos
 * cotizaciones de la misma oferta no se ordenan juntas ni se encuentran buscando
 * "OS 010-".
 */
export function normalizarNumeroOferta(numero: string): string {
  return numero
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-CL")
    .replace(/\s*[-–—]\s*/g, "-");
}

/** Corta en palabra entera y agrega puntos suspensivos si tuvo que cortar. */
function acotar(texto: string, largo: number): string {
  if (texto.length <= largo) return texto;

  const recortado = texto.slice(0, largo - 1);
  const ultimoEspacio = recortado.lastIndexOf(" ");
  // Si la primera palabra ya no cabe, se corta igual: mejor un nombre feo que
  // uno vacío.
  const base = ultimoEspacio > largo * 0.5 ? recortado.slice(0, ultimoEspacio) : recortado;

  return base.replace(/[.,;:·\-–—\s]+$/u, "") + "…";
}
