// La subida por trozos a una sesión de SharePoint. Corre en el NAVEGADOR: sin
// "server-only", y compartida entre Contratos y Acreditación para que haya una
// sola forma de subir un archivo grande y no dos que se desincronicen.

/**
 * Cuánto se manda en cada pedazo.
 *
 * Graph exige que cada trozo sea múltiplo de 320 KiB y recomienda no pasar de
 * 60 MiB. 10 MiB es un punto cómodo: pocas idas y vueltas para un contrato
 * escaneado, y suficientemente chico como para que la barra de avance se mueva
 * de verdad en vez de saltar de 0 a 100.
 */
const TAMANO_TROZO = 10 * 320 * 1024 * 3; // 9,84 MiB, múltiplo de 320 KiB

/**
 * Manda el archivo a la sesión de subida, en trozos.
 *
 * Por trozos y no de una: Graph no acepta un PUT de cualquier tamaño, y un
 * archivo grande en una sola petición tampoco deja saber cómo va — la barra se
 * quedaría en cero hasta terminar. Cada trozo lleva su `Content-Range`, que es
 * como SharePoint sabe qué pedazo está recibiendo.
 */
export async function subirPorTrozos(
  url: string,
  archivo: File,
  alAvanzar: (porcentaje: number) => void,
): Promise<{ id: string; name: string }> {
  const total = archivo.size;

  // Un archivo vacío no tiene trozos que mandar y el bucle no entraría nunca.
  if (total === 0) {
    const respuesta = await fetch(url, {
      method: "PUT",
      headers: { "Content-Range": "bytes */0" },
    });
    if (!respuesta.ok) throw new Error(`SharePoint respondió ${respuesta.status}`);
    return await respuesta.json();
  }

  let desde = 0;
  while (desde < total) {
    const hasta = Math.min(desde + TAMANO_TROZO, total);
    const trozo = archivo.slice(desde, hasta);

    const respuesta = await fetch(url, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${desde}-${hasta - 1}/${total}` },
      body: trozo,
    });

    // 202 = recibido, falta más. 200/201 = terminado, y ahí el cuerpo trae el
    // archivo creado: su id es lo que permite colgarle el comentario, y su
    // nombre puede no ser el original si SharePoint lo renombró por existir ya
    // uno igual.
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => null);
      throw new Error(cuerpo?.error?.message ?? `SharePoint respondió ${respuesta.status}`);
    }

    desde = hasta;
    alAvanzar(Math.round((desde / total) * 100));

    if (respuesta.status !== 202) {
      const creado = await respuesta.json();
      if (!creado?.id) throw new Error("SharePoint no devolvió el archivo creado.");
      return creado;
    }
  }

  throw new Error("La subida terminó sin que SharePoint confirmara el archivo.");
}

/**
 * Corre `tarea` sobre cada elemento, con a lo más `limite` a la vez.
 *
 * Para subir varios archivos: con PDFs chicos (lo normal en Contratos) lo que demora no es
 * el ancho de banda sino las idas y vueltas de cada uno —preparar la sesión, subir,
 * registrar—, y de a uno esas esperas se suman. Tres a la vez las superpone sin repartir
 * tanto el ancho como para que ninguno avance. Cada tarea maneja sus propios errores.
 */
export async function enParalelo<T>(elementos: T[], limite: number, tarea: (elemento: T, indice: number) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      await tarea(elementos[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, elementos.length) }, trabajador));
}
