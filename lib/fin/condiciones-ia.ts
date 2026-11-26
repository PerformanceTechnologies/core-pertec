import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_CARACTERES_GENERALES } from "./modelo";

// «Condiciones generales» de una cotización redactadas con IA (solo servidor), a partir de lo que pide quien cotiza y
// de lo que ya tiene la cotización. Haiku: es un texto corto y no hace falta el modelo más caro.

const MODELO = "claude-haiku-5-5";

const INSTRUCCIONES = `Redactas las «Condiciones generales» de una cotización de Performance Technologies (PERTEC), empresa chilena de arriendo de equipos, servicios industriales y venta para la minería.

Reglas:
- Escribe en español de Chile, formal y claro, en tercera persona («el cliente», «PERTEC»). Nunca voseo.
- Una condición por línea, sin numerar, sin viñetas ni guiones al inicio, sin títulos, sin saludo ni despedida.
- Entre 4 y 10 condiciones, cada una de una o dos oraciones. En total, menos de ${MAX_CARACTERES_GENERALES - 100} caracteres.
- Cubre lo que pida la persona. Si pide algo general, incluye solo condiciones razonables para ese tipo de cotización (alcance, responsabilidades, cuidado y devolución de equipos, traslados, horarios, seguridad, cambios de alcance).
- No inventes montos, plazos, porcentajes, multas ni fechas que no estén en lo que te pasan. Si una condición necesita un dato que no tienes, escríbela sin el dato.
- No repitas la forma de pago, los días de pago, el plazo de entrega ni la vigencia: esos salen aparte en la cotización.
- Responde solo con las condiciones, nada más.`;

export interface PedidoCondiciones {
  /** Lo que escribió quien cotiza: qué condiciones quiere. */
  pedido: string;
  tipo: string;
  titulo: string;
  /** Las descripciones de las líneas (sin precios). */
  lineas: string[];
  /** Lo que ya está escrito en el cuadro, por si pide ajustarlo. */
  actuales: string | null;
}

/** Limpia la respuesta: una condición por línea, sin viñetas ni numeración, dentro del tope de caracteres. */
function limpiar(texto: string): string {
  const lineas = texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*·]|\d+[.)-])\s*/, "").trim())
    .filter(Boolean);
  let salida = "";
  for (const l of lineas) {
    const siguiente = salida ? `${salida}\n${l}` : l;
    if (siguiente.length > MAX_CARACTERES_GENERALES) break;
    salida = siguiente;
  }
  return salida;
}

export async function redactarCondiciones(p: PedidoCondiciones): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("La IA no está configurada (falta ANTHROPIC_API_KEY). Escribe las condiciones a mano.");
  const contexto = [
    `Tipo de cotización: ${p.tipo}`,
    p.titulo ? `Título: ${p.titulo}` : null,
    p.lineas.length ? `Lo que se cotiza:\n${p.lineas.map((l) => `· ${l}`).join("\n")}` : null,
    p.actuales ? `Condiciones que ya tiene (ajústalas según el pedido si corresponde):\n${p.actuales}` : null,
    `Lo que pide quien cotiza:\n${p.pedido}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let respuesta: Anthropic.Message;
  try {
    respuesta = await new Anthropic().messages.create({
      model: MODELO,
      max_tokens: 2000,
      output_config: { effort: "low" },
      // Las reglas son las mismas en cada llamada: se cachean (si alcanzan el mínimo; si no, no pasa nada).
      system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: contexto }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new Error("La IA está ocupada en este momento. Inténtalo de nuevo en un minuto.");
    if (e instanceof Anthropic.APIError) throw new Error(`La IA no respondió (${e.status ?? "error"}). Inténtalo de nuevo.`);
    throw e;
  }
  if (respuesta.stop_reason === "refusal") throw new Error("La IA no pudo redactar estas condiciones. Reformula el pedido o escríbelas a mano.");
  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const limpio = limpiar(texto);
  if (!limpio) throw new Error("La IA no devolvió condiciones. Inténtalo de nuevo.");
  return limpio;
}
