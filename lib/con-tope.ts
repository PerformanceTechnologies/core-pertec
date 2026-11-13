/** Corta una promesa que tarda más de `ms`: así un servicio caído (correo, calendario) no deja la página cargando. */
export function conTope<T>(promesa: Promise<T>, ms: number, que = "La consulta"): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    promesa,
    new Promise<T>((_, rechazar) => {
      t = setTimeout(() => rechazar(new Error(`${que} tardó más de ${Math.round(ms / 1000)} s`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}
