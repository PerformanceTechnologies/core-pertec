// Avisa por correo a soporte cuando falla el respaldo. Sin dependencias: solo Node 18+ (fetch).
//
//   node scripts/respaldo/avisar-fallo.mjs "<proyecto o resumen>" "<enlace a la ejecución>"   (--simular: no envía)
//
// Mismo camino que el Core usa para sus avisos (lib/notificaciones.ts): Microsoft Graph con permisos de
// APLICACIÓN y el app registration "PERTEC Web - Envio de correos", el único con Mail.Send. Variables, que ya
// existen como secrets de GitHub: MS_TENANT_ID (o AZURE_TENANT_ID), MS_CLIENT_ID, MS_CLIENT_SECRET.
//
// Si el aviso mismo falla, no se oculta: el paso del workflow queda en rojo y GitHub avisa además por su cuenta.

const simular = process.argv.includes("--simular");
const [resumen = "desconocido", enlace = "(sin enlace)"] = process.argv.slice(2).filter((a) => a !== "--simular");

// soporte@ es una lista de distribución, no un buzón: no sirve de remitente (ver lib/notificaciones.ts).
const REMITENTE = "hugo.antivil@pertec.cl";
const DESTINO = "soporte@pertec.cl";

const asunto = `Respaldo de Supabase FALLÓ: ${resumen}`;
const cuerpo = `El respaldo automático diario de Supabase no se completó.

Qué falló: ${resumen}
Ejecución: ${enlace}

Qué hacer:
1. Abre la ejecución, mira el paso que quedó en rojo y lee el mensaje.
2. Si es un problema pasajero (red, Supabase, SharePoint), vuelve a lanzarlo con "Run workflow".
3. Mientras no haya un respaldo bueno de hoy, el último correcto sigue en la carpeta de respaldos de SharePoint.
`;

console.log(`${simular ? "[simulación] " : ""}aviso a ${DESTINO}: ${asunto}`);
if (simular) process.exit(0);

try {
  const tenant = process.env.MS_TENANT_ID || process.env.AZURE_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const secreto = process.env.MS_CLIENT_SECRET;
  if (!tenant || !clientId || !secreto) throw new Error("Faltan MS_TENANT_ID/AZURE_TENANT_ID, MS_CLIENT_ID o MS_CLIENT_SECRET");

  const t = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secreto.trim(),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!t.ok) throw new Error(`token de Graph: HTTP ${t.status}`);
  const { access_token } = await t.json();

  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${REMITENTE}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject: asunto, body: { contentType: "Text", content: cuerpo }, toRecipients: [{ emailAddress: { address: DESTINO } }] },
      saveToSentItems: false,
    }),
  });
  if (!r.ok) throw new Error(`sendMail: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  console.log("aviso enviado");
} catch (e) {
  console.error(`No se pudo enviar el aviso: ${e.message}`);
  process.exit(1);
}
