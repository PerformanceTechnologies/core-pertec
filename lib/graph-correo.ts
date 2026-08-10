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
// Tres días, no uno. Un correo del viernes que sigue sin responder el lunes es
// justamente el que hay que recordarle a alguien, y con 24 horas desaparecía del
// resumen sin haber sido atendido.
const HORAS_POR_DEFECTO = 72;
// Tope de mensajes que se le pasan al modelo. Con 72 horas el volumen sube, y
// esto es lo que evita que un buzón muy movido reviente el prompt. Lo que se
// recorta son los MÁS VIEJOS, porque la consulta viene ordenada por fecha
// descendente.
const TOPE_CORREOS = 150;
// Recorte del cuerpo de cada correo. El resumen necesita saber de qué se trata y
// qué piden, no el hilo completo con las 14 respuestas anteriores citadas.
const LARGO_CUERPO = 700;

/** A quién iba dirigido el correo, desde el punto de vista de quien rinde. */
export type Dirigido = "a_mi" | "en_copia" | "lista";

export interface CorreoResumen {
  id: string;
  asunto: string;
  de: string;
  correoDe: string;
  recibidoEn: string;
  leido: boolean;
  marcado: boolean;
  tieneAdjuntos: boolean;
  /**
   * Si la persona está en Para, en CC, o en ninguno de los dos.
   *
   * Es la distinción que más cambia la lectura del resumen: un correo dirigido a
   * vos casi siempre espera algo, y uno en copia casi nunca. Antes no se
   * calculaba y los dos se mezclaban en la misma lista.
   *
   * "lista" es el correo que no te nombra en Para ni en CC: llegó por una lista
   * de distribución, un buzón compartido o una regla. Es lo menos exigente de
   * los tres.
   */
  dirigido: Dirigido;
  /** Cuántas personas más lo recibieron. Un "para 14" exige bastante menos que un "para ti". */
  destinatarios: number;
  extracto: string;
  /**
   * URL para abrir el mensaje en Outlook Web.
   *
   * La devuelve Graph como `webLink`. Es lo que convierte el resumen en algo
   * desde donde se puede actuar: sin esto hay que volver al buzón y buscar el
   * correo a mano por el asunto.
   */
  enlace: string | null;
}

/** Conteos del buzón. Se calculan acá y no los inventa el modelo. */
export interface ConteosCorreo {
  total: number;
  sinLeer: number;
  aMi: number;
  enCopia: number;
  marcados: number;
  horas: number;
  /** true si el tope recortó mensajes: el resumen no vio el buzón completo. */
  recortado: boolean;
}

export type ResultadoCorreos =
  | { estado: "ok"; correos: CorreoResumen[]; conteos: ConteosCorreo }
  | { estado: "sin_permiso" }
  | { estado: "error"; motivo: string };

interface DireccionGraph {
  emailAddress?: { name?: string; address?: string };
}

interface MensajeGraph {
  id: string;
  subject?: string;
  from?: DireccionGraph;
  toRecipients?: DireccionGraph[];
  ccRecipients?: DireccionGraph[];
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
  hasAttachments?: boolean;
  bodyPreview?: string;
  webLink?: string;
}

function contiene(lista: DireccionGraph[] | undefined, correo: string): boolean {
  return (lista ?? []).some((d) => d.emailAddress?.address?.toLowerCase() === correo);
}

/**
 * Acepta una URL solo si es https.
 *
 * Graph devuelve `webLink` y en la práctica siempre apunta a outlook.office.com,
 * pero es un valor que llega de un servicio externo y termina en un atributo
 * href. Sin este filtro, un `javascript:` en esa respuesta sería un enlace
 * ejecutable en la página. Es el mismo criterio que el escapado del HTML del
 * correo: lo que viene de afuera no se confía.
 */
export function urlSegura(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Los correos de las últimas N horas, del más nuevo al más viejo.
 *
 * Se piden solo los campos que usa el resumen (`select`): traer el cuerpo
 * completo de 150 correos son megabytes y varios segundos por nada, porque igual
 * se recorta a bodyPreview.
 *
 * @param correoPropio La dirección de la persona, para poder distinguir lo que va
 *                     dirigido a ella de lo que le llegó en copia.
 */
export async function obtenerCorreosRecientes(
  accessToken: string | undefined,
  correoPropio: string,
  horas = HORAS_POR_DEFECTO,
): Promise<ResultadoCorreos> {
  if (!accessToken) return { estado: "sin_permiso" };

  try {
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
    const cliente = Client.init({ authProvider: (done) => done(null, accessToken) });

    const respuesta = await cliente
      .api("/me/mailFolders/inbox/messages")
      .header("Prefer", `outlook.timezone="${ZONA_HORARIA}"`)
      .filter(`receivedDateTime ge ${desde}`)
      .select(
        "subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,hasAttachments,bodyPreview,webLink",
      )
      .orderby("receivedDateTime desc")
      .top(TOPE_CORREOS)
      .get();

    const mensajes: MensajeGraph[] = respuesta.value ?? [];
    const propio = correoPropio.toLowerCase();

    const correos: CorreoResumen[] = mensajes.map((m) => {
      const enPara = contiene(m.toRecipients, propio);
      const enCc = contiene(m.ccRecipients, propio);
      return {
        id: m.id,
        asunto: m.subject?.trim() || "(Sin asunto)",
        de: m.from?.emailAddress?.name?.trim() || m.from?.emailAddress?.address || "(Desconocido)",
        correoDe: m.from?.emailAddress?.address ?? "",
        recibidoEn: m.receivedDateTime ?? "",
        leido: Boolean(m.isRead),
        marcado: m.flag?.flagStatus === "flagged",
        tieneAdjuntos: Boolean(m.hasAttachments),
        // El orden importa: estar en Para manda sobre estar además en CC.
        dirigido: enPara ? "a_mi" : enCc ? "en_copia" : "lista",
        destinatarios: (m.toRecipients ?? []).length + (m.ccRecipients ?? []).length,
        extracto: (m.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, LARGO_CUERPO),
        enlace: urlSegura(m.webLink),
      };
    });

    return {
      estado: "ok",
      correos,
      conteos: {
        total: correos.length,
        sinLeer: correos.filter((c) => !c.leido).length,
        aMi: correos.filter((c) => c.dirigido === "a_mi").length,
        enCopia: correos.filter((c) => c.dirigido === "en_copia").length,
        marcados: correos.filter((c) => c.marcado).length,
        horas,
        // Si volvieron exactamente TOPE_CORREOS, es casi seguro que hay más
        // atrás. Se avisa en pantalla en vez de dejar creer que se vio todo.
        recortado: correos.length >= TOPE_CORREOS,
      },
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
