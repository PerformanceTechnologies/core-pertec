import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { TIPOS_DOCUMENTO, CATEGORIAS_GASTO, type CategoriaGasto, type TipoDocumento } from "./tipos";

// PASO 2 de la skill rendidor-gastos: extraer los datos de un comprobante.
//
// Un comprobante por llamada, a proposito: las funciones de Vercel cortan a los
// 60s y una rendicion de 16 boletas no cabe en un request. La UI llama a esta
// funcion una vez por archivo y muestra el avance, que ademas es mejor
// experiencia que esperar a ciegas.
//
// La API key se lee de ANTHROPIC_API_KEY del entorno (Vercel -> Settings ->
// Environment Variables). El cliente sin argumentos la resuelve solo.

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel -> Settings -> Environment Variables para habilitar el análisis de comprobantes.",
    );
  }
  return new Anthropic();
}

// Lo que el modelo devuelve por comprobante. Se fuerza con un JSON Schema
// (structured outputs) para que los valores de tipoDocumento sean EXACTAMENTE
// los del selection de Odoo y no variantes inventadas.
export interface ComprobanteLeido {
  fecha: string | null;
  proveedor: string | null;
  rutProveedor: string | null;
  numeroDocumento: string | null;
  tipoDocumento: TipoDocumento | null;
  detalle: string;
  categoria: CategoriaGasto | null;
  neto: number | null;
  iva: number | null;
  total: number | null;
  // Solo aplica a pasaje_aereo. Es INFORMATIVO: sirve para el detalle que lee
  // el contador, no decide el IVA — por criterio de PERTEC el pasaje aereo va
  // siempre afecto (ver TRATAMIENTO_DOCUMENTO en tipos.ts).
  tramoNacional: boolean | null;
  // Campos que no se pudieron leer. La skill es explicita: no inventar datos.
  ilegibles: string[];
}

const ESQUEMA = {
  type: "object",
  properties: {
    fecha: {
      type: ["string", "null"],
      description: "Fecha de emisión en formato YYYY-MM-DD. null si es ilegible.",
    },
    proveedor: {
      type: ["string", "null"],
      description: "Razón social o nombre del emisor, tal como aparece impreso.",
    },
    rutProveedor: {
      type: ["string", "null"],
      description: "RUT del emisor tal como aparece (ej. 77.768.291-1). null si no aparece.",
    },
    numeroDocumento: {
      type: ["string", "null"],
      description: "Folio de la boleta/factura, N° de ticket o código de transacción.",
    },
    // Un enum nullable va con anyOf, NO con type: ["string", "null"] + enum:
    // el validador de structured outputs rechaza esa combinación
    // ("Enum value 'x' does not match declared type '['string','null']'").
    tipoDocumento: {
      anyOf: [{ type: "string", enum: [...TIPOS_DOCUMENTO] }, { type: "null" }],
      description:
        "Clasificación tributaria del documento. Usar EXACTAMENTE uno de estos valores técnicos. null si no se puede determinar con certeza.",
    },
    detalle: {
      type: "string",
      description:
        "Descripción CORTA del gasto: una línea, idealmente menos de 60 caracteres. Es la que va como " +
        "nombre del gasto en Odoo. Un dato concreto y nada más (litros si es combustible, personas si " +
        'es alimentación, tramo si es transporte). Ej: "Combustible 42,5 L", "Almuerzo 3 personas", ' +
        '"Pasaje SCL-CJC". NO enumerar las líneas del documento.',
    },
    categoria: {
      anyOf: [{ type: "string", enum: [...CATEGORIAS_GASTO] }, { type: "null" }],
      description: "Categoría del gasto.",
    },
    neto: {
      type: ["number", "null"],
      description:
        "Monto neto antes de IVA, SOLO si el documento lo desglosa explícitamente. null si no lo desglosa — no calcularlo.",
    },
    iva: {
      type: ["number", "null"],
      description:
        "Monto del IVA, SOLO si el documento lo desglosa explícitamente. null si no lo desglosa — no calcularlo.",
    },
    total: {
      type: ["number", "null"],
      description:
        "El TOTAL A PAGAR impreso. Nunca el neto ni el subtotal. null solo si es completamente ilegible.",
    },
    tramoNacional: {
      type: ["boolean", "null"],
      description:
        "Solo para pasaje_aereo: true si el tramo es nacional (ej. Santiago-Calama), false si es internacional. " +
        "Es informativo, para el detalle. null si no aplica o no se puede determinar.",
    },
    ilegibles: {
      type: "array",
      items: { type: "string" },
      description:
        "Nombres de los campos que no se pudieron leer del comprobante. Vacío si se leyó todo.",
    },
  },
  required: [
    "fecha",
    "proveedor",
    "rutProveedor",
    "numeroDocumento",
    "tipoDocumento",
    "detalle",
    "categoria",
    "neto",
    "iva",
    "total",
    "tramoNacional",
    "ilegibles",
  ],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres un asistente contable chileno que lee comprobantes de gasto para una rendición.

Extrae los datos del comprobante adjunto. Reglas que no puedes romper:

1. **El TOTAL es el TOTAL A PAGAR impreso.** Nunca el neto, nunca el subtotal. Si el documento
   muestra "Subtotal", "Neto", "IVA" y "Total", el que va en \`total\` es el Total.

2. **No calcules el neto ni el IVA: solo copiá lo que el documento diga.** Hay tres situaciones y la
   diferencia entre ellas es lo más importante de este paso, porque decide el tratamiento tributario:

   a. **El documento desglosa** (una línea "Neto"/"Afecto"/"Subtotal" y otra "IVA"): copiá los dos
      montos tal como están impresos.
   b. **El documento declara un monto exento o no afecto** ("VALOR EXENTO", "MONTO EXENTO", "TOTAL
      EXENTO", "EXENTO", "NO AFECTO", o el recuadro "FACTURA NO AFECTA O EXENTA"): poné ese monto en
      \`neto\` y **\`iva\` en 0**. Cero, no null — que el documento diga que no hay IVA es un dato, y
      es distinto de no decir nada.
   c. **El documento no dice nada** —el caso típico de una boleta de consumo, que muestra solo el
      total— - dejá **los dos en null**. Null significa "el documento no lo declara", y recién ahí el
      desglose se calcula después con las reglas de la casa.

   No mezcles null con 0: null es silencio del documento, 0 es el documento afirmando que no hay IVA.

3. **No inventes nada.** Si un campo es ilegible, déjalo en null y agrega su nombre a \`ilegibles\`.
   Es mucho mejor que alguien lo complete a mano que una cifra inventada en una rendición.

4. **El tipo de documento define el tratamiento tributario**, así que clasifícalo con cuidado:
   - \`factura_electronica\`: factura afecta, con IVA desglosado
   - \`factura_exenta_no_afecta\`: factura marcada exenta o no afecta
   - \`boleta_electronica\`: boleta de consumo (restaurantes, combustible, retail)
   - \`boleta_honorarios\`: boleta de honorarios de una persona (lleva retención, no IVA)
   - \`comprobante_peaje_tag\`: peaje o TAG
   - \`comprobante_estacionamiento\`: ticket de estacionamiento
   - \`pasaje_aereo\`: pasaje de avión. Usalo aunque el documento venga como "factura no afecta o
     exenta": la clasificación es por lo que se compró, no por la afectación. Indicá además en
     \`tramoNacional\` si el tramo es nacional, como dato para el detalle.
   - \`pasaje_terrestre\`: pasaje de bus o tren
   - \`comprobante_transporte_app\`: Uber, Cabify, DiDi
   - \`comprobante_bancario\`: transferencia, comisión bancaria
   - \`gasto_sin_respaldo_excepcional\`: solo si no hay comprobante real
   Si no puedes determinarlo con certeza, deja \`tipoDocumento\` en null y agrégalo a \`ilegibles\`.

5. **El detalle va CORTO: una línea, idealmente menos de 60 caracteres.** Es el nombre con el que
   el gasto queda en Odoo, así que tiene que leerse de un vistazo en una lista.
   Un dato concreto y nada más: litros si es combustible, cuántas personas si es alimentación, el
   tramo si es transporte.
   Así sí: "Combustible 42,5 L" · "Almuerzo 3 personas" · "Pasaje SCL-CJC" · "Peaje Ruta 5 Norte"
   Así no: enumerar las líneas del documento ("vuelo, tasas y/o impuestos, equipaje de mano 12KG
   x2, LATAM Flex 0 horas"), ni repetir el proveedor o el tipo de documento — esos ya van en sus
   propios campos.`;

type MediaTypeImagen = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function esImagenSoportada(mime: string): mime is MediaTypeImagen {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/gif" || mime === "image/webp";
}

/**
 * Analiza un comprobante (imagen o PDF) y devuelve sus datos.
 *
 * Los PDF se envían como `document`: el modelo los lee nativamente, así que no
 * hace falta convertirlos a imagen (que era el motivo del pdftoppm de la skill).
 */
export async function analizarComprobante(
  contenido: Buffer,
  mimeType: string,
  nombreArchivo: string,
): Promise<ComprobanteLeido> {
  const base64 = contenido.toString("base64");

  const bloqueArchivo: Anthropic.ContentBlockParam =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : esImagenSoportada(mimeType)
        ? { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } }
        : (() => {
            throw new Error(
              `Tipo de archivo no soportado para "${nombreArchivo}": ${mimeType}. ` +
                "Se aceptan PDF, JPEG, PNG, GIF y WEBP.",
            );
          })();

  const respuesta = await cliente().messages.create({
    model: "claude-opus-5",
    // max_tokens es techo de THINKING + RESPUESTA juntos, no solo de la
    // respuesta. Con 4096 y el razonamiento encendido, el JSON podía llegar
    // cortado y JSON.parse fallaba con un error que no decía nada. El objeto
    // que devolvemos son ~200 tokens, así que el resto es holgura de sobra.
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    // El prompt es fijo entre comprobantes: se marca para caché y las llamadas
    // siguientes de la misma rendición leen ese prefijo al 0,1×. Ojo: el mínimo
    // cacheable de Opus 5 son 512 tokens y las instrucciones rondan ese umbral,
    // así que si quedan por debajo simplemente no cachea — sin error y sin
    // aviso (se ve en usage.cache_creation_input_tokens === 0).
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: {
      // Vuelve a "high" (el default). Se había bajado a "medium" por latencia,
      // pero esto es OCR de letra chica: un caso sensible a la capacidad, donde
      // la recomendación es un mínimo de "high". El paralelismo del cliente ya
      // recupera el tiempo de pared sin pagarlo en precisión.
      effort: "high",
      format: { type: "json_schema", schema: ESQUEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          bloqueArchivo,
          { type: "text", text: `Extrae los datos de este comprobante (archivo: ${nombreArchivo}).` },
        ],
      },
    ],
  });

  // Las clasificaciones de seguridad pueden declinar una solicitud; hay que
  // revisar stop_reason antes de leer content (que en ese caso viene vacío).
  if (respuesta.stop_reason === "refusal") {
    throw new Error(
      `El modelo no pudo procesar "${nombreArchivo}". Cárgalo a mano en la tabla de revisión.`,
    );
  }

  // Si se agotó el presupuesto de tokens, el JSON viene truncado y el
  // JSON.parse de más abajo fallaría con "Unexpected end of JSON input", que no
  // le dice nada a nadie. Mejor decir qué pasó.
  if (respuesta.stop_reason === "max_tokens") {
    throw new Error(
      `El análisis de "${nombreArchivo}" quedó incompleto (se agotó el presupuesto de tokens). ` +
        "Cargalo a mano en la tabla de revisión.",
    );
  }

  const texto = respuesta.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") {
    throw new Error(`El análisis de "${nombreArchivo}" no devolvió datos legibles.`);
  }

  return JSON.parse(texto.text) as ComprobanteLeido;
}
