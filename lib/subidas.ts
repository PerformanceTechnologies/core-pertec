/**
 * Subir archivos desde el navegador sin mentirle a quien los sube.
 *
 * Nace de un error real: al subir un maestro en PDF, la pantalla mostró
 * "JSON.parse: unexpected character at line 1 column 1 of the JSON data". Eso no
 * es un problema del archivo ni algo que la persona pueda arreglar — es lo que
 * pasa cuando el código hace `await respuesta.json()` sin preguntar si la
 * respuesta es JSON. Cuando el servidor devuelve una página de error, una
 * redirección al login o nada, ese `json()` explota y el mensaje que se ve es el
 * de la excepción del parser, no la causa.
 *
 * Las tres causas que de verdad aparecen en una subida no producen JSON:
 *
 *  - El archivo pasa el tope de cuerpo de la función (Vercel corta en ~4,5 MB) y
 *    la plataforma responde 413 con una página.
 *  - La función tarda más de su maxDuration y responde 504, también con página.
 *  - La sesión venció y el guard redirige al login, así que llega el HTML del
 *    login con status 200.
 *
 * `leerRespuesta` las nombra. Sin "server-only": corre en el navegador.
 */

/**
 * Tope de una subida.
 *
 * No es un gusto: Vercel limita el cuerpo de un request a una función a unos
 * 4,5 MB, y lo que pasa de ahí no llega al código —lo corta la plataforma— así
 * que conviene decirlo antes de mandar 12 MB por una conexión de faena. Se deja
 * un margen para lo que el multipart agrega alrededor del archivo.
 */
export const LIMITE_SUBIDA = 4 * 1024 * 1024;

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace(".", ",");

/** El aviso de tamaño, o null si el archivo entra. Se revisa antes de mandarlo. */
export function avisoDeTamano(archivo: File): string | null {
  if (archivo.size <= LIMITE_SUBIDA) return null;
  return (
    `"${archivo.name}" pesa ${mb(archivo.size)} MB y el tope por subida es ${mb(LIMITE_SUBIDA)} MB. ` +
    "El límite lo pone el servidor, no el sistema: para un PDF, exportarlo con las imágenes comprimidas " +
    "suele bastar."
  );
}

/** El texto de la respuesta, recortado y sin marcado, para poder reportarla. */
function resumen(texto: string): string {
  const limpio = texto
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpio ? `: ${limpio.slice(0, 160)}` : "";
}

function explicar(respuesta: Response, texto: string): string {
  if (respuesta.status === 413 || /PAYLOAD_TOO_LARGE|Request Entity Too Large/i.test(texto)) {
    return (
      `El archivo es más grande de lo que acepta el servidor (tope ${mb(LIMITE_SUBIDA)} MB). ` +
      "Exportalo más liviano y volvé a intentar."
    );
  }
  if (respuesta.status === 504 || /INVOCATION_TIMEOUT/i.test(texto)) {
    return (
      "El servidor tardó más de lo permitido y cortó la operación. Con un archivo más chico " +
      "—o con menos páginas— suele pasar."
    );
  }
  if (respuesta.status === 401 || respuesta.status === 403) {
    return "La sesión venció. Recargá la página y volvé a entrar.";
  }
  // Un guard de página redirige al login en vez de responder un status: llega el
  // HTML del login con 200 y ningún JSON adentro.
  if (respuesta.redirected || /\/ingresar/.test(respuesta.url) || /^\s*</.test(texto)) {
    return (
      `El servidor devolvió una página en vez de un resultado (HTTP ${respuesta.status}). ` +
      "Suele ser la sesión vencida: recargá la página y volvé a entrar."
    );
  }
  return `El servidor respondió HTTP ${respuesta.status} sin explicar por qué${resumen(texto)}`;
}

/**
 * El resultado de una subida, o un error que se puede leer.
 *
 * Lanza en vez de devolver un resultado porque los tres lugares que la usan ya
 * tienen su try/catch y su cartel de error: así el mensaje aparece donde ya
 * aparecía, pero diciendo algo.
 */
export async function leerRespuesta<T>(respuesta: Response): Promise<T> {
  const texto = await respuesta.text();

  let datos: unknown = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = null;
  }

  // Un error que el servidor sí explicó gana sobre cualquier interpretación de acá.
  if (datos && typeof datos === "object" && "error" in datos) {
    throw new Error(String((datos as { error: unknown }).error));
  }
  if (respuesta.ok && datos !== null) return datos as T;

  throw new Error(explicar(respuesta, texto));
}
