/**
 * Correr trabajo de a varios, con tope de tiempo.
 *
 * Existe por un problema medido: el cron del resumen procesaba a las ocho personas
 * UNA DESPUÉS DE OTRA, y cada una es una llamada al modelo sobre sesenta correos que
 * tarda entre 20 y 60 segundos. En un día bueno, 8 × 20 s = 160 s y entraba; en uno
 * malo, 8 × 56 s = 450 s contra el tope de 300 s de la función, así que la corrida se
 * cortaba a la mitad y los que faltaban esperaban el cron siguiente —dos horas
 * después—. En los datos: el 28 de agosto una sola persona recibió su resumen
 * temprano y las otras siete entre las 09:41 y las 12:20.
 *
 * En paralelo, el tiempo de la corrida es el de la persona más lenta y no la suma.
 * Con tope, porque "en paralelo" sin límite cambiaría un problema por otro: ocho
 * llamadas simultáneas al modelo se topan con su límite de tasa, y ahí el error es de
 * todos a la vez.
 *
 * Sin "server-only" y sin nada de Graph ni del modelo adentro: son dos funciones de
 * control de flujo y se prueban solas (npm run probar-resumen).
 */

/**
 * Procesa los items de a `tanda` a la vez y devuelve los resultados EN EL ORDEN de
 * entrada.
 *
 * Nunca hay más de `tanda` tareas empezadas a la vez. `alTerminar` se llama con cada
 * resultado a medida que llega, para poder ir anotando sin esperar a que termine todo.
 *
 * Una tarea que lanza NO corta las demás: su lugar en el arreglo queda con el error
 * envuelto, igual que allSettled. Es lo que permite que un buzón roto no le quite el
 * resumen al resto.
 *
 * `seguir` se consulta antes de empezar cada item: es como se corta una corrida que ya
 * gastó su presupuesto de tiempo, dejando los que no empezaron para el intento
 * siguiente en vez de que la plataforma mate la función a mitad de camino.
 */
export async function enTandas<T, R>(
  items: T[],
  tanda: number,
  tarea: (item: T, indice: number) => Promise<R>,
  opciones: { alTerminar?: (indice: number, resultado: Resultado<R>) => void; seguir?: () => boolean } = {},
): Promise<(Resultado<R> | "no_empezado")[]> {
  const salida: (Resultado<R> | "no_empezado")[] = items.map(() => "no_empezado");
  const cupo = Math.max(1, Math.floor(tanda));
  let proximo = 0;

  const trabajador = async (): Promise<void> => {
    for (;;) {
      if (opciones.seguir && !opciones.seguir()) return;
      const indice = proximo;
      if (indice >= items.length) return;
      proximo += 1;

      const resultado: Resultado<R> = await tarea(items[indice], indice).then(
        (valor) => ({ estado: "ok" as const, valor }),
        (error: unknown) => ({ estado: "falló" as const, error }),
      );
      salida[indice] = resultado;
      opciones.alTerminar?.(indice, resultado);
    }
  };

  await Promise.all(Array.from({ length: Math.min(cupo, items.length) }, trabajador));
  return salida;
}

export type Resultado<R> = { estado: "ok"; valor: R } | { estado: "falló"; error: unknown };

/**
 * La promesa, o un error si tarda más de `ms`.
 *
 * El trabajo abandonado NO se cancela —no hay forma de cancelar una llamada al modelo
 * ya en vuelo— y eso está bien acá: si termina después, deja el resumen guardado y el
 * intento siguiente lo encuentra hecho, así que el tiempo no se pierde. Por eso el
 * tope se le pone a la GENERACIÓN y no al envío: un envío abandonado sí podría
 * terminar mandando un correo que la corrida ya dio por perdido.
 */
export function conTope<T>(ms: number, trabajo: Promise<T>, queEs: string): Promise<T> {
  let reloj: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`${queEs} tardó más de ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([trabajo, limite]).finally(() => clearTimeout(reloj)) as Promise<T>;
}
