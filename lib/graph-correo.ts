import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";

/**
 * Lectura del buzón para el resumen diario.
 *
 * Mismo patrón que lib/graph-calendario.ts: devuelve un estado en vez de lanzar,
 * porque el permiso de correo es opcional en el login. Si el tenant no dio
 * consentimiento a Mail.Read, el módulo tiene que mostrar "conectá tu cuenta",
 * no una pantalla de error.
 */

const ZONA_HORARIA = "America/Santiago";
// Un día hábil normal de una persona con harto correo. Más que esto no aporta al
// resumen y sí infla el prompt.
const TOPE_CORREOS = 60;
// Recorte del cuerpo de cada correo. El resumen necesita saber de qué se trata y
// qué piden, no el hilo completo con las 14 respuestas anteriores citadas.
const LARGO_CUERPO = 600;

export interface CorreoResumen {
  id: string;
  asunto: string;
  de: string;
  correoDe: string;
  recibidoEn: string;
  leido: boolean;
  marcado: boolean;
  tieneAdjuntos: boolean;
  extracto: string;
}

export type ResultadoCorreos =
  | { estado: "ok"; correos: CorreoResumen[] }
  | { estado: "sin_permiso" }
  | { estado: "error"; motivo: string };

interface MensajeGraph {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
  hasAttachments?: boolean;
  bodyPreview?: string;
}

/**
 * Los correos recibidos en las últimas N horas, del más nuevo al más viejo.
 *
 * Se piden solo los campos que usa el resumen (`select`): traer el cuerpo
 * completo de 60 correos son megabytes y varios segundos por nada, porque igual
 * se recorta a bodyPreview.
 */
export async function obtenerCorreosRecientes(
  accessToken: string | undefined,
  horas = 24,
): Promise<ResultadoCorreos> {
  if (!accessToken) return { estado: "sin_permiso" };

  try {
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
    const cliente = Client.init({ authProvider: (done) => done(null, accessToken) });

    const respuesta = await cliente
      .api("/me/mailFolders/inbox/messages")
      .header("Prefer", `outlook.timezone="${ZONA_HORARIA}"`)
      .filter(`receivedDateTime ge ${desde}`)
      .select("subject,from,receivedDateTime,isRead,flag,hasAttachments,bodyPreview")
      .orderby("receivedDateTime desc")
      .top(TOPE_CORREOS)
      .get();

    const mensajes: MensajeGraph[] = respuesta.value ?? [];

    return {
      estado: "ok",
      correos: mensajes.map((m) => ({
        id: m.id,
        asunto: m.subject?.trim() || "(Sin asunto)",
        de: m.from?.emailAddress?.name?.trim() || m.from?.emailAddress?.address || "(Desconocido)",
        correoDe: m.from?.emailAddress?.address ?? "",
        recibidoEn: m.receivedDateTime ?? "",
        leido: Boolean(m.isRead),
        marcado: m.flag?.flagStatus === "flagged",
        tieneAdjuntos: Boolean(m.hasAttachments),
        extracto: (m.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, LARGO_CUERPO),
      })),
    };
  } catch (error) {
    // 401/403 es el caso típico de permiso no consentido; se separa del resto
    // para poder mostrar el mensaje correcto en pantalla.
    const codigo = (error as { statusCode?: number })?.statusCode;
    if (codigo === 401 || codigo === 403) return { estado: "sin_permiso" };
    const motivo = error instanceof Error ? error.message : String(error);
    console.error("[graph-correo] No se pudieron leer los correos:", motivo);
    return { estado: "error", motivo };
  }
}

/**
 * Manda el resumen por correo, de la persona a sí misma.
 *
 * `destinatario` es SIEMPRE la dirección de la dueña del token, y el llamador no
 * puede pasar otra cosa útil: el token es delegado, así que Graph solo permite
 * enviar como esa persona. Aun así el cron pasa explícitamente su propio correo
 * y nunca una lista — un resumen de bandeja de entrada no puede terminar en el
 * buzón de otro por un bug de configuración.
 */
export async function enviarResumenPorCorreo(
  accessToken: string,
  destinatario: string,
  asunto: string,
  cuerpoHtml: string,
): Promise<void> {
  const cliente = Client.init({ authProvider: (done) => done(null, accessToken) });
  await cliente.api("/me/sendMail").post({
    message: {
      subject: asunto,
      body: { contentType: "HTML", content: cuerpoHtml },
      toRecipients: [{ emailAddress: { address: destinatario } }],
    },
    // Sin copia en Elementos enviados: es un correo automático a uno mismo, y
    // llenar la carpeta de enviados con 250 de estos al año no le sirve a nadie.
    saveToSentItems: false,
  });
}
