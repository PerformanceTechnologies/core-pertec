/**
 * El estilo de un maestro: los valores que cambian de un formato a otro.
 *
 * Acá está la línea que hace posible "subir el maestro" sin que el resultado
 * varíe entre corridas: **la estructura va en código y el estilo va en datos.**
 *
 * La estructura —las diez secciones, la tabla de precios con su fila de total,
 * los aportes a dos columnas, los hitos numerados— es la misma en todos los
 * maestros de PERTEC, así que vive en plantilla.ts y no se lee de ningún archivo.
 * Lo que cambia entre un maestro y otro es la piel: la paleta, las tipografías,
 * los tamaños, el alto del header. Ese conjunto es acotado y verificable —un hex
 * es un hex, un tamaño está entre 6 y 40— así que se puede extraer de un archivo
 * subido, guardar, y aplicar idéntico cada vez.
 *
 * La diferencia con pedirle al modelo que "respete el sistema visual" es esa: no
 * reinterpreta la maqueta en cada oferta, solo aportó una vez estos treinta y
 * pico de valores, que quedaron guardados y son revisables a mano.
 *
 * Sin "server-only": lo usan la plantilla (servidor) y la pantalla de maestros
 * (cliente, para editar los valores), y se prueba con tsx.
 */

export interface EstiloMaestro {
  /** Tipografía del cuerpo, como lista CSS. */
  fuenteCuerpo: string;
  /** Tipografía de títulos. Suele ser la misma. */
  fuenteTitulos: string;
  /** Cuerpo del texto en px. */
  tamanoCuerpo: number;
  /** Título de sección en px. */
  tamanoTitulo: number;
  /** Título de la portada en px. */
  tamanoPortada: number;

  /** Texto principal. */
  colorTinta: string;
  /** El color de acento: numerales de sección, barras, bordes de tarjeta. */
  colorAcento: string;
  /** El segundo acento, para alternar en las tarjetas. */
  colorAcentoAlterno: string;
  /** Texto secundario y rótulos. */
  colorSuave: string;
  /** Fondo de las cabeceras de tabla. */
  colorCabecera: string;
  /** Texto sobre la cabecera de tabla. */
  colorCabeceraTexto: string;
  /** Fondo de las filas alternadas y de los rótulos. */
  colorFondoSuave: string;
  /** Fondo de las filas de total. */
  colorFondoTotal: string;
  /** Bordes finos. */
  colorBorde: string;

  /** Alto del header de tres celdas, en mm. */
  altoHeader: number;
  /** Ancho de las celdas laterales del header, en mm. */
  anchoCeldaLateral: number;
  /** Margen lateral de la página, en mm. */
  margenLateral: number;
  /** Rótulo de la celda derecha del header. */
  rotuloLogoCliente: string;
}

/**
 * El estilo del maestro aprobado de PERTEC, tal como se midió del PDF de la
 * OS 010-2026.
 *
 * Es el valor por defecto: una oferta sin maestro elegido sale así, que es lo que
 * ya salía antes de que los maestros existieran.
 */
export const ESTILO_PERTEC: EstiloMaestro = {
  // Comillas SIMPLES, y no es cosmético: este valor se interpola tanto en un
  // bloque <style> como dentro de un atributo style="…" de las cajas de
  // encabezado que repite Chromium. Con comillas dobles, la primera cerraba el
  // atributo y se perdía todo lo que venía después — la tipografía, el color y el
  // margen lateral del encabezado, que salía más ancho que el texto de la página.
  fuenteCuerpo: "'Helvetica Neue', Arial, sans-serif",
  fuenteTitulos: "'Helvetica Neue', Arial, sans-serif",
  tamanoCuerpo: 10.5,
  tamanoTitulo: 15,
  tamanoPortada: 28,

  colorTinta: "#1f1b16",
  colorAcento: "#c85217",
  colorAcentoAlterno: "#00a080",
  colorSuave: "#8c8578",
  colorCabecera: "#262320",
  colorCabeceraTexto: "#ffffff",
  colorFondoSuave: "#f4f1ea",
  colorFondoTotal: "#ebe6d9",
  colorBorde: "#d9d3c7",

  altoHeader: 18,
  anchoCeldaLateral: 34,
  margenLateral: 16,
  rotuloLogoCliente: "[Logo cliente]",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Los rangos de cada medida. Fuera de esto, el documento se rompe. */
const LIMITES: Record<string, [number, number]> = {
  tamanoCuerpo: [7, 14],
  tamanoTitulo: [10, 26],
  tamanoPortada: [16, 44],
  altoHeader: [10, 30],
  anchoCeldaLateral: [18, 50],
  margenLateral: [8, 30],
};

/**
 * Una lista de tipografías, saneada.
 *
 * Se aceptan solo nombres de familia y las genéricas: cualquier otra cosa en esa
 * posición del CSS es una vía para inyectar declaraciones. Y `@import` o `url()`
 * no tendrían de dónde cargar —el PDF se imprime sin red— así que además serían
 * una fuente que no llega y un documento con la tipografía equivocada.
 */
function sanearFuente(valor: unknown, porDefecto: string): string {
  if (typeof valor !== "string") return porDefecto;
  const familias = valor
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => /^[a-zA-Z0-9 \-]{1,40}$/.test(f));
  if (familias.length === 0) return porDefecto;
  // Se re-citan las que tienen espacios y se cierra con una genérica, para que un
  // maestro que nombre una fuente que el servidor no tiene igual imprima bien.
  // Comilla simple: la doble rompería el atributo style="…" donde este valor
  // termina interpolado (ver ESTILO_PERTEC).
  const lista = familias.map((f) => (f.includes(" ") ? `'${f}'` : f));
  if (!/sans-serif|serif|monospace/.test(lista[lista.length - 1])) lista.push("sans-serif");
  return lista.join(", ");
}

/**
 * Completa y sanea un estilo parcial.
 *
 * Todo valor que no pase la validación cae al del maestro de PERTEC en vez de
 * romper el documento. Es deliberado: esto recibe lo que un modelo leyó de un
 * archivo subido, y un color mal transcrito no puede dejar una oferta ilegible ni
 * —peor— colar CSS arbitrario en un documento que se manda a un cliente.
 *
 * Devuelve también qué campos se descartaron, para poder mostrarlo: un estilo que
 * silenciosamente vuelve al de PERTEC se ve como "el maestro no sirvió" sin decir
 * por qué.
 */
export function sanearEstilo(parcial: unknown): { estilo: EstiloMaestro; descartados: string[] } {
  const entrada = (parcial ?? {}) as Record<string, unknown>;
  const estilo: EstiloMaestro = { ...ESTILO_PERTEC };
  const descartados: string[] = [];
  // Se escribe por una vista de tipo laxo: recorrer las claves de un objeto con
  // campos de distinto tipo hace que TypeScript estreche el destino a `never`, y
  // la alternativa es repetir el mismo saneo campo por campo.
  const destino = estilo as unknown as Record<string, string | number>;

  for (const [campo, valorPorDefecto] of Object.entries(ESTILO_PERTEC) as [
    keyof EstiloMaestro,
    string | number,
  ][]) {
    const valor = entrada[campo];
    // El blanco y el 0 son cómo dice el modelo "no lo distinguí": el esquema de
    // salida no puede tener campos nullables ni opcionales sin que la API lo
    // rechace por complejidad (ver leer-maestro.ts). No van a `descartados`
    // porque no son valores inválidos —el modelo ya los nombra en
    // "noDistinguidos"— y llamarlos inválidos sería decir que se equivocó.
    if (valor === undefined || valor === null || valor === "" || valor === 0) continue;

    if (campo === "fuenteCuerpo" || campo === "fuenteTitulos") {
      const saneada = sanearFuente(valor, valorPorDefecto as string);
      if (saneada !== valor) descartados.push(campo);
      destino[campo] = saneada;
      continue;
    }

    if (campo === "rotuloLogoCliente") {
      const texto = String(valor).replace(/[<>]/g, "").trim().slice(0, 40);
      destino[campo] = texto || (valorPorDefecto as string);
      continue;
    }

    if (typeof valorPorDefecto === "number") {
      const numero = Number(valor);
      const [min, max] = LIMITES[campo] ?? [0, Number.MAX_SAFE_INTEGER];
      if (!Number.isFinite(numero) || numero < min || numero > max) {
        descartados.push(`${campo} (fuera de ${min}–${max})`);
        continue;
      }
      destino[campo] = numero;
      continue;
    }

    // Los que quedan son colores.
    const color = String(valor).trim();
    if (!HEX.test(color)) {
      descartados.push(`${campo} (no es un hex de 6 dígitos)`);
      continue;
    }
    destino[campo] = color.toLowerCase();
  }

  return { estilo, descartados };
}
