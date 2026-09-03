import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extraerDeArchivo, extraerTextoDePdf, type ImagenExtraida } from "@/lib/cotizador/obra/extraer-texto";
import sharp from "sharp";
import { extraerImagenesDePdf } from "@/lib/cotizador/obra/extraer-imagenes-pdf";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import {
  NOMBRE_DE_TIPO,
  TIPOS_DE_DOCUMENTO,
  type LecturaDelTipo,
  type OfertaCanonica,
  type TipoDeDocumento,
} from "./tipos";
import { armarDocumentoLibre, type LecturaLibre } from "./normalizar";

/**
 * De un borrador en Word, Excel o PDF al documento que se imprime.
 *
 * Es el Paso 1 del flujo, y el reparto de trabajo es el que hace confiable todo
 * el módulo: **el modelo transcribe, el servidor calcula**. El modelo lee el
 * borrador y devuelve lo que está escrito, sin sumar ni completar. Las
 * verificaciones las pone ./verificar.ts.
 *
 * ── El documento manda la estructura; el maestro, solo la piel ─────────────
 *
 * Hubo una versión con un molde: una oferta se leía con el esquema de las diez
 * secciones del maestro de PERTEC, y el modelo tenía que acomodar el borrador ahí
 * —renombrando secciones con los rótulos del maestro y descartando en `omitidas`
 * lo que no calzara—. Dos borradores distintos salían iguales, y un documento que
 * no tenía la forma esperada perdía partes.
 *
 * Ahora hay UNA lectura para todo: se transcribe el documento tal como está y el
 * servidor le pone encima el formato de la casa (tipografías, colores, encabezado,
 * pie, numeración e índice). La consigna al modelo es exactamente esa —fiel y
 * prolijo, nada más— y está en INSTRUCCIONES_LIBRE.
 *
 * ── Lo que se perdió con el molde, y con qué se reemplazó ──────────────────
 *
 * Los tres cuadros que el servidor calculaba —dotación, turnos, líneas de precio—
 * existían solo dentro del molde: tenían columnas con nombre y tipo, así que se
 * podían sumar y comparar contra el total impreso. Una tabla transcrita no tiene
 * nada de eso. La red que reemplaza a esa es `revisarTablas` en ./verificar.ts:
 * si una tabla trae una fila de total y una columna de números, comprueba que la
 * suma dé, y lo dice en "Por revisar" sin tocar lo que se imprime.
 *
 * ── Por qué el esquema es plano y chico ────────────────────────────────────
 *
 * Un esquema de salida se compila a una gramática y la API la rechaza si se pasa
 * de grande. La estructura canónica completa —18 objetos anidados, 67
 * propiedades— no pasaba: "The compiled grammar is too large". Antes de eso hubo
 * dos rechazos más, uno por tipos unión (tope 16, había 35) y otro por
 * propiedades opcionales, que obligan a la gramática a admitir todas sus
 * combinaciones. De ahí que ESQUEMA_LIBRE sea un solo tipo de objeto con un campo
 * "tipo" que hace de discriminador, y no una unión de bloques.
 */

/**
 * Cuántos caracteres de texto por página hacen que un PDF valga la pena leer.
 *
 * Una página de oferta con datos tiene más de mil. Una escaneada —que es una
 * foto— devuelve casi cero, y ahí no hay nada que leer: hay que mirarla, así que
 * ese PDF sí va como documento aunque cueste diez veces más.
 */
const MINIMO_TEXTO_POR_PAGINA = 150;

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel → Settings → Environment Variables para habilitar la lectura de borradores.",
    );
  }
  return new Anthropic();
}

/**
 * TODO obligatorio, de un solo tipo y sin anidar más de lo necesario.
 *
 * Nada de nullables ni de opcionales: los dos hacen explotar la gramática. "El
 * documento no lo trae" se dice con un valor vacío —texto en blanco, número en 0,
 * lista vacía— y ./normalizar.ts lo traduce.
 */
const objeto = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const listaDeTexto = { type: "array", items: { type: "string" } } as const;

/**
 * ¿Qué es este documento?
 *
 * Antes de leer hay que saber CON QUÉ ESQUEMA leer. El módulo asumía que todo borrador es
 * una oferta técnica, y con una ficha técnica el resultado era un documento mutilado
 * —sin precio ni dotación, porque no los tiene— más dos avisos falsos.
 *
 * Es una llamada corta y aparte, no un campo más en las otras dos, porque decide CUÁL de
 * las lecturas correr. Y sale barata: va con el mismo bloque de contenido, que ya está
 * marcado como cacheable, así que el borrador entero no se vuelve a pagar.
 *
 * `enum` no se usa —igual que en `ubicacionImagenes.seccion`— porque los tipos unión tienen
 * tope de 16 en la gramática: la lista va en la descripción y el servidor valida.
 */
const ESQUEMA_TIPO = objeto({
  tipo: {
    type: "string",
    description:
      "Qué es este documento, una de: oferta (una oferta o propuesta técnica y económica, " +
      "con alcance del servicio y precio), ficha_tecnica (las características de un equipo, " +
      "un producto o un material: parámetros, medidas, condiciones de uso), procedimiento " +
      "(cómo se ejecuta un trabajo, paso por paso, con sus resguardos), informe (el reporte " +
      "de algo que YA pasó: una inspección, un avance, un incidente), otro (cualquier otra cosa).",
  },
  confianza: {
    type: "string",
    description: 'Qué tan claro está: "alta", "media" o "baja".',
  },
  porQue: {
    type: "string",
    description:
      "En una línea, qué del documento lo delata: el título, una sección, una tabla. Se le " +
      "muestra a la persona que revisa, así que tiene que decir algo verificable mirando el " +
      'archivo — no "parece una ficha técnica".',
  },
});

/**
 * El documento tal como está, sin estructura canónica.
 *
 * Un solo tipo de objeto por bloque con un campo discriminador, y no cinco tipos distintos,
 * porque la gramática no admite uniones grandes ni propiedades opcionales (ver arriba). Lo
 * que no aplica va vacío: texto en blanco, listas vacías, imagen en 0.
 *
 * EL ORDEN DEL ARREGLO ES EL ORDEN DEL DOCUMENTO, y eso es lo que hace que las imágenes
 * queden donde estaban: un bloque de imagen entre dos de texto conserva la posición que la
 * lectura de oferta descarta (ahí solo se guarda la sección).
 */
const ESQUEMA_LIBRE = objeto({
  titulo: { type: "string", description: "El título del documento, tal como lo titula." },
  subtitulo: {
    type: "string",
    description: "El subtítulo o la línea de identificación bajo el título, si la trae. En blanco si no.",
  },
  cliente: { type: "string", description: "A quién va dirigido, si el documento lo dice. En blanco si no." },
  fecha: { type: "string", description: "La fecha del documento, tal como está escrita. En blanco si no." },
  codigo: {
    type: "string",
    description:
      "El código o número del documento, si lo trae: un código de ficha, de procedimiento o de " +
      "informe. En blanco si no.",
  },
  bloques: {
    type: "array",
    description: "El documento entero, en orden, bloque por bloque.",
    items: objeto({
      tipo: {
        type: "string",
        description:
          'Qué es este bloque, uno de: "titulo" (un título de sección del documento), ' +
          '"subtitulo" (un título de segundo nivel), "parrafos" (uno o varios párrafos o una ' +
          'lista de ítems), "tabla" (una tabla con sus columnas y sus filas), "imagen" (una de ' +
          "las imágenes del borrador, en el lugar donde estaba).",
      },
      texto: {
        type: "string",
        description: 'El título, cuando el tipo es "titulo" o "subtitulo". En blanco en los demás.',
      },
      parrafos: {
        ...listaDeTexto,
        description:
          'Los párrafos o los ítems, uno por elemento, cuando el tipo es "parrafos". Sin numerarlos: ' +
          "la numeración la pone el sistema. Lista vacía en los demás.",
      },
      columnas: {
        ...listaDeTexto,
        description:
          'Los encabezados de la tabla, cuando el tipo es "tabla". Si la tabla no tiene encabezados, ' +
          "lista vacía.",
      },
      filas: {
        type: "array",
        description:
          'Las filas de la tabla, cuando el tipo es "tabla": una lista por fila, con una celda por ' +
          "columna y en el mismo orden. Lista vacía en los demás.",
        items: listaDeTexto,
      },
      imagen: {
        type: "number",
        description: 'El número del marcador [IMAGEN n], cuando el tipo es "imagen". 0 en los demás.',
      },
      epigrafe: {
        type: "string",
        description:
          "El pie de la imagen, si el documento lo trae escrito. Sin numerarlo. En blanco si no hay.",
      },
    }),
  },
  porConfirmar: {
    ...listaDeTexto,
    description: "Datos ausentes o ambiguos, nombrados. Nunca adivinados.",
  },
});

/** Lo común a las dos lecturas: quién es PERTEC y la regla que las gobierna. */
const PREAMBULO = `Normalizás documentos de Performance Technologies SpA (PERTEC), que presta servicios
de vulcanización y cambio de correas transportadoras en faenas mineras y plantas.

Tu tarea NO es diseñar ni redactar de nuevo: es extraer el contenido del borrador para que el servidor
lo maquete y lo verifique después.

REGLA PRINCIPAL: transcribís, no calculás.

TODAS las claves del esquema van siempre. Lo que el borrador no trae se dice con un valor vacío —texto
en blanco, número en 0, lista vacía— y se nombra en "porConfirmar". Nunca lo adivines ni pongas un
guion o un "N/A" como si fuera el dato.

QUÉ VA EN "porConfirmar". Solo lo que una PERSONA tiene que decidir o corregir antes de emitir: un
precio en blanco, un monto en 0 que parece pendiente, una fecha o un nombre ambiguos, dos partes del
documento que dicen cosas distintas. NO describas la forma del documento —"no trae cuadro de
responsabilidades", "no hay tabla de turnos"—: una sección que no está, el sistema simplemente no la
imprime, y llenar la lista con eso hace que nadie la lea.`;

const INSTRUCCIONES_TIPO = `${PREAMBULO}

Tu única tarea acá es DECIR QUÉ ES este documento, para que el sistema lo lea con el esquema que
corresponde. No transcribas nada.

- Miralo completo antes de decidir. El título manda, pero una "oferta" sin precio ni alcance del
  servicio probablemente no sea una oferta, y una tabla de parámetros y medidas es una ficha técnica
  aunque el archivo se llame "propuesta".
- Una OFERTA tiene lo que se va a hacer y cuánto cuesta: alcance del servicio, dotación, plazos,
  precio. Es el caso más común acá.
- Una FICHA TÉCNICA describe una cosa —un equipo, un material, un repuesto— con sus parámetros.
- Un PROCEDIMIENTO dice cómo se ejecuta un trabajo, paso por paso, con sus resguardos.
- Un INFORME reporta algo que ya pasó: una inspección, un avance, un incidente.
- Si dudás entre dos, elegí el que explique MÁS del documento y decilo en "confianza": con "baja",
  la persona que revisa lo ve y lo puede cambiar. Preferí "otro" antes que forzar un tipo.`;

const INSTRUCCIONES_LIBRE = `${PREAMBULO}

NO HAY UNA ESTRUCTURA QUE LLENAR. La estructura la pone el documento; el sistema solo le agrega encima
el formato de la casa: tipografías, colores, encabezado, pie, numeración e índice. Vale para cualquier
documento —una oferta técnica, una ficha, un procedimiento, un informe—: se transcribe TAL COMO ESTÁ.

TU TRABAJO ES UNO SOLO: que la transcripción sea FIEL y quede PROLIJA. Nada más que eso.

- RESPETÁ EL ORDEN Y LA JERARQUÍA del original. El arreglo de bloques se imprime en ese orden, así que
  un bloque fuera de lugar sale fuera de lugar.
- NO REORGANICES. No hay secciones que el documento "debería" tener: ni alcance, ni precio, ni
  dotación, ni cierre. Las que trae salen como vienen y con el nombre que les puso su autor; las que no
  trae, no existen. No resumas, no juntes dos títulos en uno, no muevas un párrafo para que "quede
  mejor ordenado" y no agregues una sección que falte.
- QUE QUEDE PROLIJO es la otra mitad, y significa esto y nada más: cada título con su contenido abajo,
  los párrafos completos y separados de verdad, las listas como listas y las tablas como tablas. Un
  párrafo que el original cortó en tres pedazos por un salto de página va como UN párrafo. Un título
  suelto al final de una página va con el texto que le sigue.
- Podés corregir ortografía y redacción de los párrafos, sin cambiar el significado técnico. En
  nombres propios, códigos, medidas y cifras, no se toca nada.
- LAS LISTAS van con un elemento por ítem, sin numerarlos ni ponerles viñeta: la numeración la pone el
  sistema.
- LAS TABLAS van como tabla: los encabezados en "columnas" y una lista por fila en "filas", con una
  celda por columna y en el mismo orden. Si una celda del documento está vacía, va un texto en blanco
  —no corras los datos de columna para llenarla—. Todo como texto, incluidos los números: acá el
  sistema no calcula nada.
- LAS IMÁGENES son un bloque más, EN EL LUGAR DONDE ESTABAN. El texto trae marcadores "[IMAGEN 1]",
  "[IMAGEN 2]"… Cada marcador es un bloque de tipo "imagen" con ese número, puesto entre los bloques de
  texto que lo rodean: es lo que hace que el diagrama salga junto al párrafo que lo explica y no al
  final. Si el borrador trae un pie escrito al lado, transcribilo en "epigrafe".
    · El LOGO o el membrete de la empresa NO son un bloque: el sistema pone el logo por su cuenta.
      Omitilos. Se reconocen por ser anchos y bajos (proporción mayor a 2.5:1), por repetirse, o por
      estar en la primera página antes del título.
    · ANTE LA DUDA, LA IMAGEN VA. Omitirla deja el documento sin ella; ponerla donde no corresponde se
      arregla arrastrándola, y la persona que revisa ve todas las imágenes con su miniatura.
- El TÍTULO del documento va en "titulo", no como primer bloque: el sistema lo imprime en la portada.
- NO SUMES NI RECALCULES NADA. Las cifras van transcritas tal cual, con los mismos dígitos. Si dos no
  cuadran, va en "porConfirmar" — no se arregla acá. La aritmética la revisa el servidor.`;

/**
 * Una de las dos lecturas. Misma mecánica, distinto esquema y distinta consigna.
 *
 * El tope de salida hay que pensarlo contando el pensamiento extendido: cuenta
 * contra `max_tokens` igual que el JSON. Con una oferta larga —dos listas de
 * aportes de veinte ítems, especificaciones sacadas de la prosa— los 12.000 que
 * había se agotaban pensando y la respuesta salía cortada a la mitad, sin JSON
 * válido. Tampoco conviene poner un número enorme: a la velocidad de salida del
 * modelo, 30.000 tokens no entran en el tiempo de la función.
 */
/**
 * El inventario de imágenes, para que el modelo pueda distinguirlas.
 *
 * El marcador solo dice DÓNDE estaba una imagen. Sin las medidas, decidir si es
 * una foto, un diagrama o un logo es adivinar — y pasó: el modelo omitió una
 * imagen de 1162×667 px "por no poder determinar con certeza" qué era, y el anexo
 * salió vacío. Las proporciones lo resuelven casi solas: un membrete es ancho y
 * bajo, una foto de faena es grande y de proporción de cámara.
 */
async function inventarioDeImagenes(imagenes: ImagenExtraida[]): Promise<string> {
  if (imagenes.length === 0) return "";

  const lineas = await Promise.all(
    imagenes.map(async (imagen) => {
      let medidas = "medidas desconocidas";
      try {
        const info = await sharp(imagen.contenido).metadata();
        if (info.width && info.height) {
          medidas = `${info.width}×${info.height} px (proporción ${(info.width / info.height).toFixed(2)}:1)`;
        }
      } catch {
        // Una imagen que sharp no abre igual va listada: el modelo la ubica por su
        // posición y el servidor la descarta al guardar.
      }
      const donde = imagen.pagina ? `, página ${imagen.pagina}` : "";
      return `[IMAGEN ${imagen.indice}]: ${medidas}${donde}`;
    }),
  );

  return `\n\nLAS IMÁGENES QUE TRAE EL BORRADOR:\n${lineas.join("\n")}\n`;
}

async function leerParte<T>(
  contenido: Anthropic.ContentBlockParam[],
  instrucciones: string,
  esquema: Record<string, unknown>,
  pedido: string,
  maxTokens: number,
  nombreArchivo: string,
  // "high" para transcribir, que es donde se equivoca caro. La clasificación es una
  // decisión de una línea y con "medium" contesta en un cuarto del tiempo.
  effort: "medium" | "high" = "high",
): Promise<T> {
  // Streaming: el SDK se niega a hacer sin streaming una llamada cuya duración
  // posible pase de 10 minutos, y además una conexión que espera callada varios
  // minutos es justo la que corta un intermediario. finalMessage() rearma la
  // respuesta completa, así que no hay que atender evento por evento.
  const respuesta = await cliente()
    .messages.stream({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: instrucciones, cache_control: { type: "ephemeral" } }],
      output_config: { effort, format: { type: "json_schema", schema: esquema } },
      messages: [{ role: "user", content: [...contenido, { type: "text", text: pedido }] }],
    })
    .finalMessage();

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El modelo no pudo procesar "${nombreArchivo}".`);
  }
  if (respuesta.stop_reason === "max_tokens") {
    // El mensaje anterior decía "se agotó el presupuesto de tokens", que se lee
    // como que la cuenta se quedó sin saldo. No es eso: es el tope de largo de
    // ESTA respuesta, que está unas líneas más arriba en este archivo.
    throw new Error(
      `La lectura de "${nombreArchivo}" quedó incompleta: la respuesta llegó a su tope de largo. ` +
        "No tiene que ver con el saldo de la cuenta. Si tenés el borrador en Word, subí el .docx en " +
        "vez del PDF: se lee como texto y ocupa una fracción.",
    );
  }

  const salida = respuesta.content.find((b) => b.type === "text");
  if (!salida || salida.type !== "text") {
    throw new Error(`La lectura de "${nombreArchivo}" no devolvió datos.`);
  }
  return JSON.parse(salida.text) as T;
}

/**
 * Lo que sale de leer un borrador: la oferta y las imágenes que traía.
 *
 * Las imágenes vienen aparte del contenido porque son cosas distintas: el
 * contenido dice qué imagen va dónde (por número) y esta lista trae los bytes,
 * que el servidor guarda y el contenido nunca ve.
 */
export interface BorradorLeido {
  contenido: OfertaCanonica;
  imagenes: ImagenExtraida[];
  /** Con qué esquema se leyó. Manda: decide qué controles corren. */
  tipo: TipoDeDocumento;
}

/** El tipo que dijo el modelo, saneado contra la lista real. */
function tipoLeido(bruto: unknown): LecturaDelTipo {
  const crudo = bruto as { tipo?: unknown; confianza?: unknown; porQue?: unknown } | null;
  const dicho = typeof crudo?.tipo === "string" ? crudo.tipo.trim().toLowerCase() : "";
  // "oferta_tecnica" es como se le pide al modelo (es más claro en el prompt) y "oferta" es
  // como se guarda: son la misma cosa.
  const normalizado = dicho === "oferta_tecnica" ? "oferta" : dicho;
  const tipo = TIPOS_DE_DOCUMENTO.find((t) => t === normalizado);
  const confianza =
    crudo?.confianza === "baja" || crudo?.confianza === "media"
      ? (crudo.confianza as "baja" | "media")
      : "alta";

  return {
    // Un tipo que no está en la lista se trata como "otro" y NO como oferta: forzar el
    // esquema de oferta sobre algo que no lo es es justo el error que esto viene a arreglar.
    tipo: tipo ?? "otro",
    // Si no se reconoció lo que dijo, la confianza no puede ser alta.
    confianza: tipo ? confianza : "baja",
    porQue: typeof crudo?.porQue === "string" ? crudo.porQue.trim() : "",
  };
}

export async function leerBorrador(
  archivo: Buffer,
  mimeType: string,
  nombreArchivo: string,
): Promise<BorradorLeido> {
  const formato = formatoDe(mimeType, nombreArchivo);
  if (!formato) {
    throw new Error(
      `"${nombreArchivo}" no es un formato que se pueda leer. Se aceptan Word (.docx), ` +
        "PDF y Excel (.xlsx, .xlsm).",
    );
  }

  // Un PDF se lee como TEXTO, no como documento. Mandarlo como documento hace que
  // la API procese una imagen por página —el 85% de los tokens en páginas sin un
  // solo dato: portada, índice, anexo de fotos— y esa entrada enorme era la que
  // dejaba al modelo sin techo de salida, con la lectura cortada a la mitad. La
  // misma oferta como texto son ~1.500 tokens en vez de ~20.000.
  //
  // Con una excepción: un PDF escaneado no tiene texto que extraer. Ahí sí va como
  // documento, porque hay que mirarlo.
  //
  // Word y Excel nunca fueron documento: la API no los acepta como tal, y no
  // tienen páginas que rasterizar.
  let contenido: Anthropic.ContentBlockParam[];
  // Un PDF no entrega sus imágenes: pdf-parse extrae texto, no ilustraciones. Las
  // fotos de un borrador se recuperan del .docx, que es donde de verdad están.
  let imagenes: ImagenExtraida[] = [];

  if (formato === "pdf") {
    const { texto, paginas, porPagina } = await extraerTextoDePdf(archivo);
    const porPaginaTexto = texto.length / Math.max(1, paginas);

    if (porPaginaTexto >= MINIMO_TEXTO_POR_PAGINA) {
      // Las imágenes de un PDF se sacan del archivo y no del texto, así que de
      // ellas se sabe la PÁGINA y no el punto del párrafo. El marcador va al final
      // del texto de su página, que ubica bien lo que hay que ubicar: las fotos
      // del anexo están en las páginas del anexo y el membrete en la primera.
      imagenes = await extraerImagenesDePdf(archivo);

      const conMarcadores = porPagina
        .map((textoDePagina, i) => {
          const marcadores = imagenes
            .filter((imagen) => imagen.pagina === i + 1)
            .map((imagen) => `[IMAGEN ${imagen.indice}]`)
            .join(" ");
          return `── Página ${i + 1} ──\n${textoDePagina}${marcadores ? `\n${marcadores}` : ""}`;
        })
        .join("\n\n");

      contenido = [
        {
          type: "text",
          text:
            `Contenido del borrador, extraído de un PDF de ${paginas} página(s). DOS COSAS:\n` +
            `1) En un PDF el texto sale sin la disposición de la página, así que las columnas de una ` +
            `tabla vienen pegadas en la cabecera —por ejemplo "ÍTCANTCARGOUNV. UNITV. TOTAL"— y los ` +
            `valores de cada fila siguen en ESE mismo orden. Es una tabla, leela como tabla.\n` +
            (imagenes.length
              ? `2) El PDF trae ${imagenes.length} imagen(es). Cada marcador [IMAGEN n] está al final ` +
                `del texto de la página donde se dibuja esa imagen — no en el punto exacto del ` +
                `párrafo, que en un PDF no se puede saber.\n`
              : "2) El PDF no trae imágenes.\n") +
            (await inventarioDeImagenes(imagenes)) +
            `\n${conMarcadores}`,
          cache_control: { type: "ephemeral" },
        },
      ];
    } else {
      contenido = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: archivo.toString("base64") },
          cache_control: { type: "ephemeral" },
        },
      ];
    }
  } else {
    const leido = await extraerDeArchivo(archivo, formato, nombreArchivo);
    imagenes = leido.imagenes;
    contenido = [
      {
        type: "text",
        text:
          `Contenido del borrador, extraído de un ${
            formato === "excel" ? "archivo de Excel" : "documento de Word"
          }` +
          (imagenes.length
            ? `. Trae ${imagenes.length} imagen(es), marcadas como [IMAGEN n] en el lugar exacto ` +
              `donde estaban`
            : "") +
          `:` +
          (await inventarioDeImagenes(imagenes)) +
          `\n\n${leido.texto}`,
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  // PRIMERO QUÉ ES, después cómo se lee. Es una llamada más, pero es la que evita el
  // error caro: leer una ficha técnica con el esquema de una oferta produce un documento
  // mutilado y dos avisos falsos. Sale barata porque el bloque del borrador ya viene
  // marcado como cacheable y las lecturas de abajo lo reusan.
  const lectura = tipoLeido(
    await leerParte<unknown>(
      contenido,
      INSTRUCCIONES_TIPO,
      ESQUEMA_TIPO,
      `¿Qué es este documento? (archivo: ${nombreArchivo})`,
      2000,
      nombreArchivo,
      "medium",
    ),
  );

  // UNA SOLA LECTURA, y respeta la estructura del ORIGINAL. Cualquier documento, oferta
  // incluida.
  //
  // Antes había dos caminos. Una oferta se leía con el esquema de las diez secciones del
  // maestro de PERTEC: el modelo tenía que meter el borrador en ese molde, renombrar sus
  // secciones con los rótulos del maestro y descartar en `omitidas` lo que no calzara. El
  // resultado era que dos borradores distintos salían iguales, y que un documento perdía
  // partes por no tener la forma esperada.
  //
  // Ahora el maestro es PIEL y no molde: tipografías, colores, encabezado, pie, numeración
  // e índice. La estructura la pone el documento.
  //
  // Con eso se van los cuadros que el servidor calculaba —precio, dotación, turnos— porque
  // solo existían dentro del molde. Lo que reemplaza esa red es `revisarTablas` en
  // verificar.ts: revisa la aritmética de las tablas transcritas y avisa en "Por revisar"
  // sin tocar lo que se imprime.
  //
  // El tipo se sigue leyendo: decide los rótulos de la portada, la pastilla del listado y
  // qué controles corren.
  const libre = await leerParte<LecturaLibre>(
    contenido,
    INSTRUCCIONES_LIBRE,
    ESQUEMA_LIBRE,
    `Transcribí este documento tal como está (archivo: ${nombreArchivo}).`,
    20000,
    nombreArchivo,
  );
  const armado = armarDocumentoLibre(libre, lectura.tipo);
  return {
    contenido: {
      ...armado,
      lectura,
      // Con la clasificación dudosa, el aviso va a "Por revisar": es una decisión que
      // tomó el sistema sobre la forma del documento entero, y tiene que poder
      // corregirse antes de emitir.
      porConfirmar:
        lectura.confianza === "alta"
          ? armado.porConfirmar
          : [
              `Se leyó como ${NOMBRE_DE_TIPO[lectura.tipo].toLowerCase()} con confianza ` +
                `${lectura.confianza}${lectura.porQue ? `: ${lectura.porQue}` : ""}. Si es otra cosa, ` +
                "cambiá el tipo del documento.",
              ...armado.porConfirmar,
            ],
    },
    imagenes,
    tipo: lectura.tipo,
  };
}