/**
 * Las dos utilidades de red que comparten las pantallas del rendidor.
 *
 * Estaban dentro de PanelRendicion, y al mover el paso de Odoo a su propia página las
 * necesitaban las dos: copiarlas habria dejado dos versiones del manejo de errores de
 * Vercel, que es justamente lo que costo aprender.
 *
 * Sin "server-only": corren en el navegador.
 */

/**
 * Lee la respuesta de un fetch tolerando que NO sea JSON.
 *
 * Cuando una función de Vercel se cae o se pasa del tiempo, la plataforma
 * responde texto plano ("An error occurred with your deployment"), no JSON.
 * Un `resp.json()` directo revienta ahí con "Unexpected token 'A'", que no le
 * dice nada a quien rinde. Esto lo traduce al problema real.
 */
export async function leerRespuesta(resp: Response): Promise<Record<string, unknown>> {
  const texto = await resp.text();

  try {
    const json = JSON.parse(texto) as Record<string, unknown>;
    if (!resp.ok) throw new Error((json.error as string) ?? `Error ${resp.status}`);
    return json;
  } catch (e) {
    // Si el JSON parseó bien y el error viene del !resp.ok de arriba, se
    // propaga tal cual: ya es un mensaje accionable del servidor.
    if (e instanceof Error && !(e instanceof SyntaxError)) throw e;

    if (resp.status === 504 || resp.status === 408) {
      throw new Error(
        "el análisis tardó más de lo que permite el servidor. Subilo solo, sin otros archivos, o reducí el tamaño de la foto.",
      );
    }
    if (resp.status === 413) {
      throw new Error("el archivo es demasiado grande para el servidor. Reducilo antes de subirlo.");
    }
    throw new Error(
      `el servidor respondió ${resp.status} sin datos utilizables (${texto.slice(0, 80).trim() || "respuesta vacía"}).`,
    );
  }
}

type Resultado<R> = { ok: true; valor: R } | { ok: false; error: unknown };

/**
 * Corre `fn` sobre todos los items con un tope de tareas en vuelo.
 *
 * Los resultados vuelven EN EL ORDEN DE ENTRADA, no en el de finalización, y un
 * item que falla no arrastra a los demás: cada posición trae su valor o su
 * error. Las dos cosas importan acá — el orden define la numeración de los
 * gastos, y una boleta ilegible no puede tumbar la tanda completa.
 *
 * El tope existe porque cada tarea es un request a una función serverless:
 * mandar 16 de golpe se traduce en 16 invocaciones simultáneas y arriesga
 * rate limits, sin ganar nada sobre unas pocas en paralelo.
 */
export async function mapaConTope<T, R>(
  items: T[],
  tope: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<Resultado<R>[]> {
  const salida: Resultado<R>[] = new Array(items.length);
  let siguiente = 0;

  async function trabajador() {
    for (;;) {
      const i = siguiente++;
      if (i >= items.length) return;
      try {
        salida[i] = { ok: true, valor: await fn(items[i], i) };
      } catch (error) {
        salida[i] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(tope, items.length) }, trabajador));
  return salida;
}
