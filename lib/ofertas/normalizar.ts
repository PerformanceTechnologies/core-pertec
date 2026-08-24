import {
  SECCIONES_CON_IMAGENES,
  firmaDe,
  type Cierre,
  type OfertaCanonica,
  type SeccionConImagenes,
} from "./tipos";

/**
 * De las dos lecturas planas a la oferta canónica.
 *
 * Este archivo existe por una restricción del esquema de salida, y esa restricción
 * terminó dictando la forma de la lectura entera. Un esquema se compila a una
 * gramática, y la API la rechaza cuando se pasa de grande. El camino hasta acá
 * fueron tres rechazos, cada uno arreglando el anterior:
 *
 *  1. Cada campo ausente como `["string","null"]` y cada sección como `anyOf`
 *     contra null: 35 tipos unión, y el tope son 16.
 *  2. Cambiar eso por propiedades opcionales: 19 claves que pueden estar o no,
 *     así que la gramática tiene que admitir todas sus combinaciones — "Schema is
 *     too complex".
 *  3. Todo obligatorio y de un solo tipo, pero un único esquema anidado de 18
 *     objetos y 67 propiedades: "The compiled grammar is too large".
 *
 * La conclusión, y el motivo de este archivo: **el esquema tiene que ser chico y
 * plano, y armar la estructura es trabajo del servidor.** La lectura se parte en
 * dos —la letra y los números— con un esquema plano cada una, y acá se juntan en
 * la forma que el resto del módulo ya sabe tratar.
 *
 * Es la misma línea que gobierna todo el módulo, un paso más allá: el modelo
 * transcribe, el servidor calcula. Ahora también el servidor estructura.
 *
 * Sin "server-only": es una transformación pura y se prueba con tsx.
 */

/** La parte narrativa del borrador, tal como la devuelve el modelo: plana. */
export interface LecturaLetra {
  titulo: string;
  numeroOferta: string;
  fecha: string;
  validez: string;
  cliente: string;
  atencion: string;
  copia: string;
  referencia: string;
  faena: string;
  alcanceIntroduccion: string;
  alcanceActividades: string[];
  alcanceTrabajosPrevios: string[];
  metodologiaAntes: string[];
  metodologiaDurante: string[];
  especificaciones: { parametro: string; especificacion: string }[];
  condicionesComerciales: string[];
  aportesPertec: string[];
  aportesCliente: string[];
  cierreTexto: string;
  firmantes: { nombre: string; cargo: string; empresa: string }[];
  cierreCc: string;
  anexoRespaldos: string[];
  anexoMandantes: string[];
  anexoNotaEquipo: string;
  /** Dónde estaba cada imagen del borrador: número de marcador y sección. */
  ubicacionImagenes: { imagen: number; seccion: string; epigrafe?: string }[];
  /** El número de [IMAGEN n] que es la firma escaneada. 0 = no hay. */
  firmaImagen: number;
  porConfirmar: string[];
  omitidas: string[];
}

/** Los cuadros con cifras: lo único sobre lo que el servidor calcula. */
export interface LecturaNumeros {
  personalEspecialista: { cargo: string; dotacion: number }[];
  cuadroPersonal: { cargo: string; dotacion: number; regimen: string }[];
  responsabilidades: { cargo: string; descripcion: string }[];
  organizacionNota: string;
  programaIntroduccion: string;
  turnos: { turno: string; jornada: string; horas: number }[];
  programaNota: string;
  lineasPrecio: {
    cantidad: number;
    cargo: string;
    unidad: string;
    valorUnitario: number;
    valorTotalImpreso: number;
  }[];
  totalNetoImpreso: number;
  precioNota: string;
  porConfirmar: string[];
}

/** El texto, o null si vino en blanco. El esquema no admite nullables. */
const texto = (valor: unknown): string | null => {
  const s = typeof valor === "string" ? valor.trim() : "";
  return s === "" ? null : s;
};

/**
 * La cantidad de una línea de precio.
 *
 * Muchas tablas de precio no traen columna de cantidad —"Ítem | Cargo | Unidad |
 * Precio"— y ahí cada línea es una unidad de lo que dice: el total de la línea es
 * su precio. El modelo, con la instrucción de no inventar, devolvía 0, y el
 * servidor multiplicaba 0 × precio: una oferta de cien millones daba un total
 * calculado de $ 0.
 *
 * Una cantidad de 0 no significa nada en una oferta —una línea que no se cobra no
 * es una línea— así que tomarla como 1 es la lectura correcta, no un parche. Y se
 * anota en "porConfirmar", porque quien revisa tiene que poder verlo.
 */
const cantidadDe = (valor: unknown): number => (typeof valor === "number" && valor > 0 ? valor : 1);

/**
 * Los números de imagen que el modelo repartió, saneados.
 *
 * Solo enteros positivos y sin repetidos: una foto dos veces sería la misma foto
 * dos veces en el documento, y un índice que no existe no dibuja nada. Que el
 * número corresponda a una imagen guardada lo comprueba quien la va a dibujar
 * —solo él tiene el inventario— así que acá se limpia la forma, no el contenido.
 */
const indices = (valor: unknown): number[] =>
  Array.isArray(valor)
    ? [...new Set(valor.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0))]
    : [];

/** El número, o null si vino en 0: así dice el esquema "no está impreso". */
const numero = (valor: unknown): number | null => (typeof valor === "number" && valor !== 0 ? valor : null);

const lista = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

const filas = <T>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);

/**
 * ¿La sección tiene algún dato, o vino vacía porque no aplica?
 *
 * Un 0 no cuenta: es el valor con que el modelo dice "no viene", y una sección real
 * siempre trae además una lista o un texto.
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

/** Devuelve la sección, o null si está vacía: una sección vacía no aplica. */
function seccion<T>(armada: T): T | null {
  return tieneContenido(armada) ? armada : null;
}

/** ¿Ninguna línea trajo cantidad? Entonces la tabla no tenía esa columna. */
function sinCantidad(numeros: LecturaNumeros): boolean {
  const lineas = filas<LecturaNumeros["lineasPrecio"][number]>(numeros.lineasPrecio);
  return lineas.length > 0 && lineas.every((l) => !(typeof l.cantidad === "number" && l.cantidad > 0));
}

/**
 * El reparto de imágenes por sección, saneado.
 *
 * Se descarta lo que no es un índice válido, lo que apunta a una sección que no
 * existe y los repetidos: una imagen dos veces en la misma sección sería la misma
 * imagen dos veces en el documento. El orden dentro de cada sección es el que
 * traía el borrador, que es el que la persona ve en las miniaturas.
 *
 * Que el número corresponda a una imagen guardada lo comprueba quien la dibuja
 * —solo él tiene el inventario—, así que acá se limpia la forma.
 */
function repartoDeImagenes(ubicaciones: LecturaLetra["ubicacionImagenes"]): {
  reparto: Partial<Record<SeccionConImagenes, number[]>>;
  epigrafes: Record<number, string>;
} {
  const reparto: Partial<Record<SeccionConImagenes, number[]>> = {};
  const epigrafes: Record<number, string> = {};
  if (!Array.isArray(ubicaciones)) return { reparto, epigrafes };

  for (const entrada of ubicaciones) {
    const indice = Number(entrada?.imagen);
    const seccion = String(entrada?.seccion ?? "").trim() as SeccionConImagenes;
    if (!Number.isInteger(indice) || indice <= 0) continue;
    if (!SECCIONES_CON_IMAGENES.includes(seccion)) continue;

    const enLaSeccion = reparto[seccion] ?? [];
    if (!enLaSeccion.includes(indice)) enLaSeccion.push(indice);
    reparto[seccion] = enLaSeccion;

    const epigrafe = texto(entrada?.epigrafe);
    if (epigrafe) epigrafes[indice] = epigrafe;
  }

  return { reparto, epigrafes };
}

export function armarOferta(letra: LecturaLetra, numeros: LecturaNumeros): OfertaCanonica {
  const reparto = repartoDeImagenes(letra.ubicacionImagenes);
  const especificaciones = filas<{ parametro: string; especificacion: string }>(
    letra.especificaciones,
  ).filter((e) => (e?.parametro ?? "").trim() !== "");

  const condiciones = lista(letra.condicionesComerciales);

  return {
    titulo: texto(letra.titulo) ?? "OFERTA SIN TÍTULO",
    identificacion: {
      numeroOferta: texto(letra.numeroOferta),
      fecha: texto(letra.fecha),
      validez: texto(letra.validez),
      cliente: texto(letra.cliente),
      atencion: texto(letra.atencion),
      copia: texto(letra.copia),
      referencia: texto(letra.referencia),
      faena: texto(letra.faena),
    },

    alcance: seccion({
      introduccion: texto(letra.alcanceIntroduccion),
      actividades: lista(letra.alcanceActividades),
      trabajosPrevios: lista(letra.alcanceTrabajosPrevios),
      // El personal especialista de la sección 2.3 se lee con los números, no con
      // la letra: es un cuadro con dotaciones y el servidor lo suma.
      personalEspecialista: filas<{ cargo: string; dotacion: number }>(numeros.personalEspecialista),
    }),

    metodologia: seccion({
      antesDeLaDetencion: lista(letra.metodologiaAntes),
      duranteLaDetencion: lista(letra.metodologiaDurante),
    }),

    especificaciones: especificaciones.length > 0 ? especificaciones : null,

    organizacion: seccion({
      cuadroPersonal: filas<{ cargo: string; dotacion: number; regimen: string }>(numeros.cuadroPersonal),
      responsabilidades: filas<{ cargo: string; descripcion: string }>(numeros.responsabilidades).filter(
        (r) => (r?.cargo ?? "").trim() !== "",
      ),
      nota: texto(numeros.organizacionNota),
    }),

    programa: seccion({
      introduccion: texto(numeros.programaIntroduccion),
      turnos: filas<{ turno: string; jornada: string; horas: number }>(numeros.turnos),
      nota: texto(numeros.programaNota),
    }),

    precio: seccion({
      lineas: filas<LecturaNumeros["lineasPrecio"][number]>(numeros.lineasPrecio).map((l) => ({
        cantidad: cantidadDe(l.cantidad),
        cargo: l.cargo,
        unidad: l.unidad,
        valorUnitario: l.valorUnitario,
        // Un total en 0 es "no está impreso", no un total de cero pesos. Tratarlo
        // como impreso daría el aviso falso "el documento imprime $ 0 pero
        // 1 × $ 15.885.200 da $ 15.885.200".
        valorTotalImpreso: numero(l.valorTotalImpreso),
      })),
      totalNetoImpreso: numero(numeros.totalNetoImpreso),
      nota: texto(numeros.precioNota),
    }),

    condicionesComerciales: condiciones.length > 0 ? condiciones : null,

    aportes: seccion({
      pertec: lista(letra.aportesPertec),
      cliente: lista(letra.aportesCliente),
    }),

    cierre: seccion({
      firmaImagen: indices([letra.firmaImagen])[0] ?? null,
      texto: texto(letra.cierreTexto),
      firmantes: filas<{ nombre: string; cargo: string; empresa: string }>(letra.firmantes)
        .filter((f) => (f?.nombre ?? "").trim() !== "")
        .map((f) => ({ nombre: f.nombre, cargo: f.cargo, empresa: texto(f.empresa) })),
      cc: texto(letra.cierreCc),
    }),

    anexo: seccion({
      respaldoInstitucional: lista(letra.anexoRespaldos),
      mandantes: lista(letra.anexoMandantes),
      notaEquipo: texto(letra.anexoNotaEquipo),
    }),

    // Las dos lecturas ven el mismo documento y cada una nombra lo que le faltó:
    // van juntas y sin repetidos. Y se suma lo que el servidor tuvo que asumir,
    // que es tan revisable como lo que faltó.
    porConfirmar: [
      ...new Set([
        ...lista(letra.porConfirmar),
        ...lista(numeros.porConfirmar),
        ...(sinCantidad(numeros)
          ? [
              "La tabla de precios no trae columna de cantidad: se tomó 1 por línea, " +
                "así que el total de cada línea es su precio.",
            ]
          : []),
      ]),
    ],

    imagenesPorSeccion: reparto.reparto,
    epigrafesDeImagenes: reparto.epigrafes,

    // El motivo viene como una frase sola ("Precio: el borrador no trae tabla"),
    // porque un objeto más en el esquema es gramática que no hace falta.
    omitidas: lista(letra.omitidas).map((linea) => {
      const corte = linea.indexOf(":");
      return corte > 0
        ? { seccion: linea.slice(0, corte).trim(), motivo: linea.slice(corte + 1).trim() }
        : { seccion: linea.trim(), motivo: "" };
    }),
  };
}

/**
 * El contenido sin una imagen: la saca de su sección, de su epígrafe y de la firma.
 *
 * Las tres cosas juntas, porque son la misma. Una imagen que ya no existe pero sigue
 * nombrada en `imagenesPorSeccion` es un número que no dibuja nada; y como firma
 * dejaría el bloque de cierre con el hueco de la rúbrica reservado y vacío, que es
 * peor que no tener firma. Una sección que se queda sin ninguna imagen desaparece
 * del reparto en vez de quedar como una lista vacía.
 *
 * Va acá y no en `imagenes.ts` para poder probarlo: aquel módulo habla con el bucket
 * y esto es una función del contenido.
 */
export function sinLaImagen(contenido: OfertaCanonica, indice: number): OfertaCanonica {
  const porSeccion: Partial<Record<SeccionConImagenes, number[]>> = {};
  for (const [seccion, indices] of Object.entries(contenido.imagenesPorSeccion ?? {})) {
    const quedan = (indices ?? []).filter((n) => n !== indice);
    if (quedan.length > 0) porSeccion[seccion as SeccionConImagenes] = quedan;
  }

  const epigrafes = { ...(contenido.epigrafesDeImagenes ?? {}) };
  delete epigrafes[indice];

  const cierre = contenido.cierre;
  return {
    ...contenido,
    imagenesPorSeccion: porSeccion,
    epigrafesDeImagenes: epigrafes,
    cierre: cierre
      ? {
          ...cierre,
          // De la de cada firmante y de la del borrador: la imagen se fue, y una
          // rúbrica que apunta a un archivo que no está deja el hueco reservado y
          // vacío, que se lee como un documento sin firmar.
          firmantes: cierre.firmantes.map((f, i) =>
            firmaDe(cierre, i) === indice ? { ...f, firmaImagen: null } : f,
          ),
          firmaImagen: cierre.firmaImagen === indice ? null : cierre.firmaImagen,
        }
      : cierre,
  };
}

/**
 * El contenido que se está guardando, con el reparto de imágenes que hay guardado.
 *
 * Dos pantallas escriben sobre la misma oferta y cada una es dueña de una parte: el
 * editor manda el texto y los montos; el panel de imágenes manda en qué sección va
 * cada una y cuál es la firma. El editor, sin embargo, guarda el contenido ENTERO,
 * así que sin esto pasaba lo siguiente: se aplican las imágenes, se corrige un
 * párrafo, se guarda — y el reparto vuelve al que había cuando se abrió la pantalla,
 * porque esa copia se cargó antes. Las fotos desaparecían del documento sin que
 * nadie las tocara.
 *
 * La regla es que cada quien guarda lo suyo. Los epígrafes no están acá a propósito:
 * esos SÍ se editan en el documento.
 */
export function conElRepartoDe(nuevo: OfertaCanonica, guardado: OfertaCanonica): OfertaCanonica {
  const guardadoCierre = guardado.cierre;
  return {
    ...nuevo,
    imagenesPorSeccion: guardado.imagenesPorSeccion ?? {},
    cierre: nuevo.cierre
      ? {
          ...nuevo.cierre,
          // La rúbrica se reencuentra con su firmante POR EL NOMBRE y no por la
          // posición: el editor puede haber agregado, sacado o movido firmantes
          // desde que se cargó esa copia, y por índice la firma de una persona
          // terminaría debajo del nombre de otra. Si ese nombre ya no está, la
          // rúbrica se pierde, que es lo correcto: era de alguien que ya no firma.
          firmantes: nuevo.cierre.firmantes.map((f) => ({
            ...f,
            firmaImagen: firmaGuardadaDe(guardadoCierre, f.nombre),
          })),
          firmaImagen: guardadoCierre?.firmaImagen ?? null,
        }
      : nuevo.cierre,
  };
}

/** La rúbrica que tenía guardada quien se llama así, o null. */
function firmaGuardadaDe(cierre: Cierre | null | undefined, nombre: string): number | null {
  if (!cierre) return null;
  const buscado = nombre.trim().toLocaleLowerCase("es-CL");
  if (buscado === "") return null;
  const posicion = cierre.firmantes.findIndex((f) => f.nombre.trim().toLocaleLowerCase("es-CL") === buscado);
  return posicion === -1 ? null : firmaDe(cierre, posicion);
}

/**
 * El contenido con una imagen puesta en una sección, o sacada de todas.
 *
 * Es lo que ocurre al arrastrar una foto sobre el documento. Sale primero de donde
 * estuviera: una imagen vive en UNA sección —si apareciera en dos, el documento la
 * dibujaría dos veces— así que mover es sacar y poner, no solo poner.
 *
 * Va al final de la sección porque es donde se ve que llegó algo nuevo. Reordenarlas
 * dentro de la sección es otra cosa y todavía no existe.
 */
export function conLaImagenEn(
  contenido: OfertaCanonica,
  indice: number,
  seccion: SeccionConImagenes | null,
): OfertaCanonica {
  const porSeccion: Partial<Record<SeccionConImagenes, number[]>> = {};
  for (const [clave, indices] of Object.entries(contenido.imagenesPorSeccion ?? {})) {
    const quedan = (indices ?? []).filter((n) => n !== indice);
    if (quedan.length > 0) porSeccion[clave as SeccionConImagenes] = quedan;
  }
  if (seccion) porSeccion[seccion] = [...(porSeccion[seccion] ?? []), indice];

  return { ...contenido, imagenesPorSeccion: porSeccion };
}
