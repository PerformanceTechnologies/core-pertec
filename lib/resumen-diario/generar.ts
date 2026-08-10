import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CorreoResumen } from "@/lib/graph-correo";
import type { ReunionCalendario } from "@/lib/graph-calendario";
import type { ResumenDiario } from "./tipos";

/**
 * Convierte el correo y el calendario del día en un resumen estructurado.
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
          dia: { type: "string", enum: ["hoy", "manana"] },
          con: { type: "string" },
          // Nullable va como anyOf y no como "type": ["string", "null"]: es la
          // forma que la API acepta para un campo que puede venir vacío.
          preparacion: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["asunto", "inicio", "dia", "con", "preparacion"],
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
        },
        required: ["asunto", "de", "queEsperan", "urgencia"],
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
        },
        required: ["compromiso", "aQuien"],
        additionalProperties: false,
      },
    },
    prioridades: { type: "array", items: { type: "string" } },
  },
  required: ["panorama", "reuniones", "correosDestacados", "compromisos", "prioridades"],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Sos el asistente que le prepara el resumen de la mañana a una persona de PERTEC, una empresa chilena de servicios de ingeniería y mantención industrial.

Recibís su bandeja de entrada de las últimas 24 horas y sus reuniones de hoy y mañana. Devolvés un resumen accionable, en español de Chile, tratando a la persona de "vos".

REGLAS

1. El valor está en decir QUÉ TIENE QUE HACER, no en repetir el asunto del correo. "Marcela pregunta si el informe de Antucoya va a estar el viernes" sirve; "Correo sobre informe" no sirve.

2. En correosDestacados va SOLO lo que espera algo de esta persona. Newsletters, notificaciones automáticas, facturas del sistema, invitaciones ya aceptadas y copias informativas quedan fuera. Si nada espera nada, devolvé la lista vacía — es un resultado válido y mucho mejor que rellenar.

3. La urgencia se juzga por lo que dice el correo, no por quién lo manda: un plazo nombrado, un cliente esperando respuesta o algo que bloquea a otro es "alta". Que alguien sea jefe no sube la urgencia por sí solo.

4. En compromisos va lo que ESTA PERSONA prometió y sigue abierto ("te lo mando mañana", "lo reviso y te digo"), no lo que le prometieron a ella. Si no hay evidencia de un compromiso propio, lista vacía.

5. En reuniones, "con" es la persona o el grupo, no la lista completa de correos: "Marcela Rojas" o "equipo de operaciones". "preparacion" solo se llena si de verdad hay algo que llevar listo; si no, null. No inventes preparación para llenar el campo.

6. prioridades son exactamente tres, ordenadas, y salen de cruzar todo lo anterior. Cada una en una línea, imperativa y concreta.

7. panorama son dos o tres líneas: cuántas reuniones, si el día está cargado, y lo único que no puede quedar sin hacer hoy.

8. Nunca inventes un dato que no esté en lo que recibiste. Si el correo no dice el plazo, no lo pongas. Si algo es ambiguo, decilo en vez de completarlo.

9. No es un correo ni un mensaje: no saludes, no te despidas, no expliques lo que vas a hacer. Solo el objeto.`;

function bloqueCorreos(correos: CorreoResumen[]): string {
  if (correos.length === 0) return "(Sin correos nuevos en las últimas 24 horas.)";
  return correos
    .map((c, i) =>
      [
        `[${i + 1}] De: ${c.de} <${c.correoDe}>`,
        `Asunto: ${c.asunto}`,
        `Recibido: ${c.recibidoEn}`,
        `Estado: ${c.leido ? "leído" : "SIN LEER"}${c.marcado ? " · marcado con bandera" : ""}${
          c.tieneAdjuntos ? " · con adjuntos" : ""
        }`,
        `Extracto: ${c.extracto || "(sin cuerpo)"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function bloqueReuniones(reuniones: ReunionCalendario[], hoyIso: string): string {
  if (reuniones.length === 0) return "(Sin reuniones agendadas para hoy ni mañana.)";
  return reuniones
    .map((r) => {
      // El día lo decide el servidor comparando con la fecha de Chile, no el
      // modelo: preguntarle "¿esto es hoy o mañana?" es pedirle que haga
      // aritmética de fechas, que es justo lo que hace mal.
      const dia = r.inicio.slice(0, 10) === hoyIso ? "HOY" : "MAÑANA";
      const asistentes = r.asistentes?.length ? r.asistentes.slice(0, 8).join(", ") : "(sin asistentes)";
      return [
        `${dia} ${r.inicio.slice(11, 16)}-${r.fin.slice(11, 16)}${r.todoElDia ? " (todo el día)" : ""}: ${r.asunto}`,
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
): Promise<ResumenDiario> {
  const respuesta = await cliente().messages.create({
    model: "claude-sonnet-5",
    // Techo de thinking + respuesta juntos. El objeto son ~600 tokens; el resto
    // es holgura para razonar sobre 60 correos sin que el JSON llegue cortado.
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    // Las instrucciones son idénticas todos los días y para todas las personas:
    // se marcan para caché y a partir de la segunda llamada se leen al 0,1×.
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: "medium",
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
              `Hoy es ${hoyIso} (hora de Chile).`,
              "",
              "=== REUNIONES DE HOY Y MAÑANA ===",
              bloqueReuniones(reuniones, hoyIso),
              "",
              "=== BANDEJA DE ENTRADA, ÚLTIMAS 24 HORAS ===",
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
      "El resumen se cortó por largo. Suele ser un buzón con muchísimo correo: bajá TOPE_CORREOS en lib/graph-correo.ts.",
    );
  }

  const texto = respuesta.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") {
    throw new Error("La respuesta del modelo no trajo el bloque de texto con el resumen.");
  }

  return JSON.parse(texto.text) as ResumenDiario;
}
