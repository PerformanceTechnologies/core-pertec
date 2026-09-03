/**
 * Los logos de un documento: el de la casa y el del cliente.
 *
 * El encabezado del maestro tiene tres celdas y dos de ellas son huecos para
 * marcas: a la izquierda la de la empresa que emite, a la derecha la del cliente.
 * Hasta ahora las dos eran texto —el nombre de la empresa y el rótulo
 * "[Logo cliente]"— así que acá lo único que se agrega es que puedan ser una
 * imagen de verdad.
 *
 * Y una línea que conviene tener clara, porque es distinta de la del estilo: el
 * logo NO sale del maestro. El maestro aporta la piel —paleta, tipografías,
 * medidas— y el logo aporta la identidad, que es de la empresa y del cliente, no
 * del formato. Dos empresas pueden compartir el mismo maestro y ninguna quiere el
 * logo de la otra.
 *
 * ── Lo que llega al documento ──────────────────────────────────────────────
 *
 * Solo un data URI de PNG que armó el servidor. Nunca el archivo que subieron:
 * `logos-archivo.ts` lo pasa por sharp y guarda el PNG resultante, así que un SVG
 * —que es marcado, no una imagen— queda rasterizado antes de tocar el bucket.
 *
 * `logoSeguro` es el control de ese borde, el mismo papel que cumple
 * `sanearEstilo` con los colores: lo que no pasa no se dibuja. Importa porque el
 * valor termina interpolado en un `src` de un documento que se manda a un
 * cliente, y un valor con una comilla adentro cerraría el atributo.
 *
 * Sin "server-only": lo usan la plantilla (servidor) y las pruebas con tsx.
 */

/** Lo que acepta el input de archivo. Se rasteriza todo, incluido el SVG. */
export const FORMATOS_LOGO = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";

/**
 * Tope de la subida.
 *
 * Es generoso a propósito —el logo que tiene alguien a mano suele ser el del
 * manual de marca, en grande— porque lo que se guarda no es este archivo sino el
 * PNG normalizado. Va por una route handler y no por una server action justo por
 * esto: las actions cortan el cuerpo en 1 MB.
 */
export const LIMITE_SUBIDA_LOGO = 4 * 1024 * 1024;

/**
 * La caja del PNG normalizado, en píxeles.
 *
 * La celda del encabezado mide unos 30 × 10 mm, que a 300 dpi son 354 × 118 px;
 * 900 × 300 deja margen para la portada, que lo usa más grande, y mantiene el
 * archivo en decenas de KB. El tamaño importa más de lo que parece: el logo va
 * embebido en la caja de encabezado que Chromium repite en CADA página, así que un
 * logo pesado se paga tantas veces como páginas tenga la oferta.
 */
export const CAJA_LOGO = { ancho: 900, alto: 300 };

/** Tope del data URI. Un PNG normalizado queda muy por debajo. */
const LIMITE_DATA_URI = 2 * 1024 * 1024;

/**
 * Un data URI de PNG y nada más.
 *
 * Base64 no tiene comillas ni paréntesis, así que un valor que pase este control
 * no puede cerrar el atributo `src` ni abrir una `url()`. Es lo que hace que
 * interpolarlo sin escapar sea correcto.
 */
const DATA_URI_PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Ídem para las imágenes del borrador, que además pueden ser JPEG.
 *
 * Las fotos de faena se guardan como JPEG —una foto en PNG pesa cuatro veces más—
 * así que el control acepta los dos tipos que produce el servidor y ninguno más.
 * Los logos siguen con el control estricto de PNG: ese camino no produce otra cosa
 * y no hay razón para aflojarlo.
 */
const DATA_URI_IMAGEN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Tope de una imagen del documento: una foto de faena normalizada pesa mucho menos. */
const LIMITE_IMAGEN = 4 * 1024 * 1024;

export interface LogosDocumento {
  /** El de la empresa que emite. Va en la celda izquierda del encabezado. */
  casa: string | null;
  /** El del cliente de esta oferta. Va en la celda derecha. */
  cliente: string | null;
}

/** Sin logos: el encabezado sale en texto, como antes de que esto existiera. */
export const SIN_LOGOS: LogosDocumento = { casa: null, cliente: null };

/** ¿Es un archivo que sharp va a poder abrir? */
export function esFormatoDeLogo(mime: string, nombre: string): boolean {
  if (/^image\/(png|jpeg|webp|svg\+xml)$/.test(mime)) return true;
  // El mime que manda el navegador no siempre viene (un .svg servido de un ZIP
  // llega como application/octet-stream), así que la extensión también vale.
  return /\.(png|jpe?g|webp|svg)$/i.test(nombre.trim());
}

/**
 * El logo tal como puede entrar al documento, o null.
 *
 * Devuelve null en vez de lanzar: un logo que no pasa el control deja el
 * encabezado en texto, que es exactamente lo que salía antes. Un documento no se
 * cae por una imagen.
 */
export function logoSeguro(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  if (valor.length > LIMITE_DATA_URI) return null;
  return DATA_URI_PNG.test(valor) ? valor : null;
}

/**
 * Una imagen del borrador lista para dibujar.
 *
 * `proporcion` es ancho/alto, y va en vez de la bandera `apaisada` que había antes.
 * Con una bandera solo se podia decidir "ancho completo o media pagina"; con la
 * proporcion, la caja de la figura puede tener LA FORMA DE LA FOTO. Es la diferencia
 * entre una foto y una foto con dos bandas grises: la grilla fijaba `height: 60mm` y
 * cualquier imagen vertical quedaba centrada en una caja horizontal.
 *
 * 0 cuando no se pudo medir: ahi la figura sale sin forma declarada y el navegador usa
 * la de la imagen, que es lo mismo pero sin poder reservar el espacio antes de cargarla.
 */
export interface ImagenDibujable {
  uri: string;
  proporcion: number;
}

/** A partir de esta proporción, una imagen va al ancho completo. */
export const PROPORCION_APAISADA = 1.6;

/**
 * Una foto ancha o un diagrama tecnico a media pagina no se leen: van al ancho completo.
 */
export const esApaisada = (proporcion: number): boolean => proporcion >= PROPORCION_APAISADA;

/**
 * Una imagen del borrador tal como puede entrar al documento, o null.
 *
 * Mismo criterio que `logoSeguro`: lo que no pasa no se dibuja, y el documento
 * sale igual. Una foto que falta es una foto que falta; un documento roto es otra
 * cosa.
 */
export function imagenSegura(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  if (valor.length > LIMITE_IMAGEN) return null;
  return DATA_URI_IMAGEN.test(valor) ? valor : null;
}
