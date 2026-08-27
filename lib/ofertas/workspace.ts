import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

/**
 * Guardar la oferta emitida en el workspace (SharePoint).
 *
 * Mismo camino que ya usa Finanzas IH para archivar sus documentos
 * (lib/finanzas-ih/sharepoint-ih.ts): permiso de APLICACIÓN, no la cuenta de quien
 * emite. Es a propósito y conviene tenerlo claro: el archivo tiene que quedar en la
 * biblioteca de la empresa aunque la persona que emitió se vaya, y no depende de que
 * cada uno tenga acceso al sitio.
 *
 * El sitio se puede configurar aparte del de facturas. Sin `SHAREPOINT_OFERTAS_SITE_ID`
 * usa el mismo sitio que Finanzas —que es el único que hoy está cargado— y eso es
 * mejor que fallar, pero lo correcto es darle el suyo.
 */

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

/** La carpeta raíz de las ofertas dentro de la biblioteca del sitio. */
const CARPETA_RAIZ = "OFERTAS TÉCNICAS";

let credencial: ClientSecretCredential | null = null;

function obtenerCredencial(): ClientSecretCredential {
  if (!credencial) {
    const tenant = process.env.AZURE_TENANT_ID;
    const cliente = process.env.AZURE_CLIENT_ID;
    const secreto = process.env.AZURE_CLIENT_SECRET;
    if (!tenant || !cliente || !secreto) {
      throw new Error("Faltan AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET.");
    }
    credencial = new ClientSecretCredential(tenant, cliente, secreto);
  }
  return credencial;
}

function sitio(): string {
  const id = process.env.SHAREPOINT_OFERTAS_SITE_ID ?? process.env.SHAREPOINT_FACTURAS_SITE_ID;
  if (!id) throw new Error("Falta SHAREPOINT_OFERTAS_SITE_ID (o SHAREPOINT_FACTURAS_SITE_ID).");
  return id;
}

async function clienteGraph(): Promise<Client> {
  const token = await obtenerCredencial().getToken(GRAPH_SCOPE);
  if (!token) throw new Error("No fue posible autenticar contra Microsoft Graph.");
  return Client.init({ authProvider: (done) => done(null, token.token) });
}

function codificarRuta(ruta: string): string {
  return ruta.split("/").map(encodeURIComponent).join("/");
}

export interface OfertaEnWorkspace {
  webUrl: string;
  ruta: string;
}

/**
 * Sube el PDF y devuelve dónde quedó.
 *
 * `PUT /drive/root:/{ruta}:/content` crea las carpetas intermedias que falten, así
 * que no hace falta crear "OFERTAS TÉCNICAS/2026/" a mano. Vale para archivos de
 * hasta 4 MB; arriba de eso Graph pide una sesión de subida, y una oferta con fotos
 * los pasa, así que están los dos caminos.
 */
export async function guardarOfertaEnWorkspace(
  anio: number,
  nombreArchivo: string,
  pdf: Buffer,
): Promise<OfertaEnWorkspace> {
  const ruta = `${CARPETA_RAIZ}/${anio}/${nombreArchivo}`;
  const graph = await clienteGraph();
  const destino = `/sites/${sitio()}/drive/root:/${codificarRuta(ruta)}:`;

  if (pdf.length <= 4 * 1024 * 1024) {
    const resultado = await graph.api(`${destino}/content`).put(pdf);
    return { webUrl: resultado.webUrl as string, ruta };
  }

  // Sesión de subida para los grandes: se pide la sesión, se manda el archivo de una
  // sola vez —Graph acepta un rango único hasta 60 MB— y la respuesta final trae el
  // item creado. Se reemplaza si ya existía: emitir dos veces la misma oferta tiene
  // que dejar un archivo, no dos con "(1)" al final.
  const sesion = await graph
    .api(`${destino}/createUploadSession`)
    .post({ item: { "@microsoft.graph.conflictBehavior": "replace" } });

  const respuesta = await fetch(sesion.uploadUrl as string, {
    method: "PUT",
    headers: {
      "Content-Length": String(pdf.length),
      "Content-Range": `bytes 0-${pdf.length - 1}/${pdf.length}`,
    },
    body: new Uint8Array(pdf),
  });
  if (!respuesta.ok) {
    throw new Error(`La subida al workspace falló (HTTP ${respuesta.status}).`);
  }
  const item = (await respuesta.json()) as { webUrl?: string };
  return { webUrl: item.webUrl ?? "", ruta };
}
