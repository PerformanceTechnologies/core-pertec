import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
// soporte@pertec.cl es una lista de distribucion, no un buzon: no se puede
// usar como remitente en Graph, solo como destinatario. El envio real se
// hace desde el buzon de Hugo.
const CORREO_REMITENTE = "hugo.antivil@pertec.cl";
const CORREO_SOPORTE = "soporte@pertec.cl";

// Usa el app registration "PERTEC Web · Envio de correos" (el mismo que ya
// usa la Edge Function send-catalog de pertec-web con MS_TENANT_ID/
// MS_CLIENT_ID/MS_CLIENT_SECRET) — ya tiene el permiso de aplicacion
// "Mail.Send" concedido, a diferencia del app de /reclutamiento que solo
// tiene permisos de SharePoint. Client ID: 6f8ce670-8b60-471a-aa01-d33cd280a453.
let credencial: ClientSecretCredential | null = null;

function obtenerCredencial(): ClientSecretCredential {
  if (!credencial) {
    credencial = new ClientSecretCredential(
      process.env.MS_TENANT_ID!,
      process.env.MS_CLIENT_ID!,
      process.env.MS_CLIENT_SECRET!
    );
  }
  return credencial;
}

export async function enviarCorreoSoporte(asunto: string, cuerpoTexto: string): Promise<void> {
  const token = await obtenerCredencial().getToken(GRAPH_SCOPE);
  if (!token) throw new Error("No fue posible autenticar contra Microsoft Graph para enviar el correo.");

  const graph = Client.init({ authProvider: (done) => done(null, token.token) });
  await graph.api(`/users/${CORREO_REMITENTE}/sendMail`).post({
    message: {
      subject: asunto,
      body: { contentType: "Text", content: cuerpoTexto },
      toRecipients: [{ emailAddress: { address: CORREO_SOPORTE } }],
    },
  });
}
