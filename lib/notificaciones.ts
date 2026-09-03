import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
// soporte@pertec.cl es una lista de distribucion, no un buzon: no se puede
// usar como remitente en Graph, solo como destinatario. El envio real se
// hace desde el buzon de Hugo.
const CORREO_REMITENTE = "hugo.antivil@pertec.cl";
const CORREO_SOPORTE = "soporte@pertec.cl";
/**
 * Exportada solo para poder DECIR a quien se le mando, no para elegirlo: sigue siendo una
 * constante de este archivo. Ver el comentario de enviar().
 */
export const CORREO_FINANZAS = "finanzas@pertec.cl";

/**
 * A donde va un envio de PRUEBA del aviso, para revisar la plantilla.
 *
 * Una direccion externa a proposito: sirve para ver como llega el correo FUERA del tenant
 * —si Gmail lo marca como no deseado, si el remitente se ve raro, como queda el texto sin
 * el formato de Outlook—, y eso no se puede probar mandandoselo a una casilla de la casa.
 *
 * Es una CONSTANTE, como las otras dos, y esa es la parte que importa: la prueba no
 * introduce un destinatario que se pueda elegir desde la pantalla. Un aviso automatico
 * que le pueda llegar a cualquier direccion es una fuga esperando el dia que alguien
 * edite la fila equivocada, y eso no cambia porque uno de los usos sea una prueba.
 *
 * Se puede borrar cuando la plantilla este aprobada; nada automatico lo usa.
 */
export const CORREO_PRUEBA = "aoliva867@gmail.com";

// Usa el app registration "PERTEC Web · Envio de correos" (el mismo que ya usa la Edge
// Function send-catalog de pertec-web) — es el unico con el permiso de APLICACION
// "Mail.Send" concedido, a diferencia del app de /reclutamiento (AZURE_*) que solo tiene
// permisos de SharePoint. Por eso el client id no se puede intercambiar por el otro.
//
// De tres variables quedo UNA obligatoria, y no por comodidad: durante meses el envio no
// funciono porque MS_TENANT_ID nunca se cargo en Vercel. Nadie se enteraba, porque lo
// unico que usa este archivo son avisos automaticos —el fallo del cron a soporte, el
// reclamo de una factura a Finanzas— y el error se atrapaba en un console.error. Se
// descubrio recien cuando nueve facturas reclamadas por $121 millones se dieron por
// avisadas y no llego nada. Cuantos menos valores haya que cargar a mano, menos veces
// vuelve a pasar.

/** El client id del app de correo. Publico —esta en .env.example— y no es un secreto. */
const CLIENT_ID_CORREO = "6f8ce670-8b60-471a-aa01-d33cd280a453";

/**
 * Un GUID: ocho-cuatro-cuatro-cuatro-doce, en hexadecimal.
 *
 * En la pantalla de Entra, "Secret ID" y "Value" son dos columnas pegadas de la misma
 * fila, y el ID es lo que queda a mano. Copiar el ID es EL error de esa pantalla —tanto
 * que Azure lo pone en su propio mensaje: "Ensure the secret being sent in the request is
 * the client secret value, not the client secret ID"—. Un Value nunca tiene esta forma.
 */
const FORMA_DE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El tenant, que es UNO para toda la empresa aunque se lo nombre de tres formas.
 *
 * MS_TENANT_ID, AZURE_TENANT_ID y el tenant que va adentro del issuer de la
 * autenticacion son el mismo GUID. Tener tres variables para un solo valor es como se
 * llego a que una este vacia mientras las otras dos funcionan.
 */
function tenantId(): string | null {
  const directo = process.env.MS_TENANT_ID || process.env.AZURE_TENANT_ID;
  if (directo) return directo;
  // https://login.microsoftonline.com/<tenant-id>/v2.0
  const enIssuer = /login\.microsoftonline\.com\/([0-9a-fA-F-]{36})/.exec(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? ""
  );
  return enIssuer ? enIssuer[1] : null;
}

let credencial: ClientSecretCredential | null = null;

/**
 * La credencial, o un error que diga QUE falta.
 *
 * El SDK de Azure, con el tenant vacio, contesta "ClientSecretCredential: tenantId is a
 * required parameter" y un link a su troubleshooting. Eso no dice de que variable habla
 * ni en que proyecto, y fue lo que se vio en pantalla.
 */
function obtenerCredencial(): ClientSecretCredential {
  if (!credencial) {
    const tenant = tenantId();
    const secreto = process.env.MS_CLIENT_SECRET;
    if (!tenant) {
      throw new Error(
        "No se puede enviar el correo: falta el tenant de Microsoft en el entorno. " +
          "Cargá MS_TENANT_ID (o AZURE_TENANT_ID, es el mismo GUID) en Vercel.",
      );
    }
    if (!secreto) {
      throw new Error(
        "No se puede enviar el correo: falta MS_CLIENT_SECRET en el entorno de Vercel. " +
          `Es el secreto del app registration "PERTEC Web · Envio de correos" (client id ` +
          `${CLIENT_ID_CORREO}), el único con el permiso de aplicación Mail.Send — el de ` +
          "AZURE_* solo tiene SharePoint y no sirve para esto.",
      );
    }
    // Antes de llamar a Azure, porque este es el error de esa pantalla y la respuesta de
    // Azure llega envuelta en un AADSTS7000215 con dos Trace ID y un Correlation ID.
    // Nunca se pone el valor en el mensaje: lo único que se dice es la forma que tiene.
    if (FORMA_DE_GUID.test(secreto.trim())) {
      throw new Error(
        "El MS_CLIENT_SECRET cargado tiene forma de GUID, así que es el «Secret ID» y no " +
          "el «Value». En Entra son dos columnas pegadas de la misma fila del secreto y " +
          "el Value se muestra UNA sola vez: si ya se cerró esa pantalla, hay que crear " +
          "otro secreto y copiar la columna Value.",
      );
    }
    // Un espacio o un salto de línea pegado por accidente no lo perdona Azure y el error
    // que devuelve es el mismo "Invalid client secret provided", que no lo insinúa.
    credencial = new ClientSecretCredential(
      tenant,
      process.env.MS_CLIENT_ID || CLIENT_ID_CORREO,
      secreto.trim(),
    );
  }
  return credencial;
}

/**
 * Un correo de sistema, desde el buzon de siempre.
 *
 * El destinatario es un parametro pero NO viene de ningun formulario ni de la base: los
 * dos posibles son constantes de este archivo. Un aviso automatico que le pueda llegar a
 * cualquier direccion es una fuga esperando el dia que alguien edite la fila equivocada.
 */
/**
 * Que FORMA tiene el secreto que esta cargado EN ESTE DEPLOYMENT. Nunca su contenido.
 *
 * Se agrega al error cuando Azure rechaza la credencial, porque "Invalid client secret
 * provided" no distingue las tres cosas que pueden estar pasando, y son muy distintas de
 * arreglar:
 *
 *  - el valor es otro (se copio el Secret ID, o el secreto de otro app),
 *  - el valor esta incompleto (la pantalla de Entra lo muestra truncado con puntos
 *    suspensivos, y seleccionarlo con el mouse en vez de usar el boton de copiar se lleva
 *    un pedazo),
 *  - el valor es correcto pero ESTE deployment no lo tiene: en Vercel las variables son
 *    una foto por deployment, asi que guardarla no alcanza si no se vuelve a desplegar
 *    despues de guardarla.
 *
 * El largo lo decide: un Value completo son 40 caracteres con un "~". Cuarenta y rechazado
 * es "el valor es otro"; menos, "esta cortado"; cero, "no llego a este deployment".
 *
 * El largo y si tiene "~" no alcanzan para reconstruir nada, y esto solo lo ve quien ya
 * puede mandar el correo.
 */
function formaDelSecreto(): string {
  const secreto = (process.env.MS_CLIENT_SECRET ?? "").trim();
  if (!secreto) return "no hay MS_CLIENT_SECRET cargado";
  const partes = [`${secreto.length} caracteres`];
  partes.push(secreto.includes("~") ? 'contiene "~"' : 'NO contiene "~"');
  if (secreto.endsWith("...") || secreto.endsWith("…")) partes.push("TERMINA EN PUNTOS SUSPENSIVOS");
  return partes.join(", ");
}

async function enviar(destinatario: string, asunto: string, cuerpoTexto: string): Promise<void> {
  let token;
  try {
    token = await obtenerCredencial().getToken(GRAPH_SCOPE);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    // AADSTS7000215 es "secreto invalido", y el caso mas comun no es que este mal sino que
    // este INCOMPLETO. El mensaje de Azure no lo insinua; la forma del valor cargado si.
    if (/7000215|invalid_client/i.test(detalle)) {
      throw new Error(
        "Microsoft rechazó el secreto del app de correo. El MS_CLIENT_SECRET que tiene " +
          `ESTE deployment: ${formaDelSecreto()}. Un Value completo son 40 caracteres con ` +
          '"~". Si dice 40 y aun así lo rechazan, el valor es de otro secreto o de otro ' +
          "app; si dice menos, se copió cortado; si dice que no hay ninguno, la variable " +
          "se guardó pero no se volvió a desplegar —en Vercel son una foto por " +
          `deployment—. Detalle de Microsoft: ${detalle}`,
      );
    }
    throw error;
  }
  if (!token) throw new Error("No fue posible autenticar contra Microsoft Graph para enviar el correo.");

  const graph = Client.init({ authProvider: (done) => done(null, token.token) });
  await graph.api(`/users/${CORREO_REMITENTE}/sendMail`).post({
    message: {
      subject: asunto,
      body: { contentType: "Text", content: cuerpoTexto },
      toRecipients: [{ emailAddress: { address: destinatario } }],
    },
  });
}

export async function enviarCorreoSoporte(asunto: string, cuerpoTexto: string): Promise<void> {
  return enviar(CORREO_SOPORTE, asunto, cuerpoTexto);
}

/** Para lo que tiene que mirar Finanzas, no Soporte: una factura reclamada, por ejemplo. */
export async function enviarCorreoFinanzas(asunto: string, cuerpoTexto: string): Promise<void> {
  return enviar(CORREO_FINANZAS, asunto, cuerpoTexto);
}

/**
 * El mismo correo, a la direccion de prueba. Ver CORREO_PRUEBA.
 *
 * Sin prefijo ni aclaracion en el texto: la idea es ver EXACTAMENTE lo que va a recibir
 * Finanzas. Que es una prueba lo dice el boton que lo manda, no el correo.
 */
export async function enviarCorreoDePrueba(asunto: string, cuerpoTexto: string): Promise<void> {
  return enviar(CORREO_PRUEBA, asunto, cuerpoTexto);
}
