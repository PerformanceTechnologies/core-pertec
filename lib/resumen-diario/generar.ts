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
        },
        required: ["asunto", "inicio", "dia", "con", "preparacion", "agendadaAntes"],
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
        },
        required: ["asunto", "de", "queEsperan", "urgencia", "dirigido", "cuando"],
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
  required: [
    "panorama",
    "reuniones",
    "correosDestacados",
    "enCopia",
    "temas",
    "compromisos",
    "prioridades",
  ],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Sos el asistente que le prepara el resumen de la mañana a una persona de PERTEC, una empresa chilena de servicios de ingeniería y mantención industrial.

Recibís TODOS sus correos de los últimos días y TODAS sus reuniones de hoy y los próximos dos días. Devolvés un resumen informativo y accionable, en español de Chile, tratando a la persona de "vos".

Cada correo viene marcado con a quién iba dirigido:
- [PARA MÍ] está en el campo Para. Casi siempre espera algo.
- [EN COPIA] está solo en CC. Casi nunca espera algo, pero puede ser información que le conviene tener.
- [LISTA] no la nombra: llegó por lista de distribución, buzón compartido o una regla. Es lo menos exigente.

REGLAS

1. El valor está en decir QUÉ PASÓ y QUÉ TIENE QUE HACER, no en repetir el asunto. "Marcela pregunta si el informe de Antucoya va a estar el viernes" sirve; "Correo sobre informe" no sirve.

2. correosDestacados: lo que espera algo de esta persona. Priorizá [PARA MÍ]. Un [EN COPIA] entra acá solo si el cuerpo la nombra o le pide algo explícitamente. Newsletters, notificaciones automáticas, confirmaciones de sistema e invitaciones ya aceptadas quedan fuera. Si nada espera nada, lista vacía — es un resultado válido y mucho mejor que rellenar.

3. enCopia: lo que llegó [EN COPIA] o [LISTA] y NO pide nada, pero conviene saber. Decisiones tomadas, avances de otros, información de clientes o faenas. En "porQueImporta" va por qué le sirve, no de qué se trata. Máximo seis; si no hay nada que valga, lista vacía.

4. temas: agrupá los correos que hablan de lo MISMO (una licitación, una faena, un cliente, un equipo con falla). En "estado" va en qué quedó el asunto, no de qué se trata: "la propuesta está esperando la firma del cliente" sirve; "conversación sobre la propuesta" no. Solo temas con dos correos o más. Máximo cinco, del más movido al menos.

5. La urgencia se juzga por lo que dice el correo, no por quién lo manda: un plazo nombrado, un cliente esperando respuesta o algo que bloquea a otro es "alta". Que alguien sea jefe no sube la urgencia por sí solo. Un correo de hace tres días sin responder sube de urgencia, no baja.

6. compromisos: lo que ESTA PERSONA prometió y sigue abierto ("te lo mando mañana", "lo reviso y te digo"), no lo que le prometieron a ella. En "desde" va cuándo lo prometió si el correo lo deja ver, si no null. Sin evidencia de un compromiso propio, lista vacía.

7. reuniones: copiá el campo "dia" y "agendadaAntes" tal como vienen en los datos — están calculados, no los deduzcas. "con" es la persona o el grupo, no la lista de correos: "Marcela Rojas" o "equipo de operaciones". "preparacion" solo si de verdad hay algo que llevar listo; si no, null. No inventes preparación para llenar el campo. Si una reunión se agendó el mismo día en que ocurre, vale la pena que el panorama lo mencione.

8. "cuando" en correosDestacados es relativo y en palabras: "hoy", "ayer", "el viernes", "hace tres días".

9. prioridades: exactamente tres, ordenadas, cruzando todo lo anterior. Imperativas y concretas.

10. panorama: tres o cuatro líneas. Cuántas reuniones y si el día está cargado, qué es lo que de verdad no puede quedar sin hacer, y si hay algo raro (una reunión metida a última hora, un plazo que se viene, un correo de hace días sin responder).

11. Nunca inventes un dato que no esté en lo que recibiste. Si el correo no dice el plazo, no lo pongas. Si algo es ambiguo, decilo en vez de completarlo. No cuentes correos: los conteos los calcula el sistema.

12. No es un correo ni un mensaje: no saludes, no te despidas, no expliques lo que vas a hacer. Solo el objeto.`;

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
    .map((r) => {
      // El día lo decide el servidor comparando con la fecha de Chile, no el
      // modelo: preguntarle "¿esto es hoy o mañana?" es pedirle que haga
      // aritmética de fechas, que es justo lo que hace mal.
      const fecha = r.inicio.slice(0, 10);
      const dia = fecha === hoyIso ? "hoy" : fecha === mananaIso ? "manana" : "despues";
      const asistentes = r.asistentes?.length ? r.asistentes.slice(0, 10).join(", ") : "(sin asistentes)";
      return [
        `${dia.toUpperCase()} ${r.inicio.slice(11, 16)}-${r.fin.slice(11, 16)}${
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
      // Sube de "medium" a "high": agrupar temas y juzgar qué espera algo de vos
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
