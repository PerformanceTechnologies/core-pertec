import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extraerTexto } from "@/lib/cotizador/obra/extraer-texto";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import type { OfertaCanonica } from "./tipos";
import { normalizarLectura } from "./normalizar";

/**
 * De un borrador en Word, Excel o PDF a la estructura canónica.
 *
 * Es el Paso 1 del flujo, y el reparto de trabajo es el que hace confiable todo
 * el módulo: **el modelo transcribe, el servidor calcula**. El modelo lee el
 * borrador y devuelve lo que está escrito, sección por sección, sin sumar ni
 * completar. Los totales —dotación, horas, TOTAL NETO— y las verificaciones los
 * pone ./verificar.ts, que además comprueba que lo impreso cuadre.
 *
 * La diferencia con pedirle al modelo que "calcule y marque como calculado por
 * él para que lo valides" es concreta: acá el sistema te dice cuándo NO cuadra,
 * en vez de dejarte revisar cada documento a mano para siempre.
 */

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
 * TODO obligatorio y de un solo tipo. Es la única forma de esquema que la API
 * compila sin protestar, y llegar acá costó dos rechazos:
 *
 *  - Con cada campo ausente como `["string","null"]` y cada sección como `anyOf`
 *    contra null, el esquema tenía 35 tipos unión y la API corta en 16.
 *  - Cambiando eso por propiedades opcionales, la gramática tiene que admitir
 *    cualquier combinación de claves presentes y la respuesta es "Schema is too
 *    complex". Una explosión por otra.
 *
 * Así que "el documento no lo trae" se dice con un VALOR: texto en blanco, número
 * en 0, sección con sus listas vacías. La traducción de eso a la forma canónica
 * —sección vacía a null, total en 0 a "no impreso"— la hace ./normalizar.ts, que
 * es puro y está probado. El esquema queda tonto y el modelo no tiene que elegir
 * entre formas.
 */
const texto = { type: "string" } as const;
const listaDeTexto = { type: "array", items: { type: "string" } } as const;

/** Un objeto cerrado donde todas las claves son obligatorias. */
const objeto = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const FILA_DOTACION = objeto({
  cargo: { type: "string" },
  dotacion: { type: "number", description: "Personas de ese cargo, tal como está en la columna." },
});

const FILA_DOTACION_CON_REGIMEN = objeto({
  cargo: { type: "string" },
  dotacion: { type: "number" },
  regimen: texto,
});

const ESQUEMA = objeto({
  titulo: { type: "string", description: "El título del servicio, tal como lo titula el documento." },
  identificacion: objeto({
    numeroOferta: texto,
    fecha: texto,
    validez: texto,
    cliente: texto,
    atencion: texto,
    copia: texto,
    referencia: texto,
    faena: texto,
  }),
  alcance: objeto({
    introduccion: texto,
    actividades: listaDeTexto,
    trabajosPrevios: listaDeTexto,
    personalEspecialista: { type: "array", items: FILA_DOTACION },
  }),
  metodologia: objeto({
    antesDeLaDetencion: listaDeTexto,
    duranteLaDetencion: listaDeTexto,
  }),
  especificaciones: {
    type: "array",
    items: objeto({ parametro: { type: "string" }, especificacion: { type: "string" } }),
  },
  organizacion: objeto({
    cuadroPersonal: { type: "array", items: FILA_DOTACION_CON_REGIMEN },
    responsabilidades: {
      type: "array",
      items: objeto({ cargo: { type: "string" }, descripcion: { type: "string" } }),
    },
    nota: texto,
  }),
  programa: objeto({
    introduccion: texto,
    turnos: {
      type: "array",
      items: objeto({
        turno: { type: "string", description: 'El rótulo del turno: "T1", "Turno 1".' },
        jornada: { type: "string" },
        horas: { type: "number" },
      }),
    },
    nota: texto,
  }),
  precio: objeto({
    lineas: {
      type: "array",
      items: objeto({
        cantidad: { type: "number" },
        cargo: { type: "string", description: "La descripción de la línea, completa." },
        unidad: { type: "string" },
        valorUnitario: { type: "number", description: "Sin puntos ni símbolo de moneda." },
        valorTotalImpreso: {
          type: "number",
          description:
            "El total de la línea TAL COMO ESTÁ IMPRESO. No lo calcules: si el documento no lo " +
            "trae, omití el campo. Sirve para comprobar la multiplicación.",
        },
      }),
    },
    totalNetoImpreso: {
      type: "number",
      description:
        "El TOTAL NETO impreso al pie de la tabla. No lo sumes: si no está impreso, omití el campo.",
    },
    nota: texto,
  }),
  condicionesComerciales: listaDeTexto,
  aportes: objeto({ pertec: listaDeTexto, cliente: listaDeTexto }),
  cierre: objeto({
    texto: texto,
    firmantes: {
      type: "array",
      items: objeto({ nombre: { type: "string" }, cargo: { type: "string" }, empresa: texto }),
    },
    cc: texto,
  }),
  anexo: objeto({
    respaldoInstitucional: listaDeTexto,
    mandantes: listaDeTexto,
    notaEquipo: texto,
  }),
  porConfirmar: {
    type: "array",
    description: "Datos ausentes o ambiguos, nombrados. Nunca adivinados.",
    items: { type: "string" },
  },
  omitidas: {
    type: "array",
    description: "Secciones que no aplican a este servicio, con el motivo.",
    items: objeto({ seccion: { type: "string" }, motivo: { type: "string" } }),
  },
});

const INSTRUCCIONES = `Normalizas borradores de ofertas técnicas de Performance Technologies SpA (PERTEC),
que presta servicios de vulcanización y cambio de correas transportadoras en faenas mineras y plantas.

Tu tarea NO es diseñar ni redactar de nuevo: es extraer y normalizar el contenido del borrador a la
estructura canónica de las ofertas de PERTEC, para que el servidor lo maquete después.

REGLA PRINCIPAL: transcribes, no calculas.

- Fidelidad literal en cifras, cantidades, medidas, nombres, fechas y precios. No redondees, no
  resumas, no completes.
- NO calcules ningún total. Ni la dotación total, ni las horas del programa, ni el TOTAL NETO, ni el
  total de una línea de precio. Esos los calcula el sistema, y de paso comprueba que coincidan con lo
  impreso. Si el documento IMPRIME un total, transcríbelo en el campo que dice "impreso" —sirve de
  control—; si no lo imprime, poné 0.
- Podés corregir ortografía y mejorar la redacción de los párrafos narrativos, sin cambiar el
  significado técnico ni comercial. En cifras, nombres y descripciones de líneas de precio, no.
- Todo dato ausente o ambiguo va nombrado en "porConfirmar", nunca adivinado. Sé específico: en vez de
  "falta la fecha", escribí "La tabla de identificación no trae la fecha de la oferta".

SECCIONES QUE NO APLICAN. El maestro trae todas las secciones posibles y cada oferta usa las que le
corresponden: un traslado de rollos no tiene especificaciones de equipo vulcanizador y un cambio de
correa sí. Si una sección no aplica, devolvela con sus listas vacías y sus textos en blanco, y explicá
por qué en "omitidas". El sistema la saca del documento: no la llenes con texto de relleno.

TODAS las claves del esquema van siempre. Lo que el borrador no trae se dice con un valor vacío —texto
en blanco, número en 0, lista vacía— y se nombra en "porConfirmar". Nunca lo adivines ni pongas un
guion o un "N/A" como si fuera el dato.

No te preocupes por la numeración de las secciones ni por el índice: los genera el sistema a partir de
las secciones presentes. Vos solo decidís qué hay y qué no.

QUÉ NO REPORTAR ACÁ. No busques inconsistencias entre secciones ni sumas que no cuadren: eso lo hace
el servidor con aritmética, que no se equivoca. Tu trabajo es que lo que transcribís sea exactamente
lo que dice el borrador.`;

export async function leerBorrador(
  archivo: Buffer,
  mimeType: string,
  nombreArchivo: string,
): Promise<OfertaCanonica> {
  const formato = formatoDe(mimeType, nombreArchivo);
  if (!formato) {
    throw new Error(
      `"${nombreArchivo}" no es un formato que se pueda leer. Se aceptan Word (.docx), ` +
        "PDF y Excel (.xlsx, .xlsm).",
    );
  }

  // El PDF va como documento —la API lo procesa entero, texto más una imagen por
  // página— porque su maqueta está dibujada. Word y Excel van como texto: no
  // tienen páginas que rasterizar y cuestan dos órdenes de magnitud menos
  // (ver lib/cotizador/obra/extraer-texto.ts).
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
            text: `Contenido del borrador, extraído de un ${
              formato === "excel" ? "archivo de Excel" : "documento de Word"
            }:\n\n${await extraerTexto(archivo, formato, nombreArchivo)}`,
          },
        ];

  const respuesta = await cliente().messages.create({
    model: "claude-sonnet-5",
    // Una oferta completa son diez secciones con sus tablas y listas: bastante
    // más salida que una propuesta suelta.
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA } },
    messages: [
      {
        role: "user",
        content: [
          ...contenido,
          {
            type: "text",
            text: `Normalizá este borrador (archivo: ${nombreArchivo}) a la estructura canónica.`,
          },
        ],
      },
    ],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El modelo no pudo procesar "${nombreArchivo}". Cargá la oferta a mano.`);
  }
  if (respuesta.stop_reason === "max_tokens") {
    throw new Error(
      `La lectura de "${nombreArchivo}" quedó incompleta: se agotó el presupuesto de tokens. ` +
        "Probá dividiendo el borrador o cargalo a mano.",
    );
  }

  const salida = respuesta.content.find((b) => b.type === "text");
  if (!salida || salida.type !== "text") {
    throw new Error(`La lectura de "${nombreArchivo}" no devolvió datos.`);
  }

  // La normalización traduce los valores vacíos del esquema a la forma canónica:
  // sección vacía a null, total en 0 a "no impreso". Sin esto, el resto del módulo
  // vería secciones presentes pero vacías y totales impresos que no existen.
  return normalizarLectura(JSON.parse(salida.text) as OfertaCanonica);
}
