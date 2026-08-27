import { SECCIONES_CON_IMAGENES, type SeccionConImagenes } from "./tipos";

/**
 * Dónde va una imagen de la oferta: en una sección, como rúbrica de alguien, o en
 * ninguna parte.
 *
 * Existe porque la misma pregunta se contesta desde cuatro lugares —el desplegable
 * del panel de imágenes, el arrastre sobre el documento, la ruta que lo guarda y la
 * plantilla que lo dibuja— y hasta ahora cada uno hablaba un idioma distinto: el
 * desplegable ya usaba "firma-0" y el arrastre solo sabía de secciones, así que la
 * firma era lo único que no se podía arrastrar.
 *
 * El texto ("anexo", "firma-1", vacío) es el formato de cable: viaja en el FormData
 * del desplegable, en el cuerpo del POST y en el dataset del DOM. Se lee UNA vez,
 * acá, y del otro lado ya nadie compara strings.
 */

export type DestinoDeImagen =
  | { tipo: "seccion"; seccion: SeccionConImagenes }
  /** La rúbrica del firmante en esa posición del cierre. */
  | { tipo: "firma"; firmante: number };

const PREFIJO_FIRMA = "firma-";

/** El texto con el que viaja "la rúbrica del firmante n". */
export function textoDeFirma(firmante: number): string {
  return `${PREFIJO_FIRMA}${firmante}`;
}

/** ¿Este texto de destino es la rúbrica de alguien? */
export function esFirma(texto: string): boolean {
  return texto.startsWith(PREFIJO_FIRMA);
}

/** El texto de un destino, para volver a mandarlo por cable. */
export function textoDeDestino(destino: DestinoDeImagen | null): string {
  if (!destino) return "";
  return destino.tipo === "firma" ? textoDeFirma(destino.firmante) : destino.seccion;
}

/**
 * Lee un destino que llegó como texto.
 *
 * Tres respuestas y las tres importan: el destino, `null` para "no usar" —vacío o
 * nulo, que es una elección válida: saca la imagen del documento— y `undefined`
 * para lo que no se reconoce, que quien llama tiene que rechazar en vez de tratar
 * como "no usar". Confundir esas dos últimas significaría que un destino con un
 * error de tipeo borra la ubicación en silencio.
 *
 * `cuantosFirmantes` se pide siempre: una rúbrica del firmante 3 en una oferta con
 * dos firmantes no dibuja nada, y tampoco tiene por qué quedar guardada.
 */
export function leerDestino(
  texto: string | null | undefined,
  cuantosFirmantes: number,
): DestinoDeImagen | null | undefined {
  if (texto === null || texto === undefined || texto === "") return null;

  if (texto.startsWith(PREFIJO_FIRMA)) {
    const firmante = Number(texto.slice(PREFIJO_FIRMA.length));
    if (!Number.isInteger(firmante) || firmante < 0 || firmante >= cuantosFirmantes) return undefined;
    return { tipo: "firma", firmante };
  }

  if (SECCIONES_CON_IMAGENES.includes(texto as SeccionConImagenes)) {
    return { tipo: "seccion", seccion: texto as SeccionConImagenes };
  }
  return undefined;
}
