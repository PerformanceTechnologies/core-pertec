import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ItemObra } from "./tipos";
import type { PropuestaLeida } from "./importar-tipos";
import type { LegalParameterSet } from "@/lib/cotizador/motor/types";

/**
 * Importar una propuesta ya escrita y dejarla cargada como obra, cuadrada.
 *
 * El reparto de trabajo es el mismo que en Rendir Gastos, y es lo único que hace
 * confiable a esto: **el modelo transcribe, el servidor calcula**. El modelo lee
 * el PDF y devuelve lo que está impreso —turnos, cargos, la tabla de precios, el
 * total declarado— y no calcula ni un total ni una hora-hombre. Las 552 HH, la
 * cadena de márgenes y el divisor que hace cuadrar los pone el servidor con el
 * mismo cálculo que usa el editor.
 *
 * Si el modelo se equivoca transcribiendo un monto, la verificación de abajo lo
 * detecta: la suma de las líneas tiene que dar el total declarado. Si no da, se
 * informa la discrepancia en vez de "arreglarla".
 */

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel → Settings → Environment Variables para habilitar la importación de propuestas.",
    );
  }
  return new Anthropic();
}

const CATEGORIAS: ItemObra["categoria"][] = ["equipo_mayor", "transporte", "insumo", "servicio", "otro"];
const UNIDADES: ItemObra["unidad"][] = ["dia", "unidad", "global", "mes"];

const ESQUEMA = {
  type: "object",
  properties: {
    numeroOferta: { type: ["string", "null"], description: "Número de oferta, ej. 'OS 009-2026'." },
    fecha: { type: ["string", "null"], description: "Fecha de la oferta en formato YYYY-MM-DD." },
    cliente: { type: ["string", "null"], description: "Razón social del cliente al que va dirigida." },
    faena: { type: ["string", "null"], description: "Faena, planta o instalación donde se ejecuta." },
    descripcionServicio: {
      type: "string",
      description: "Qué servicio es, en una línea, tal como lo titula el documento.",
    },
    turnos: {
      type: "object",
      properties: {
        cantidad: {
          type: ["number", "null"],
          description: "Cantidad de turnos del programa. null si no lo dice.",
        },
        horas: { type: ["number", "null"], description: "Horas por turno. null si no lo dice." },
      },
      required: ["cantidad", "horas"],
      additionalProperties: false,
    },
    dotacion: {
      type: "array",
      description: "Cuadro de personal. Un elemento por cargo, tal como está tabulado.",
      items: {
        type: "object",
        properties: {
          cargo: { type: "string" },
          personasPorTurno: {
            type: ["number", "null"],
            description: "Personas de ese cargo POR TURNO, solo si el documento lo dice explícitamente.",
          },
          personasTotales: {
            type: ["number", "null"],
            description: "Dotación total de ese cargo, tal como aparece en la columna del cuadro.",
          },
        },
        required: ["cargo", "personasPorTurno", "personasTotales"],
        additionalProperties: false,
      },
    },
    trabajosPrevios: {
      type: "array",
      description: "Trabajos que el documento declara ANTES de la detención de planta.",
      items: { type: "string" },
    },
    lineasPrecio: {
      type: "array",
      description: "El cuadro de precios, una entrada por ítem, con los montos EXACTOS impresos.",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string" },
          unidad: { type: "string", enum: [...UNIDADES] },
          cantidad: { type: "number" },
          precioUnitario: { type: "number", description: "Valor unitario impreso, sin puntos ni símbolo." },
          categoria: { type: "string", enum: [...CATEGORIAS] },
          esManoDeObra: {
            type: "boolean",
            description:
              "true si el precio de esta línea INCLUYE el trabajo de personas, aunque además incluya equipos. " +
              "Basta que la descripción mencione cuadrilla, personal, mano de obra, operador, supervisor, " +
              "rigger, asesor, especialista, vulcanizador, ayudante o cualquier cargo. false solo cuando la " +
              "línea es exclusivamente un equipo, un flete o un material, sin personas dentro.",
          },
        },
        required: ["descripcion", "unidad", "cantidad", "precioUnitario", "categoria", "esManoDeObra"],
        additionalProperties: false,
      },
    },
    totalNetoDeclarado: {
      type: ["number", "null"],
      description: "Total neto impreso al pie del cuadro de precios, sin IVA.",
    },
    ilegibles: {
      type: "array",
      description: "Datos que no se pudieron leer con certeza. No inventar ninguno.",
      items: { type: "string" },
    },
  },
  required: [
    "numeroOferta",
    "fecha",
    "cliente",
    "faena",
    "descripcionServicio",
    "turnos",
    "dotacion",
    "trabajosPrevios",
    "lineasPrecio",
    "totalNetoDeclarado",
    "ilegibles",
  ],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres un asistente que TRANSCRIBE ofertas técnico-económicas de servicios industriales
para cargarlas en un cotizador. Trabajas para PERTEC (Performance Technologies), que presta servicios de
vulcanización y cambio de correas transportadoras en faenas mineras y plantas.

REGLA PRINCIPAL: transcribes, no calculas.

- Copia los montos EXACTAMENTE como están impresos. No los sumes, no los promedies, no los conviertas.
- No completes lo que no está. Si el documento no dice cuántas personas por turno, deja personasPorTurno en
  null y llena personasTotales con lo que sí dice el cuadro.
- No estimes horas-hombre. El sistema las calcula desde los turnos y la dotación.
- Todo dato que no puedas leer con certeza va nombrado en "ilegibles", nunca adivinado.

CÓMO MARCAR esManoDeObra. Es el campo más importante del cuadro de precios, porque de él depende que la
cotización no cuente el mismo dinero dos veces.

Marca true cuando el precio de la línea INCLUYE el trabajo de personas, aunque además incluya equipos.
Basta que la descripción mencione cuadrilla, personal, mano de obra, o cualquier cargo: operador,
supervisor, rigger, asesor HSEC, especialista, vulcanizador, ayudante, planificador.

Marca false solo cuando la línea es exclusivamente un equipo, un flete o un material, SIN personas dentro.

Dos ejemplos reales, y son distintos a propósito:

  "Cambio y empalme CT-6, contempla preparativos previos y pago total de la cinta en parada planta"
  → true. Es el trabajo de la cuadrilla.

  "Traslado de rollos desde bodega a puntos de trabajo CT-6 y CT-7. Incluye: 01 grúa de 30 ton y cama baja,
   incluye Operador, Supervisor, Asesor HSEC, Rigger, combustible y movilización"
  → true TAMBIÉN. Aunque el título hable de un traslado y de una grúa, el precio trae adentro al Operador,
    al Supervisor, al Asesor HSEC y al Rigger. Si esta línea se marcara false, su precio entraría como
    equipo subcontratado y ADEMÁS se sumaría el costo de esas mismas personas desde el cuadro de personal:
    el total quedaría inflado por el mismo trabajo contado dos veces.

  "Grúa 50 ton, operador + rigger + elementos de izaje", cobrada por día, en una oferta donde OTRA línea
  cubre la cuadrilla
  → false. Acá el operador es parte del arriendo del equipo, no la cuadrilla del servicio, y la mano de
    obra propia ya está en su propia línea.

REGLA DE CIERRE: si el cuadro de precios tiene UNA SOLA línea y el documento declara un cuadro de personal,
esa línea es mano de obra por definición: no hay otra línea donde pueda estar el trabajo de esa gente.

Categorías: equipo_mayor para grúas, enrolladores y generadores; transporte para traslados, movilizaciones y
camas bajas; insumo para materiales que se consumen; servicio para subcontratos de servicio; otro para el
resto. La categoría es independiente de esManoDeObra: una línea puede ser transporte Y mano de obra.`;

export async function leerPropuesta(
  archivoBase64: string,
  mimeType: string,
  nombreArchivo: string,
): Promise<PropuestaLeida> {
  if (mimeType !== "application/pdf") {
    throw new Error(`"${nombreArchivo}" no es un PDF. La importación de propuestas acepta solo PDF.`);
  }

  const respuesta = await cliente().messages.create({
    model: "claude-sonnet-5",
    // Una propuesta tiene bastante más texto que una boleta: el cuadro de
    // precios, el cuadro de personal y el programa. 16k deja holgura para el
    // razonamiento más el JSON.
    max_tokens: 16384,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: ESQUEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: archivoBase64 },
          },
          {
            type: "text",
            text: `Transcribe esta oferta (archivo: ${nombreArchivo}) para cargarla en el cotizador.`,
          },
        ],
      },
    ],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El modelo no pudo procesar "${nombreArchivo}". Cárgala a mano como obra nueva.`);
  }
  if (respuesta.stop_reason === "max_tokens") {
    throw new Error(
      `La lectura de "${nombreArchivo}" quedó incompleta (se agotó el presupuesto de tokens). ` +
        "Cárgala a mano como obra nueva.",
    );
  }

  const texto = respuesta.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") {
    throw new Error(`La lectura de "${nombreArchivo}" no devolvió datos.`);
  }

  return JSON.parse(texto.text) as PropuestaLeida;
}

// La construcción de la obra vive aparte y sin "server-only" para poder probarla
// (ver ./importar-construir.ts). Se reexporta para que quien importe desde acá
// tenga las dos mitades a mano.
export { construirObra, type ObraImportada } from "./importar-construir";
export type { PropuestaLeida } from "./importar-tipos";
