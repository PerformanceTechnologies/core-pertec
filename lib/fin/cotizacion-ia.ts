import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { INSTRUCCIONES_OBSERVACIONES, armarPedidoDeObservaciones, limpiarObservacionesGeneradas, type DatosParaObservaciones } from "./cotizacion-ia-datos";

// Observaciones de una cotización de arriendo con IA (solo servidor). Lo que viaja y las reglas están en
// cotizacion-ia-datos.ts; acá solo está la llamada.

const MODELO = "claude-sonnet-5-5";

export async function generarObservacionesDeArriendo(datos: DatosParaObservaciones): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("La IA no está configurada (falta ANTHROPIC_API_KEY). Escribe las observaciones a mano.");
  const respuesta = await new Anthropic().messages.create({
    model: MODELO,
    max_tokens: 1024,
    // Las reglas son idénticas en cada llamada: se cachean.
    system: [{ type: "text", text: INSTRUCCIONES_OBSERVACIONES, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: armarPedidoDeObservaciones(datos) }],
  });
  if (respuesta.stop_reason === "refusal") throw new Error("La IA no pudo redactar las observaciones con estos datos.");
  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const limpio = limpiarObservacionesGeneradas(texto);
  if (!limpio) throw new Error("La IA no devolvió observaciones. Inténtalo de nuevo.");
  return limpio;
}
