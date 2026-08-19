import "server-only";
import Anthropic from "@anthropic-ai/sdk";
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

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel → Settings → Environment Variables para poder leer un maestro.",
    );
  }
  return new Anthropic();
}

const color = (que: string) => ({
  type: ["string", "null"],
  description: `${que} Como hex de 6 dígitos, por ejemplo "#1f1b16". null si no se distingue.`,
});

const medida = (que: string, min: number, max: number) => ({
  type: ["number", "null"],
  description: `${que} Entre ${min} y ${max}. null si no se puede estimar.`,
});

const ESQUEMA = {
  type: "object",
  properties: {
    nombreSugerido: {
      type: "string",
      description: "Un nombre corto para este maestro, del estilo 'PERTEC — Ofertas técnicas'.",
    },
    fuenteCuerpo: {
      type: ["string", "null"],
      description:
        "Familia tipográfica del texto de cuerpo. Solo el nombre, o el más parecido que reconozcas " +
        "(Helvetica, Arial, Georgia, Times New Roman, Garamond). null si no la distingues.",
    },
    fuenteTitulos: { type: ["string", "null"], description: "Ídem para los títulos de sección." },
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
      type: ["string", "null"],
      description: "El texto de la celda reservada al logo del cliente, si la hay.",
    },
    noDistinguidos: {
      type: "array",
      description: "Qué no se pudo determinar del archivo. Nunca inventar un valor para completar.",
      items: { type: "string" },
    },
  },
  required: [
    "nombreSugerido",
    "fuenteCuerpo",
    "fuenteTitulos",
    "tamanoCuerpo",
    "tamanoTitulo",
    "tamanoPortada",
    "colorTinta",
    "colorAcento",
    "colorAcentoAlterno",
    "colorSuave",
    "colorCabecera",
    "colorCabeceraTexto",
    "colorFondoSuave",
    "colorFondoTotal",
    "colorBorde",
    "altoHeader",
    "anchoCeldaLateral",
    "margenLateral",
    "rotuloLogoCliente",
    "noDistinguidos",
  ],
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
- No inventes. Todo lo que no puedas determinar va en null y nombrado en "noDistinguidos". El sistema
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

  const contenido: Anthropic.ContentBlockParam[] =
    formato === "pdf"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: archivo.toString("base64") },
          },
        ]
      : [
          {
            type: "text",
            text:
              `Contenido del maestro, extraído como texto. OJO: al ser texto no hay colores ni ` +
              `proporciones, así que casi todo va a quedar en "noDistinguidos" — es lo correcto.\n\n` +
              (await extraerTexto(archivo, formato, nombreArchivo)),
          },
        ];

  const respuesta = await cliente().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA } },
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

  return {
    nombreSugerido: String(leido.nombreSugerido ?? nombreArchivo).slice(0, 90),
    estilo,
    descartados,
    noDistinguidos: Array.isArray(leido.noDistinguidos) ? leido.noDistinguidos : [],
  };
}
