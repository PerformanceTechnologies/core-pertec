import type { OfertaCanonica } from "./tipos";

/**
 * Lo que devuelve el modelo, puesto en la forma canónica.
 *
 * Existe por una restricción concreta del esquema, y conviene entenderla porque
 * dictó la forma de todo lo demás. Un esquema de salida se compila a una gramática,
 * y hay dos cosas que la hacen explotar:
 *
 *  - Los tipos unión —`["string","null"]`, `anyOf` contra null—. La API corta en 16
 *    y el esquema del borrador tenía 35.
 *  - Las propiedades opcionales. Con 19 claves que pueden estar o no, la gramática
 *    tiene que admitir cualquiera de sus combinaciones, y la API responde "Schema
 *    is too complex". Fue el paso siguiente al anterior: cambiar nullable por
 *    opcional cambió una explosión por otra.
 *
 * Lo que no explota es un esquema donde TODO es obligatorio y de un solo tipo. Así
 * quedó: el modelo devuelve siempre todas las claves, y "el documento no lo trae"
 * se dice con un valor —texto en blanco, número en 0, sección con sus listas
 * vacías— en vez de con la ausencia.
 *
 * Ese valor no es lo que el resto del módulo espera, y traducirlo es el trabajo de
 * este archivo: una sección vacía vuelve a ser null, y un total impreso en 0 vuelve
 * a ser "no está impreso". Así el cambio queda contenido acá y ni la maqueta ni los
 * controles tienen que saber nada de esto.
 *
 * Sin "server-only": es una transformación pura y se prueba con tsx.
 */

/**
 * ¿Tiene algún dato de verdad?
 *
 * Un 0 no cuenta como dato a este fin: es el valor que usa el modelo para decir
 * "no viene", y una sección real siempre trae además una lista o un texto.
 */
function tieneContenido(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim() !== "";
  if (typeof valor === "number") return valor !== 0;
  if (typeof valor === "boolean") return valor;
  if (Array.isArray(valor)) return valor.some(tieneContenido);
  if (typeof valor === "object") return Object.values(valor).some(tieneContenido);
  return true;
}

/** Las diez secciones que pueden no aplicar. La identificación siempre va. */
const SECCIONES = [
  "alcance",
  "metodologia",
  "especificaciones",
  "organizacion",
  "programa",
  "precio",
  "condicionesComerciales",
  "aportes",
  "cierre",
  "anexo",
] as const;

export function normalizarLectura(bruto: OfertaCanonica): OfertaCanonica {
  const oferta = { ...bruto } as unknown as Record<string, unknown>;

  // Una sección que el modelo devolvió vacía es una sección que no aplica: vuelve
  // a null, que es lo que la maqueta y los controles ya saben tratar.
  for (const seccion of SECCIONES) {
    if (!tieneContenido(oferta[seccion])) oferta[seccion] = null;
  }

  const precio = oferta.precio as OfertaCanonica["precio"];
  if (precio) {
    // Un total en 0 es "no está impreso". Un total impreso de exactamente $0 no
    // existe en una oferta real, y si existiera el control de la línea en 0 lo
    // marca igual — mientras que tratarlo como impreso daría un aviso falso:
    // "el TOTAL NETO impreso es $0 y la suma da $15.885.200".
    oferta.precio = {
      ...precio,
      totalNetoImpreso: precio.totalNetoImpreso ? precio.totalNetoImpreso : null,
      lineas: precio.lineas.map((linea) => ({
        ...linea,
        valorTotalImpreso: linea.valorTotalImpreso ? linea.valorTotalImpreso : null,
      })),
    };
  }

  return oferta as unknown as OfertaCanonica;
}
