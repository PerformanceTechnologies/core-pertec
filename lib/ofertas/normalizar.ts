import type { DestinoDeImagen } from "./destino-imagen";
import {
  SECCIONES_CON_IMAGENES,
  firmaDe,
  type BloqueLibre,
  type Cierre,
  type OfertaCanonica,
  type SeccionConImagenes,
  NOMBRE_DE_TIPO,
  type DisposicionDeImagen,
  type SeccionDelDocumento,
  type TipoDeDocumento,
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

/** El documento que no es una oferta, tal como lo devuelve el modelo: en orden. */
export interface LecturaLibre {
  titulo: string;
  subtitulo: string;
  cliente: string;
  fecha: string;
  codigo: string;
  bloques: {
    tipo: string;
    texto: string;
    parrafos: string[];
    columnas: string[];
    filas: string[][];
    imagen: number;
    epigrafe: string;
  }[];
  porConfirmar: string[];
}

/**
 * El documento libre: la estructura del original, con la piel de la casa.
 *
 * Devuelve una `OfertaCanonica` con TODAS las secciones de oferta en null y el contenido
 * en `bloques`. No es un atajo: es que un documento libre es exactamente eso —una lista de
 * títulos con su contenido— y la plantilla ya sabe numerar esos bloques, meterlos al índice
 * y dibujar sus tablas. Inventar un segundo tipo de contenido habría obligado a duplicar
 * la plantilla, el editor y la impresión.
 *
 * Tres decisiones:
 *
 *  - **El orden del arreglo manda.** Los párrafos y las tablas cuelgan del título o
 *    subtítulo que los precede; lo que venga antes del primer título cuelga de un bloque
 *    inicial sin nombre, porque descartarlo sería perder el primer párrafo del documento.
 *  - **Acá NO se descarta en silencio.** `armarOferta` puede tirar una fila sin parámetro
 *    porque la estructura canónica es el respaldo; en un documento libre lo único que hay
 *    es lo que vino, así que un bloque sin título igual se conserva.
 *  - **Las imágenes van en `imagenesPorSeccion`** contra la sección del bloque donde
 *    estaban, que es la única clave que entiende el resto del sistema (bajada de archivos,
 *    arrastre, PDF). Se conserva el ORDEN, que es lo que hace que salgan donde estaban.
 */
export function armarDocumentoLibre(lectura: LecturaLibre, tipo: TipoDeDocumento): OfertaCanonica {
  const bloques: BloqueLibre[] = [];
  const imagenesPorSeccion: Partial<Record<SeccionConImagenes, number[]>> = {};
  const epigrafes: Record<number, string> = {};

  // Todo el documento libre vive en una sección del maestro, y es "alcance" por una razón
  // práctica: es la primera que la plantilla dibuja después de la identificación, así que
  // los bloques salen en su orden y sin nada intercalado. La sección es una etiqueta
  // interna acá —el rótulo que se imprime es el título de cada bloque—.
  const EN: SeccionDelDocumento = "alcance";

  const nuevo = (
    titulo: string,
    nivel: "titulo" | "subtitulo",
    en: SeccionDelDocumento = EN,
  ): BloqueLibre => {
    const bloque: BloqueLibre = { en, nivel, titulo, parrafos: [], tabla: null };
    bloques.push(bloque);
    return bloque;
  };

  /**
   * Dónde cae el contenido que llega ANTES de cualquier título.
   *
   * Va sin título y colgado de la identificación, no como una sección propia: una sección
   * sin nombre se numeraría y entraría al índice con el renglón en blanco. Así el párrafo
   * de apertura sale donde corresponde —debajo de los datos del documento— y el índice
   * arranca en el primer título de verdad.
   */
  const actual = (): BloqueLibre =>
    bloques[bloques.length - 1] ?? nuevo("", "subtitulo", "identificacion");

  for (const bruto of Array.isArray(lectura.bloques) ? lectura.bloques : []) {
    const clase = typeof bruto?.tipo === "string" ? bruto.tipo.trim().toLowerCase() : "";

    if (clase === "titulo" || clase === "subtitulo") {
      nuevo(texto(bruto.texto) ?? "", clase);
      continue;
    }

    if (clase === "imagen") {
      const indice = numero(bruto.imagen);
      if (indice === null || !Number.isInteger(indice) || indice <= 0) continue;
      const puestas = imagenesPorSeccion[EN] ?? [];
      // Una imagen repetida se ignora: el documento la dibujaría dos veces.
      if (puestas.includes(indice)) continue;
      imagenesPorSeccion[EN] = [...puestas, indice];
      // Y en SU bloque, que es lo que la deja donde estaba: la grilla del final es para
      // un anexo de fotos, no para un documento que reproduce a otro.
      const donde = actual();
      donde.imagenes = [...(donde.imagenes ?? []), indice];
      const pie = texto(bruto.epigrafe);
      if (pie) epigrafes[indice] = pie;
      continue;
    }

    if (clase === "tabla") {
      const columnas = lista(bruto.columnas);
      const filasCrudas = Array.isArray(bruto.filas) ? bruto.filas : [];
      // Las celdas NO se filtran por vacías: una celda en blanco del original es un dato
      // —dice que ahí no había nada— y sacarla correría toda la fila una columna.
      const filas = filasCrudas
        .map((fila) => (Array.isArray(fila) ? fila.map((celda) => String(celda ?? "").trim()) : []))
        .filter((fila) => fila.length > 0);
      if (columnas.length === 0 && filas.length === 0) continue;

      // El ancho lo decide la fila MÁS LARGA, no la cabecera: si una fila trae una celda
      // de más, la cabecera es la que le falta un encabezado, y recortar la fila perdería
      // un dato del documento. Queda un encabezado en blanco, que se ve y se escribe
      // encima; un dato que desapareció no se ve.
      const anchoBase = Math.max(columnas.length, ...filas.map((f) => f.length), 1);
      const parejas = filas.map((fila) => {
        const iguales = fila.slice(0, anchoBase);
        while (iguales.length < anchoBase) iguales.push("");
        return iguales;
      });
      const cabeceras = [...columnas];
      while (cabeceras.length < anchoBase) cabeceras.push("");

      const donde = actual();
      // Un bloque lleva UNA tabla. La segunda abre un bloque propio sin título: es más
      // honesto que pegar las dos filas en la misma tabla, que tienen otras columnas.
      if (donde.tabla) nuevo("", "subtitulo").tabla = { columnas: cabeceras, filas: parejas };
      else donde.tabla = { columnas: cabeceras, filas: parejas };
      continue;
    }

    // "parrafos" y cualquier cosa que el modelo llame distinto: es texto.
    const parrafos = lista(bruto.parrafos);
    if (parrafos.length === 0) continue;
    actual().parrafos.push(...parrafos);
  }

  const identidad = [texto(lectura.codigo), texto(lectura.subtitulo)].filter(Boolean).join(" · ");
  const comoSeLlama = NOMBRE_DE_TIPO[tipo];

  return {
    titulo: texto(lectura.titulo) ?? "DOCUMENTO SIN TÍTULO",
    identificacion: {
      // El código del documento ocupa el lugar del número de oferta: es lo que lo
      // identifica, y así sale en el encabezado de todas las páginas sin tocar la plantilla.
      numeroOferta: texto(lectura.codigo),
      fecha: texto(lectura.fecha),
      validez: null,
      cliente: texto(lectura.cliente),
      atencion: null,
      copia: null,
      referencia: identidad === "" ? null : identidad,
      faena: null,
    },
    alcance: null,
    metodologia: null,
    especificaciones: null,
    organizacion: null,
    programa: null,
    precio: null,
    condicionesComerciales: null,
    aportes: null,
    cierre: null,
    anexo: null,
    porConfirmar: [...new Set(lista(lectura.porConfirmar))],
    omitidas: [],
    imagenesPorSeccion,
    epigrafesDeImagenes: epigrafes,
    bloques,
    // Los rótulos del maestro hablan de una oferta —"Oferta N°", "Identificación de la
    // oferta"— y en una ficha técnica eso es simplemente falso. Se pisan con los del tipo,
    // usando el mismo mecanismo que ya existe para renombrar cualquier rótulo, así que se
    // siguen pudiendo editar sobre el documento.
    rotulos: {
      "portada-rotulo": comoSeLlama,
      "s-identificacion": `Identificación del documento`,
      "id-numero": "Código",
      "id-referencia": "Detalle",
    },
    lectura: { tipo, confianza: "alta", porQue: "" },
  };
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
  const disposiciones = { ...(contenido.disposicionDeImagenes ?? {}) };
  delete disposiciones[indice];

  const cierre = contenido.cierre;
  return {
    ...contenido,
    imagenesPorSeccion: porSeccion,
    epigrafesDeImagenes: epigrafes,
    disposicionDeImagenes: disposiciones,
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
    // La disposición viaja con el reparto por el mismo motivo: la decide quien acomoda
    // las fotos sobre el documento y se guarda al instante, así que la copia del editor
    // puede ser anterior. Sin esta línea, guardar un párrafo devolvía todas las imágenes
    // a la grilla.
    disposicionDeImagenes: guardado.disposicionDeImagenes ?? {},
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
 * La imagen, un lugar más arriba o más abajo dentro de su sección.
 *
 * El orden del arreglo es el orden impreso, así que reordenar es mover un elemento. No
 * existía: `conLaImagenEn` solo sabe agregar al final, y el comentario de este archivo lo
 * decía —"reordenarlas dentro de la sección es otra cosa y todavía no existe"—. Con tres
 * fotos en el anexo la primera que se sube queda primera para siempre, y eso es
 * exactamente lo que hay que poder cambiar.
 *
 * En los bordes no hace nada: la primera no sube más y la última no baja más. Devolver el
 * contenido igual es mejor que darle la vuelta al arreglo.
 */
export function conLaImagenMovida(
  contenido: OfertaCanonica,
  indice: number,
  delta: number,
): OfertaCanonica {
  const porSeccion: Partial<Record<SeccionConImagenes, number[]>> = {};
  let movida = false;

  for (const [clave, indices] of Object.entries(contenido.imagenesPorSeccion ?? {})) {
    const lista = [...(indices ?? [])];
    const desde = lista.indexOf(indice);
    if (desde !== -1) {
      const hasta = desde + (delta < 0 ? -1 : 1);
      if (hasta >= 0 && hasta < lista.length) {
        [lista[desde], lista[hasta]] = [lista[hasta], lista[desde]];
        movida = true;
      }
    }
    if (lista.length > 0) porSeccion[clave as SeccionConImagenes] = lista;
  }

  return movida ? { ...contenido, imagenesPorSeccion: porSeccion } : contenido;
}

/** El contenido con otra disposición para esa imagen. `grilla` borra la elección. */
export function conLaDisposicion(
  contenido: OfertaCanonica,
  indice: number,
  disposicion: DisposicionDeImagen,
): OfertaCanonica {
  const disposiciones = { ...(contenido.disposicionDeImagenes ?? {}) };
  // Volver a la grilla borra la clave en vez de guardar "grilla": es el valor por
  // omisión, y así el dato solo tiene lo que de verdad se cambió.
  if (disposicion === "grilla") delete disposiciones[indice];
  else disposiciones[indice] = disposicion;
  return { ...contenido, disposicionDeImagenes: disposiciones };
}

/**
 * El contenido con una imagen puesta en su destino, o sacada de todos.
 *
 * Es lo que ocurre al arrastrar una foto sobre el documento. Sale primero de donde
 * estuviera: una imagen vive en UN lugar —si apareciera en dos, el documento la
 * dibujaría dos veces— así que mover es sacar y poner, no solo poner. Y "donde
 * estuviera" incluye ser la rúbrica de alguien: arrastrar la firma a una sección la
 * saca del cierre, y arrastrar una foto del anexo al cierre la saca del anexo.
 *
 * En una sección va al final, porque es donde se ve que llegó algo nuevo.
 * Reordenarlas dentro de la sección es otra cosa y todavía no existe.
 *
 * Como rúbrica reemplaza a la que tuviera ese firmante: una persona firma con una
 * sola. La anterior no se borra de la oferta, queda sin ubicar en el cajón.
 */
export function conLaImagenEn(
  contenido: OfertaCanonica,
  indice: number,
  destino: DestinoDeImagen | null,
): OfertaCanonica {
  const porSeccion: Partial<Record<SeccionConImagenes, number[]>> = {};
  for (const [clave, indices] of Object.entries(contenido.imagenesPorSeccion ?? {})) {
    const quedan = (indices ?? []).filter((n) => n !== indice);
    if (quedan.length > 0) porSeccion[clave as SeccionConImagenes] = quedan;
  }
  if (destino?.tipo === "seccion") {
    porSeccion[destino.seccion] = [...(porSeccion[destino.seccion] ?? []), indice];
  }

  const cierre = contenido.cierre;
  return {
    ...contenido,
    imagenesPorSeccion: porSeccion,
    cierre: cierre
      ? {
          ...cierre,
          firmantes: cierre.firmantes.map((f, i) => {
            if (destino?.tipo === "firma" && destino.firmante === i) {
              return { ...f, firmaImagen: indice };
            }
            // Se escribe null explícito —y no se deja el campo sin poner— porque
            // ausente significa "nunca se eligió" y cae a la firma del borrador
            // (ver firmaDe): sin esto, mover la firma del borrador a una sección la
            // dejaba dibujada igual en el cierre.
            return firmaDe(cierre, i) === indice ? { ...f, firmaImagen: null } : f;
          }),
          // Lo mismo por el otro lado: si la que el modelo leyó como firma se usó
          // para otra cosa, deja de ser la firma del borrador. Si no, alcanzaba con
          // agregar después un firmante en la primera posición —que nace sin campo,
          // y por lo tanto hereda esta— para que la imagen volviera a salir como
          // rúbrica estando además en una sección.
          firmaImagen:
            cierre.firmaImagen === indice && !(destino?.tipo === "firma" && destino.firmante === 0)
              ? null
              : cierre.firmaImagen,
        }
      : cierre,
  };
}

/**
 * El contenido de una oferta duplicada.
 *
 * Duplicar es la acción que faltaba, y no por comodidad: los controles de este
 * módulo —"sección heredada de otra oferta", "aporte de otro mandante", "número
 * mezclado"— existen porque la gente copia ofertas A MANO. Copiar de verdad ataca la
 * causa de la mitad de esos avisos.
 *
 * Lo que se copia es todo el contenido; lo que NO se copia son las tres cosas que
 * hacen peligroso un duplicado:
 *
 *  - El NÚMERO se borra. Dos ofertas con el mismo número es el peor resultado
 *    posible, y el control de "número mezclado" existe justamente porque pasó. En
 *    blanco, el aviso de "falta un dato" lo pide de entrada, que es correcto: es lo
 *    primero que hay que escribir.
 *  - La FECHA pasa a hoy. Una copia emitida con la fecha del mes pasado es un
 *    documento mal fechado que nadie revisa, porque el número sí se revisa.
 *  - La VALIDEZ se borra. Depende de la fecha nueva y arrastrarla dejaría una oferta
 *    que dice ser válida hasta una fecha ya pasada.
 *
 * El reparto de imágenes se conserva: el duplicado apunta a las mismas fotos por
 * número, y quien copia los archivos en el bucket mantiene esos números (ver
 * `duplicarImagenes`). Si no se conservara, cada duplicado empezaría con las fotos
 * sin ubicar y no serviría de nada.
 */
export function contenidoDuplicado(contenido: OfertaCanonica, hoy: Date): OfertaCanonica {
  return {
    ...contenido,
    identificacion: {
      ...contenido.identificacion,
      numeroOferta: null,
      fecha: fechaEnPalabras(hoy),
      validez: null,
    },
  };
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * "26 de agosto de 2026", que es como la escriben estas ofertas.
 *
 * A mano y no con toLocaleDateString: el formato de la oferta es el que ya está en
 * los documentos —el modelo lo transcribe así— y la fecha es un TEXTO del contenido,
 * no una fecha con formato. Meter acá "26 de agosto de 2026" o "26/08/2026" según el
 * entorno haría que dos duplicados se vean distintos.
 */
export function fechaEnPalabras(dia: Date): string {
  return `${dia.getDate()} de ${MESES[dia.getMonth()]} de ${dia.getFullYear()}`;
}
