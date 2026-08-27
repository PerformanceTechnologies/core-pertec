/**
 * El puente entre un texto del documento y el dato que lo produjo.
 *
 * La plantilla imprime cada valor con `data-campo="precio.lineas.2.cargo"`, y esto
 * es lo que sabe leer y escribir esa ruta dentro de la oferta. Es todo lo que hace
 * falta para editar SOBRE el documento sin dejar de guardar datos: lo que se toca
 * en pantalla no es un pedazo de HTML suelto, es ese campo.
 *
 * Mantiene en pie la regla de siempre —el servidor calcula, el documento muestra—
 * porque acá nunca se escribe un total ni un número de sección: esas celdas van
 * marcadas con `data-calculado` justo para que nadie las edite.
 *
 * Sin "server-only": lo usa el navegador, que es donde ocurre la edición.
 */

/** Lo que una ruta no puede tocar nunca, venga de donde venga. */
const CLAVES_PROHIBIDAS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * El número que hay dentro de un texto del documento.
 *
 * Las celdas de plata se imprimen formateadas —"$ 15.885.200.-"— así que al leerlas
 * de vuelta hay que sacarles el formato. Se queda con los dígitos y el signo: la
 * oferta no maneja decimales, y un punto en pesos chilenos es separador de miles,
 * de modo que interpretarlo como coma decimal convertiría 15.885.200 en 15,8.
 */
export function numeroDesdeTexto(texto: string): number {
  // El signo se mira aparte, no se filtra junto con los dígitos: el formato local
  // termina en ".-" —"$ 15.885.200.-"— y quedarse con todos los guiones deja
  // "15885200-", que no es un número. Salía 0, y con eso el total del documento.
  const digitos = texto.replace(/\D/g, "");
  const primerDigito = texto.search(/\d/);
  const negativo = primerDigito > 0 && texto.slice(0, primerDigito).includes("-");
  if (digitos === "") return 0;
  const valor = Number(digitos);
  if (!Number.isFinite(valor)) return 0;
  return negativo ? -valor : valor;
}

/** El objeto o arreglo que contiene el último tramo de la ruta, y ese tramo. */
function ubicar(raiz: unknown, ruta: string): { contenedor: Record<string, unknown>; clave: string } | null {
  const tramos = ruta.split(".");
  if (tramos.length === 0 || tramos.some((t) => t === "" || CLAVES_PROHIBIDAS.has(t))) return null;

  let actual: unknown = raiz;
  for (const tramo of tramos.slice(0, -1)) {
    if (actual === null || typeof actual !== "object") return null;
    actual = (actual as Record<string, unknown>)[tramo];
  }
  if (actual === null || typeof actual !== "object") return null;

  const clave = tramos[tramos.length - 1];
  // Una ruta solo apunta a algo que YA existe. Si el índice se fue del arreglo o la
  // clave no está, es que el documento en pantalla quedó viejo respecto del dato, y
  // en ese caso no escribir es mejor que inventar la estructura que falta.
  if (!Object.prototype.hasOwnProperty.call(actual, clave)) return null;
  return { contenedor: actual as Record<string, unknown>, clave };
}

/** El valor que hay en una ruta, o `undefined` si la ruta no lleva a ninguna parte. */
export function leerEnRuta(raiz: unknown, ruta: string): unknown {
  const destino = ubicar(raiz, ruta);
  return destino ? destino.contenedor[destino.clave] : undefined;
}

/**
 * Los rótulos son un diccionario, no una estructura fija.
 *
 * El resto de las rutas apunta a algo que YA existe —si la clave no está, el
 * documento en pantalla quedó viejo y no escribir es mejor que inventar—. Con los
 * rótulos es al revés: que la clave NO esté es lo normal, significa "usa el del
 * maestro", y escribirla por primera vez es exactamente lo que hay que poder hacer.
 */
const PREFIJO_ROTULOS = "rotulos.";

/**
 * Cambia un rótulo, o lo devuelve al del maestro si se deja en blanco.
 *
 * Vaciarlo BORRA la clave en vez de guardar "": un título vacío deja un hueco
 * numerado sin nombre en el documento, y lo que alguien quiere al vaciar un rótulo
 * que había cambiado es volver al de siempre.
 */
function asignarRotulo(raiz: unknown, clave: string, texto: string): boolean {
  // Una sola clave, sin tramos: los rótulos no anidan.
  if (clave === "" || clave.includes(".") || CLAVES_PROHIBIDAS.has(clave)) return false;
  if (raiz === null || typeof raiz !== "object") return false;

  const contenido = raiz as { rotulos?: Record<string, string> };
  const limpio = texto.replace(/\u00a0/g, " ").trim();
  if (limpio === "") {
    if (contenido.rotulos) delete contenido.rotulos[clave];
    return true;
  }
  if (!contenido.rotulos || typeof contenido.rotulos !== "object") contenido.rotulos = {};
  contenido.rotulos[clave] = limpio;
  return true;
}

/**
 * Escribe un texto del documento en su campo, respetando el tipo que había.
 *
 * Devuelve si escribió: una ruta que no existe no crea nada.
 *
 * El tipo lo manda el dato, no lo que se tipeó. Un campo que era número sigue
 * siendo número —si no, `calcularTotales` sumaría textos y el total saldría
 * concatenado— y uno que era `null` vuelve a `null` cuando se lo deja en blanco, en
 * vez de quedar como cadena vacía: son el mismo "no hay dato" y conviene que se
 * guarden igual, porque la plantilla omite la fila solo cuando falta.
 */
export function asignarEnRuta(raiz: unknown, ruta: string, texto: string, tipo?: "numero"): boolean {
  if (ruta.startsWith(PREFIJO_ROTULOS)) {
    return asignarRotulo(raiz, ruta.slice(PREFIJO_ROTULOS.length), texto);
  }

  const destino = ubicar(raiz, ruta);
  if (!destino) return false;
  const { contenedor, clave } = destino;
  const previo = contenedor[clave];

  if (tipo === "numero" || typeof previo === "number") {
    contenedor[clave] = numeroDesdeTexto(texto);
    return true;
  }

  // El espacio duro lo mete el navegador solo, al escribir dos espacios seguidos o
  // uno al final de la línea. Guardado tal cual reaparece en el PDF como un espacio
  // que no rompe línea y desalinea la justificación.
  const limpio = texto.replace(/\u00a0/g, " ");
  contenedor[clave] = limpio.trim() === "" && previo === null ? null : limpio;
  return true;
}
