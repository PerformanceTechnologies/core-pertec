import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { extraerTexto } from "@/lib/cotizador/obra/extraer-texto";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import { sanearEstilo, type EstiloMaestro } from "./estilo";

/**
 * Lee el ESTILO de un maestro subido.
 *
 * Lo que se le pide al modelo acá es distinto de todo lo demás del módulo: no
 * transcribe contenido, describe una apariencia. Y por eso el archivo se le manda
 * como PDF —imagen de cada página incluida— aunque cueste más tokens: los colores
 * y las proporciones se VEN, no se leen. Un .docx convertido a texto no tiene
 * color.
 *
 * Lo que devuelve pasa por `sanearEstilo` antes de tocar nada: un hex tiene que
 * ser un hex y un tamaño tiene que estar en rango. Cualquier valor que no pase cae
 * al del maestro de PERTEC y queda anotado, porque este es el único punto del
 * módulo donde la salida del modelo llega al CSS de un documento que se manda a un
 * cliente.
 *
 * Y se lee UNA vez: los tokens quedan guardados y son editables a mano. El formato
 * de una oferta no depende nunca de volver a interpretar el archivo.
 */

/**
 * Cuántas páginas del maestro se miran.
 *
 * Leer el estilo no es leer el documento: la paleta, las tipografías y las
 * proporciones están en la portada y en la primera página con tablas. Un maestro
 * de once páginas manda once imágenes a la API —cada página del PDF se rasteriza—
 * y eso es lo que hacía que la lectura pasara del tiempo permitido y la función se
 * cortara. Con cuatro páginas se ve todo lo que hay que ver y el trabajo baja casi
 * tres veces.
 */
const PAGINAS_QUE_SE_MIRAN = 4;

/**
 * Las primeras páginas del PDF, como PDF.
 *
 * Si algo falla —un PDF cifrado, uno que pdf-lib no puede abrir— devuelve el
 * original: recortar es una optimización, no un requisito, y no tiene por qué
 * impedir la lectura.
 */
async function recortarPdf(archivo: Buffer): Promise<{ pdf: Buffer; paginas: number | null }> {
  try {
    const original = await PDFDocument.load(archivo);
    const total = original.getPageCount();
    if (total <= PAGINAS_QUE_SE_MIRAN) return { pdf: archivo, paginas: total };

    const recorte = await PDFDocument.create();
    const paginas = await recorte.copyPages(
      original,
      Array.from({ length: PAGINAS_QUE_SE_MIRAN }, (_, i) => i),
    );
    for (const pagina of paginas) recorte.addPage(pagina);
    return { pdf: Buffer.from(await recorte.save()), paginas: total };
  } catch (error) {
    console.warn("[ofertas] no se pudo recortar el maestro, va completo:", error);
    return { pdf: archivo, paginas: null };
  }
}

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel → Settings → Environment Variables para poder leer un maestro.",
    );
  }
  return new Anthropic();
}

/**
 * Los campos van sin `null` y sin ser obligatorios, y eso NO es un detalle de
 * estilo: la API rechaza un esquema con más de 16 parámetros de tipo unión —
 * "Schemas contains too many parameters with union types" — y este esquema tenía
 * 18, uno por cada token. Marcarlos nullable era además redundante: para el saneo,
 * un campo ausente y un campo en null significan lo mismo, "no lo distingo".
 */
const color = (que: string) => ({
  type: "string",
  description: `${que} Como hex de 6 dígitos, por ejemplo "#1f1b16". Omitilo si no se distingue.`,
});

const medida = (que: string, min: number, max: number) => ({
  type: "number",
  description: `${que} Entre ${min} y ${max}. Omitilo si no se puede estimar.`,
});

const ESQUEMA = {
  type: "object",
  properties: {
    nombreSugerido: {
      type: "string",
      description: "Un nombre corto para este maestro, del estilo 'PERTEC — Ofertas técnicas'.",
    },
    fuenteCuerpo: {
      type: "string",
      description:
        "Familia tipográfica del texto de cuerpo. Solo el nombre, o el más parecido que reconozcas " +
        "(Helvetica, Arial, Georgia, Times New Roman, Garamond). Omitilo si no la distinguís.",
    },
    fuenteTitulos: { type: "string", description: "Ídem para los títulos de sección." },
    tamanoCuerpo: medida("Tamaño del texto de cuerpo en px.", 7, 14),
    tamanoTitulo: medida("Tamaño de los títulos de sección en px.", 10, 26),
    tamanoPortada: medida("Tamaño del título de la portada en px.", 16, 44),
    colorTinta: color("Color del texto principal."),
    colorAcento: color("Color de acento: los numerales de sección, las barras, los bordes de color."),
    colorAcentoAlterno: color("El segundo color de acento, si hay dos alternándose."),
    colorSuave: color("Color del texto secundario y de los rótulos."),
    colorCabecera: color("Fondo de las cabeceras de tabla."),
    colorCabeceraTexto: color("Color del texto sobre la cabecera de tabla."),
    colorFondoSuave: color("Fondo de las filas alternadas de las tablas."),
    colorFondoTotal: color("Fondo de las filas de total."),
    colorBorde: color("Color de los bordes y líneas finas."),
    altoHeader: medida("Alto del recuadro de encabezado, en mm.", 10, 30),
    anchoCeldaLateral: medida("Ancho de las celdas laterales del encabezado, en mm.", 18, 50),
    margenLateral: medida("Margen izquierdo y derecho de la página, en mm.", 8, 30),
    rotuloLogoCliente: {
      type: "string",
      description: "El texto de la celda reservada al logo del cliente, si la hay.",
    },
    noDistinguidos: {
      type: "array",
      description: "Qué no se pudo determinar del archivo. Nunca inventar un valor para completar.",
      items: { type: "string" },
    },
  },
  // Los únicos obligatorios. Todo token ausente es un token que el modelo no
  // distinguió, y el saneo lo completa con el maestro de PERTEC.
  required: ["nombreSugerido", "noDistinguidos"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Describís la APARIENCIA de un documento maestro de ofertas técnicas para cargarla
en un sistema que después maqueta ofertas nuevas con ese mismo aspecto.

No transcribas el contenido: no importa qué dice la oferta del ejemplo, importa cómo se ve.

Lo que se te pide es un conjunto cerrado de valores: colores, tipografías, tamaños y tres medidas. La
ESTRUCTURA del documento no la describas —las secciones, las tablas y las listas ya están definidas en
el sistema—; solo la piel.

REGLAS
- Los colores van como hex de 6 dígitos. Si dudás entre dos tonos, elegí el que veas en más lugares.
- No inventes. Todo lo que no puedas determinar se OMITE del resultado y va nombrado en
  "noDistinguidos" — no lo pongas en cero ni en blanco, omitilo. El sistema
  completa esos con los valores de su maestro por defecto, que es un resultado correcto; un color
  inventado, en cambio, sale impreso en un documento que se manda a un cliente.
- Las medidas en mm son estimaciones sobre una hoja A4 (210 mm de ancho): el margen lateral es la
  distancia del borde de la hoja al texto, y el alto del encabezado es la altura del recuadro de arriba.
- Distinguí el color de acento del color del texto. El acento es el que aparece en pocos lugares y
  llama la atención —numerales de sección, una barra, un borde de color—, no el del cuerpo del texto.`;

export interface MaestroLeido {
  nombreSugerido: string;
  estilo: EstiloMaestro;
  /** Los que el saneo rechazó, con el motivo. */
  descartados: string[];
  /** Los que el modelo dijo no distinguir. */
  noDistinguidos: string[];
}

export async function leerMaestro(
  archivo: Buffer,
  mimeType: string,
  nombreArchivo: string,
): Promise<MaestroLeido> {
  const formato = formatoDe(mimeType, nombreArchivo);
  if (!formato) {
    throw new Error(
      `"${nombreArchivo}" no es un formato que se pueda leer. Para un maestro conviene un PDF: ` +
        "los colores y las proporciones se ven, no se leen.",
    );
  }

  // Cuántas páginas tenía el original, para poder decirlo después: solo se miran
  // las primeras, y un detalle que está más adelante no va a quedar recogido.
  let paginasDelPdf: number | null = null;
  let contenido: Anthropic.ContentBlockParam[];

  if (formato === "pdf") {
    const recortado = await recortarPdf(archivo);
    paginasDelPdf = recortado.paginas;
    contenido = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: recortado.pdf.toString("base64"),
        },
      },
    ];
  } else {
    contenido = [
      {
        type: "text",
        text:
          `Contenido del maestro, extraído como texto. OJO: al ser texto no hay colores ni ` +
          `proporciones, así que casi todo va a quedar en "noDistinguidos" — es lo correcto.\n\n` +
          (await extraerTexto(archivo, formato, nombreArchivo)),
      },
    ];
  }

  // Describir una apariencia no es razonar sobre un problema: son veinte valores
  // que se ven. Sin pensamiento extendido, con esfuerzo medio y con un techo de
  // salida acorde a lo que se pide, porque lo que estaba cortando la operación era
  // el tiempo, no la calidad — y estos tokens quedan editables a mano igual.
  const respuesta = await cliente().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
    messages: [
      {
        role: "user",
        content: [
          ...contenido,
          { type: "text", text: `Describí la apariencia de este maestro (archivo: ${nombreArchivo}).` },
        ],
      },
    ],
  });

  if (respuesta.stop_reason === "refusal" || respuesta.stop_reason === "max_tokens") {
    throw new Error(
      `No se pudo leer el estilo de "${nombreArchivo}". Podés crear el maestro y cargar los ` +
        "colores a mano.",
    );
  }

  const salida = respuesta.content.find((b) => b.type === "text");
  if (!salida || salida.type !== "text") {
    throw new Error(`La lectura de "${nombreArchivo}" no devolvió datos.`);
  }

  const leido = JSON.parse(salida.text) as Record<string, unknown> & {
    nombreSugerido?: string;
    noDistinguidos?: string[];
  };
  const { estilo, descartados } = sanearEstilo(leido);

  const noDistinguidos = Array.isArray(leido.noDistinguidos) ? leido.noDistinguidos : [];
  if (paginasDelPdf && paginasDelPdf > PAGINAS_QUE_SE_MIRAN) {
    // Se dice, porque explica por qué un detalle que está en la página 9 del
    // maestro no quedó recogido.
    noDistinguidos.push(
      `Se miraron las primeras ${PAGINAS_QUE_SE_MIRAN} páginas de ${paginasDelPdf}: ` +
        "el estilo se ve ahí y mirarlas todas hacía que la lectura se cortara por tiempo.",
    );
  }

  return {
    nombreSugerido: String(leido.nombreSugerido ?? nombreArchivo).slice(0, 90),
    estilo,
    descartados,
    noDistinguidos,
  };
}
