/**
 * Las dos decisiones de la emisión que no hablan con nadie.
 *
 * El resto del paso —imprimir, subir a SharePoint, mandar por Graph— no se puede
 * probar sin credenciales, así que lo que sí tiene reglas propias vive acá: cómo se
 * llama el archivo que va a quedar en una carpeta compartida, y qué cuenta como
 * destinatario de lo que alguien escribió a mano en un campo de texto.
 *
 * Sin "server-only": lo usan la ruta del PDF, el envío, la subida y las pruebas.
 */

/**
 * El nombre del archivo, pensado para una carpeta con cien archivos más.
 *
 * "OS 009-2026 — AXINNTUS SERVICIOS INDUSTRIALES.pdf" y no un uuid ni
 * "OS_009_2026.pdf": lo va a buscar una persona entre otros. Se limpian los
 * caracteres que SharePoint rechaza en un nombre —" * : < > ? / \ |— acá y no en el
 * borde de Graph, porque ahí el error vuelve como un 400 que no explica nada.
 */
export function nombreDeArchivoDeOferta(numero: string | null, cliente: string | null): string {
  const partes = [numero?.trim(), cliente?.trim()].filter(Boolean);
  const base = (partes.join(" — ") || "Oferta técnica")
    .replace(/["*:<>?/\\|]+/g, " ")
    // Los puntos al final los recorta Windows en silencio, y un nombre que cambia
    // solo al bajarlo es peor que uno raro.
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  return `${base.slice(0, 120).trim() || "Oferta técnica"}.pdf`;
}

/**
 * Los correos que hay en un campo escrito a mano.
 *
 * Separa por coma, punto y coma o espacios —la gente pega las tres cosas— y descarta
 * lo que no tenga forma de correo. Descartar en silencio es correcto porque la
 * pantalla dice cuántos destinatarios quedaron: si alguien escribió mal uno, el
 * contador no cuadra con lo que ve y lo revisa. Mandar a una dirección inventada,
 * en cambio, no tiene vuelta.
 */
export function correosValidos(texto: string): string[] {
  const vistos = new Set<string>();
  for (const bruto of texto.split(/[,;\s]+/)) {
    // Copiar un contacto de Outlook pega "Alan Muñoz <alan@axinntus.cl>", y al
    // partir por espacios eso llega como "<alan@axinntus.cl>": con los signos
    // adentro pasa el control de forma y Graph después rechaza el envío entero. Se
    // saca lo que está entre los signos, que es lo que haría cualquier cliente de
    // correo.
    const correo = bruto.trim().replace(/^<|>$/g, "");
    // Nada exótico: un arroba, algo antes, un punto después. Validar más que esto
    // rechaza direcciones válidas y no evita ninguna equivocación real.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) continue;
    vistos.add(correo.toLowerCase());
  }
  return [...vistos];
}
