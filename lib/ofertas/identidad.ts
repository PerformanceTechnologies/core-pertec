import { NOMBRE_DE_TIPO, esOfertaTecnica, type TipoDeDocumento } from "./tipos";

/**
 * El código y la fecha de un documento, cuando el borrador no los trae.
 *
 * El modelo transcribe lo que está escrito, así que un borrador sin fecha —o sin número
 * de oferta, que pasa seguido en los que se arman copiando otro— llegaba con esos dos
 * campos vacíos. En el documento eso se ve como una portada a medio llenar, y había que
 * escribirlos a mano en cada uno.
 *
 * Todo lo de acá es PURO: la fecha se recibe y los códigos usados también. El servidor
 * los consulta (ver crearOferta en ./datos.ts) y acá se decide. Así se puede probar sin
 * base y sin reloj, que es lo único que hace verificable una regla de numeración.
 *
 * REGLA DE ORO: lo que el borrador TRAE nunca se pisa. Un documento que declara su código
 * lo conserva, aunque no siga ninguna convención —"FT-PTC-IC-01" es uno real— porque ese
 * es el código con el que el cliente lo va a buscar.
 */

/** Con qué empieza el código de cada tipo. */
export const PREFIJO_DE_TIPO: Record<TipoDeDocumento, string> = {
  oferta: "OS",
  ficha_tecnica: "FT",
  procedimiento: "PR",
  informe: "IN",
  otro: "DOC",
};

/** La zona del país, para que un documento creado a las 21:30 no salga con la fecha de mañana. */
const ZONA = "America/Santiago";

// Hay otra igual en lib/graph-calendario.ts (hoyEnSantiago) y se deja repetida a
// propósito: ese módulo importa el cliente de Microsoft Graph, así que traerlo acá le
// agregaría esa dependencia a las rutas que solo maquetan un documento. Diez líneas
// repetidas cuestan menos que eso; si alguna vez hay una tercera, van a un módulo de
// fechas y las tres lo usan.

/** Hoy en Chile: año, mes y día, sin la hora ni el desfase del servidor. */
export function hoyEnChile(ahora = new Date()): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { anio: valor("year"), mes: valor("month"), dia: valor("day") };
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * "26 de agosto de 2026", que es como la escriben estos documentos.
 *
 * A mano y no con toLocaleDateString: el formato es el que ya está en los documentos —el
 * modelo lo transcribe así— y la fecha es un TEXTO del contenido, no una fecha con
 * formato. Poner acá "26 de agosto de 2026" o "26/08/2026" según el entorno haría que dos
 * duplicados se vean distintos.
 *
 * El DÍA sale del calendario de Chile y no de `getDate()`. Vivía en ./normalizar.ts con
 * getDate/getMonth/getFullYear, que son la zona del servidor: en Vercel eso es UTC, así
 * que un documento creado a las 21:30 de acá salía fechado al día siguiente. Le pasaba
 * también a duplicar, que es donde estaba.
 */
export function fechaEnPalabras(ahora = new Date()): string {
  const { anio, mes, dia } = hoyEnChile(ahora);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/**
 * De un código a su número, si sigue la convención de la casa.
 *
 * La convención real es "OS 009 – 2026": prefijo, número de tres dígitos, año. Con guion
 * largo y espacios, que es como se escribe a mano —así están los tres que hay guardados—.
 * Se aceptan las tres rayas y los espacios de más porque nadie escribe siempre igual.
 *
 * Un código que no sigue la convención devuelve null y no participa de la cuenta: en la
 * base hay un "FT-PTC-IC-01" y un "001", y de esos no se puede deducir cuál es el
 * siguiente.
 */
export function numeroDeCodigo(codigo: string, prefijo: string, anio: number): number | null {
  const patron = new RegExp(`^\\s*${prefijo}\\s*(\\d{1,4})\\s*[-–—]\\s*(\\d{4})\\s*$`, "i");
  const m = patron.exec(codigo);
  if (!m || Number(m[2]) !== anio) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * El código que sigue para este tipo y este año.
 *
 * Se cuenta sobre los códigos YA usados y no con un contador aparte: un contador se
 * desincroniza el día que alguien borra un documento o carga uno viejo a mano, y acá lo
 * que importa es no repetir un número que ya existe.
 */
export function siguienteCodigo(
  tipo: TipoDeDocumento,
  anio: number,
  usados: (string | null | undefined)[],
): string {
  const prefijo = PREFIJO_DE_TIPO[tipo];
  const numeros = usados
    .map((codigo) => (codigo ? numeroDeCodigo(codigo, prefijo, anio) : null))
    .filter((n): n is number => n !== null);
  const siguiente = numeros.length === 0 ? 1 : Math.max(...numeros) + 1;
  return `${prefijo} ${String(siguiente).padStart(3, "0")} – ${anio}`;
}

/** Lo que se completó solo, para poder decirlo. */
export interface IdentidadCompletada {
  codigo?: string;
  fecha?: string;
}

/**
 * Completa el código y la fecha que el borrador no trajo.
 *
 * Devuelve QUÉ completó, no solo el resultado: un número de oferta que puso el sistema no
 * es lo mismo que uno que venía escrito en el borrador, y quien revisa tiene que poder
 * enterarse antes de emitir (ver crearOferta).
 */
export function completarIdentidad(
  identificacion: { numeroOferta: string | null; fecha: string | null },
  tipo: TipoDeDocumento,
  usados: (string | null | undefined)[],
  ahora = new Date(),
): {
  identificacion: { numeroOferta: string | null; fecha: string | null };
  completado: IdentidadCompletada;
} {
  const vacio = (valor: string | null) => valor === null || valor.trim() === "";
  const completado: IdentidadCompletada = {};

  const numeroOferta = vacio(identificacion.numeroOferta)
    ? (completado.codigo = siguienteCodigo(tipo, hoyEnChile(ahora).anio, usados))
    : identificacion.numeroOferta;
  const fecha = vacio(identificacion.fecha)
    ? (completado.fecha = fechaEnPalabras(ahora))
    : identificacion.fecha;

  return { identificacion: { ...identificacion, numeroOferta, fecha }, completado };
}

/**
 * El aviso de que el CÓDIGO lo puso el sistema, para "Por revisar".
 *
 * Solo en una oferta, y solo por el código. El número de una oferta es un identificador
 * de negocio —lo asigna Comercial y se lo dice al cliente— así que uno inventado por el
 * sistema tiene que confirmarse antes de emitir. La fecha de hoy no necesita aviso: es
 * la fecha de hoy. Y en una ficha o un procedimiento el código es interno, así que
 * tampoco.
 */
export function avisoDeCodigoAutomatico(
  tipo: TipoDeDocumento,
  completado: IdentidadCompletada,
): string | null {
  if (!completado.codigo || !esOfertaTecnica(tipo)) return null;
  return (
    `El borrador no traía número de ${NOMBRE_DE_TIPO[tipo].toLowerCase()}, así que se puso ` +
    `${completado.codigo} siguiendo el último que hay en el sistema. Confirmalo antes de emitir.`
  );
}
