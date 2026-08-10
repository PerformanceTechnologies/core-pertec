import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CorreoResumen } from "@/lib/graph-correo";
import type { ReunionCalendario } from "@/lib/graph-calendario";
import type { ResumenModelo } from "./tipos";

/**
 * Convierte el correo y el calendario del período en un resumen estructurado.
 *
 * Devuelve un objeto tipado, no HTML ni markdown: el formato lo decide el core.
 * Eso permite pintar el dashboard con los componentes propios y armar el correo
 * de la mañana a partir del MISMO resumen, sin generarlo dos veces ni arriesgar
 * que la página y el correo digan cosas distintas.
 */

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel -> Settings -> Environment Variables para habilitar el resumen diario.",
    );
  }
  return new Anthropic();
}

// Structured outputs: el esquema garantiza que el objeto llegue con la forma que
// el dashboard espera. Sin esto habría que validar a mano y decidir qué hacer
// con un campo faltante en medio del render.
const ESQUEMA = {
  type: "object",
  properties: {
    panorama: { type: "string" },
    reuniones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          asunto: { type: "string" },
          inicio: { type: "string" },
          dia: { type: "string", enum: ["hoy", "manana", "despues"] },
          con: { type: "string" },
          // Nullable va como anyOf y no como "type": ["string", "null"]: es la
          // forma que la API acepta para un campo que puede venir vacío.
          preparacion: { anyOf: [{ type: "string" }, { type: "null" }] },
          agendadaAntes: { type: "boolean" },
          indice: { type: "integer" },
        },
        required: ["asunto", "inicio", "dia", "con", "preparacion", "agendadaAntes", "indice"],
        additionalProperties: false,
      },
    },
    correosDestacados: {
      type: "array",
      items: {
        type: "object",
        properties: {
          asunto: { type: "string" },
          de: { type: "string" },
          queEsperan: { type: "string" },
          urgencia: { type: "string", enum: ["alta", "media", "baja"] },
          dirigido: { type: "string", enum: ["a_mi", "en_copia", "lista"] },
          cuando: { type: "string" },
          indice: { type: "integer" },
        },
        required: ["asunto", "de", "queEsperan", "urgencia", "dirigido", "cuando", "indice"],
        additionalProperties: false,
      },
    },
    enCopia: {
      type: "array",
      items: {
        type: "object",
        properties: {
          asunto: { type: "string" },
          de: { type: "string" },
          porQueImporta: { type: "string" },
        },
        required: ["asunto", "de", "porQueImporta"],
        additionalProperties: false,
      },
    },
    temas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tema: { type: "string" },
          correos: { type: "integer" },
          estado: { type: "string" },
        },
        required: ["tema", "correos", "estado"],
        additionalProperties: false,
      },
    },
    compromisos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          compromiso: { type: "string" },
          aQuien: { type: "string" },
          desde: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["compromiso", "aQuien", "desde"],
        additionalProperties: false,
      },
    },
    prioridades: { type: "array", items: { type: "string" } },
  },
  required: ["panorama", "reuniones", "correosDestacados", "enCopia", "temas", "compromisos", "prioridades"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Preparas el resumen de la mañana para una persona de PERTEC, una empresa chilena de servicios de ingeniería y mantención industrial.

Recibes TODOS sus correos de los últimos días y TODAS sus reuniones de hoy y los próximos dos días. Devuelves un resumen informativo y accionable.

REGISTRO
Español de Chile, profesional y directo. Se trata a la persona de "tú" —nunca "vos" ni "usted"— y se prefiere la forma impersonal cuando se puede: "requiere respuesta" antes que "te pide que respondas". Sin coloquialismos, sin signos de exclamación, sin saludos ni despedidas. Frases cortas y concretas: esto lo lee alguien con poco tiempo, no es una conversación.

Cada correo viene numerado y marcado con a quién iba dirigido:
- [PARA MÍ] está en el campo Para. Casi siempre requiere algo.
- [EN COPIA] está solo en CC. Casi nunca requiere algo, pero puede ser información útil.
- [LISTA] no la nombra: llegó por lista de distribución, buzón compartido o una regla. Es lo menos exigente.

REGLAS

1. El valor está en decir QUÉ PASÓ y QUÉ HAY QUE HACER, no en repetir el asunto. "Marcela consulta si el informe de Antucoya estará listo el viernes" sirve; "Correo sobre informe" no sirve.

2. correosDestacados: lo que requiere una acción o una respuesta de esta persona. Prioriza [PARA MÍ]. Un [EN COPIA] entra solo si el cuerpo la nombra o le pide algo explícitamente. Newsletters, notificaciones automáticas, confirmaciones de sistema e invitaciones ya aceptadas quedan fuera. Si nada requiere nada, lista vacía: es un resultado válido y mucho mejor que rellenar.

3. enCopia: lo que llegó [EN COPIA] o [LISTA] y NO requiere nada, pero conviene conocer. Decisiones tomadas, avances de terceros, información de clientes o faenas. En "porQueImporta" va por qué es relevante, no de qué se trata. Máximo seis; si no hay nada que valga, lista vacía.

4. temas: agrupa los correos que tratan lo MISMO (una licitación, una faena, un cliente, un equipo con falla). En "estado" va en qué quedó el asunto, no de qué se trata: "la propuesta está a la espera de la firma del cliente" sirve; "conversación sobre la propuesta" no. Solo temas con dos correos o más. Máximo cinco, del más movido al menos.

5. La urgencia se juzga por lo que dice el correo, no por quién lo envía: un plazo nombrado, un cliente esperando respuesta o algo que bloquea a un tercero es "alta". El cargo del remitente no sube la urgencia por sí solo. Un correo de hace tres días sin responder sube de urgencia, no baja.

6. compromisos: lo que ESTA PERSONA se comprometió a hacer y sigue pendiente ("lo envío mañana", "lo reviso y confirmo"), no lo que otros le prometieron. En "desde" va cuándo lo comprometió si el correo lo permite deducir, si no null. Sin evidencia de un compromiso propio, lista vacía.

7. reuniones: copia "dia" y "agendadaAntes" tal como vienen en los datos, están calculados. "con" es la persona o el grupo, no la lista de correos: "Marcela Rojas" o "equipo de operaciones". "preparacion" solo si hay algo concreto que llevar listo; si no, null. No inventes preparación para llenar el campo.

8. "cuando" en correosDestacados es relativo y en palabras: "hoy", "ayer", "el viernes", "hace tres días".

9. indice: el número entre corchetes con el que el elemento aparece en los datos que recibes. Va tanto en correosDestacados como en reuniones y tiene que ser EXACTO — el sistema lo usa para enlazar cada fila con el correo o la cita reales en Outlook. Un índice equivocado manda a la persona al mensaje equivocado. Si no puedes determinarlo con certeza, usa 0.

10. prioridades: exactamente tres, ordenadas, cruzando todo lo anterior. En imperativo y concretas.

11. panorama: tres o cuatro líneas. Cuántas reuniones hay y si el día está cargado, qué es lo que no puede quedar pendiente, y si hay algo fuera de lo normal (una reunión agregada a última hora, un plazo próximo, un correo de hace días sin responder).

12. No inventes ningún dato que no esté en lo que recibes. Si el correo no menciona el plazo, no lo pongas. Si algo es ambiguo, dilo en vez de completarlo. No cuentes correos: los conteos los calcula el sistema.

13. No es un correo ni un mensaje: solo el objeto.`;

const ETIQUETA_DIRIGIDO = {
  a_mi: "PARA MÍ",
  en_copia: "EN COPIA",
  lista: "LISTA",
} as const;

function bloqueCorreos(correos: CorreoResumen[]): string {
  if (correos.length === 0) return "(Sin correos en el período.)";
  return correos
    .map((c, i) =>
      [
        `[${i + 1}] [${ETIQUETA_DIRIGIDO[c.dirigido]}] De: ${c.de} <${c.correoDe}>`,
        `Asunto: ${c.asunto}`,
        `Recibido: ${c.recibidoEn}`,
        `Estado: ${c.leido ? "leído" : "SIN LEER"}${c.marcado ? " · marcado con bandera" : ""}${
          c.tieneAdjuntos ? " · con adjuntos" : ""
        } · ${c.destinatarios} destinatario(s)`,
        `Extracto: ${c.extracto || "(sin cuerpo)"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function bloqueReuniones(reuniones: ReunionCalendario[], hoyIso: string, mananaIso: string): string {
  if (reuniones.length === 0) return "(Sin reuniones agendadas en el período.)";
  return reuniones
    .map((r, i) => {
      // El día lo decide el servidor comparando con la fecha de Chile, no el
      // modelo: preguntarle "¿esto es hoy o mañana?" es pedirle que haga
      // aritmética de fechas, que es justo lo que hace mal.
      const fecha = r.inicio.slice(0, 10);
      const dia = fecha === hoyIso ? "hoy" : fecha === mananaIso ? "manana" : "despues";
      const asistentes = r.asistentes?.length ? r.asistentes.slice(0, 10).join(", ") : "(sin asistentes)";
      return [
        `[${i + 1}] ${dia.toUpperCase()} ${r.inicio.slice(11, 16)}-${r.fin.slice(11, 16)}${
          r.todoElDia ? " (todo el día)" : ""
        }: ${r.asunto}`,
        `dia: ${dia}`,
        `agendadaAntes: ${r.agendadaAntes ? "true" : "false"}${
          r.agendadaAntes ? "" : " (la metieron el mismo día)"
        }`,
        `Organiza: ${r.organizador ?? "(sin dato)"}`,
        `Asistentes: ${asistentes}`,
        `Lugar: ${r.ubicacion ?? (r.enlaceTeams ? "Teams" : "(sin dato)")}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function generarResumen(
  nombre: string,
  correos: CorreoResumen[],
  reuniones: ReunionCalendario[],
  hoyIso: string,
  horasDeCorreo: number,
): Promise<ResumenModelo> {
  // Mañana en fecha local, sin pasar por Date: sumar un día con new Date() sobre
  // una fecha suelta la interpreta como UTC y cerca de fin de mes se corre.
  const [a, m, d] = hoyIso.split("-").map(Number);
  const manana = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);

  const respuesta = await cliente().messages.create({
    model: "claude-sonnet-5",
    // Techo de thinking + respuesta juntos. El objeto ahora tiene más secciones
    // (~1.500 tokens) y el razonamiento sobre 150 correos es más largo, así que
    // el techo sube respecto de la primera versión.
    max_tokens: 16384,
    thinking: { type: "adaptive" },
    // Las instrucciones son idénticas todos los días y para todas las personas:
    // se marcan para caché y a partir de la segunda llamada se leen al 0,1×.
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: {
      // Sube de "medium" a "high": agrupar temas y juzgar qué requiere una respuesta
      // sobre 150 correos es bastante más difícil que resumir 20.
      effort: "high",
      format: { type: "json_schema", schema: ESQUEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Persona: ${nombre}`,
              `Hoy es ${hoyIso} (hora de Chile). Mañana es ${manana}.`,
              `El correo que sigue son las últimas ${horasDeCorreo} horas.`,
              "",
              "=== REUNIONES DE HOY Y LOS PRÓXIMOS DÍAS ===",
              bloqueReuniones(reuniones, hoyIso, manana),
              "",
              "=== CORREO DEL PERÍODO ===",
              bloqueCorreos(correos),
            ].join("\n"),
          },
        ],
      },
    ],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error("El modelo se negó a procesar el contenido del buzón.");
  }
  if (respuesta.stop_reason === "max_tokens") {
    throw new Error(
      "El resumen se cortó por largo. Suele ser un buzón con muchísimo correo: bajá TOPE_CORREOS o HORAS_POR_DEFECTO en lib/graph-correo.ts.",
    );
  }

  const texto = respuesta.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") {
    throw new Error("La respuesta del modelo no trajo el bloque de texto con el resumen.");
  }

  return JSON.parse(texto.text) as ResumenModelo;
}
