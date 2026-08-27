import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";

/**
 * Mandar la oferta por correo, desde la cuenta de quien la emite.
 *
 * Delegado y no de aplicación, a propósito: una oferta a un cliente la firma una
 * persona. Sale desde su cuenta, queda en SUS elementos enviados y si el cliente
 * responde, le responde a ella. Un remitente de sistema —"no-reply@"— en una oferta
 * comercial es exactamente lo contrario de lo que se quiere.
 *
 * El scope `Mail.Send` ya está en SCOPES_GRAPH (lib/graph-token.ts) porque el resumen
 * diario lo usa, así que no hace falta un consentimiento nuevo. Lo que sí hace falta
 * es que la persona tenga su cuenta conectada; sin eso, esta función no se llama y la
 * pantalla lo dice.
 *
 * ── Los dos caminos del adjunto ────────────────────────────────────────────
 *
 * Graph acepta el adjunto dentro del mismo JSON de sendMail solo si el mensaje
 * completo queda por debajo de ~4 MB, y en base64 un PDF crece un tercio. Una oferta
 * con nueve fotos pasa ese límite sin esfuerzo, y ahí sendMail devuelve un error que
 * no dice nada útil. Así que arriba de 3 MB se arma un BORRADOR, se le sube el
 * archivo por sesión y después se manda: más pasos, pero es el único camino que
 * funciona con el archivo que de verdad produce este módulo.
 */

/** A partir de acá el adjunto no entra en el JSON de sendMail. */
const TOPE_ADJUNTO_DIRECTO = 3 * 1024 * 1024;

export interface EnvioDeOferta {
  destinatarios: string[];
  copias?: string[];
  asunto: string;
  /** Texto plano; se convierte a HTML respetando los saltos de línea. */
  cuerpo: string;
  nombreArchivo: string;
  pdf: Buffer;
}

function cuerpoHtml(texto: string): string {
  const escapado = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#171411;white-space:pre-wrap">${escapado}</div>`;
}

export async function enviarOfertaPorCorreo(accessToken: string, envio: EnvioDeOferta): Promise<void> {
  if (envio.destinatarios.length === 0) throw new Error("No hay destinatarios.");
  const cliente = Client.init({ authProvider: (done) => done(null, accessToken) });

  const mensaje = {
    subject: envio.asunto,
    body: { contentType: "HTML", content: cuerpoHtml(envio.cuerpo) },
    toRecipients: envio.destinatarios.map((address) => ({ emailAddress: { address } })),
    ccRecipients: (envio.copias ?? []).map((address) => ({ emailAddress: { address } })),
  };

  if (envio.pdf.length <= TOPE_ADJUNTO_DIRECTO) {
    await cliente.api("/me/sendMail").post({
      message: {
        ...mensaje,
        attachments: [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: envio.nombreArchivo,
            contentType: "application/pdf",
            contentBytes: envio.pdf.toString("base64"),
          },
        ],
      },
      // A diferencia del resumen diario, este SÍ queda en enviados: es un correo a un
      // cliente y tiene que poder encontrarse después.
      saveToSentItems: true,
    });
    return;
  }

  // Adjunto grande: borrador, sesión de subida, y recién ahí enviar.
  const borrador = await cliente.api("/me/messages").post(mensaje);
  const sesion = await cliente.api(`/me/messages/${borrador.id}/attachments/createUploadSession`).post({
    AttachmentItem: {
      attachmentType: "file",
      name: envio.nombreArchivo,
      size: envio.pdf.length,
      contentType: "application/pdf",
    },
  });

  const respuesta = await fetch(sesion.uploadUrl as string, {
    method: "PUT",
    headers: {
      "Content-Length": String(envio.pdf.length),
      "Content-Range": `bytes 0-${envio.pdf.length - 1}/${envio.pdf.length}`,
    },
    body: new Uint8Array(envio.pdf),
  });
  if (!respuesta.ok) {
    // El borrador queda en el buzón; se borra para no dejar basura en Borradores de
    // alguien por un envío que no salió.
    await cliente
      .api(`/me/messages/${borrador.id}`)
      .delete()
      .catch(() => {});
    throw new Error(`No se pudo adjuntar el PDF (HTTP ${respuesta.status}).`);
  }

  await cliente.api(`/me/messages/${borrador.id}/send`).post({});
}
