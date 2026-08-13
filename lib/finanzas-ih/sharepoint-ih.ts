import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

// Mismo sitio de SharePoint que lib/sharepoint-facturas.ts (FINANZAS PERTEC),
// carpetas raiz nuevas segun lo acordado con el usuario: "FACTURAS IH" y
// "FACTURAS IL" (no reutiliza HISTORICO DE SII, que es solo de PERTEC SpA).
const CARPETA_RAIZ_POR_EMPRESA = {
  IH: "FINANZAS PERTEC/FINANZAS/FACTURAS IH",
  IL: "FINANZAS PERTEC/FINANZAS/FACTURAS IL",
} as const;

let credencial: ClientSecretCredential | null = null;

function obtenerCredencial(): ClientSecretCredential {
  if (!credencial) {
    credencial = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!
    );
  }
  return credencial;
}

async function clienteGraph(): Promise<Client> {
  const token = await obtenerCredencial().getToken(GRAPH_SCOPE);
  if (!token) throw new Error("No fue posible autenticar contra Microsoft Graph");
  return Client.init({ authProvider: (done) => done(null, token.token) });
}

const SITE_ID = () => process.env.SHAREPOINT_FACTURAS_SITE_ID!;

function codificarRuta(ruta: string): string {
  return ruta.split("/").map(encodeURIComponent).join("/");
}

export interface ArchivoSubidoIh {
  itemId: string;
  webUrl: string;
}

// Se descarga via el "@microsoft.graph.downloadUrl" (URL firmada) en vez de
// pedir el contenido directo por el SDK -- mismo patron que
// lib/sharepoint-facturas.ts#descargarBinarioArchivo.
export async function descargarBinarioArchivoIh(itemId: string): Promise<Buffer> {
  const graph = await clienteGraph();
  const item = await graph.api(`/sites/${SITE_ID()}/drive/items/${itemId}`).select("@microsoft.graph.downloadUrl").get();
  const downloadUrl = item?.["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) throw new Error(`No se pudo obtener downloadUrl para el item ${itemId}`);

  const respuesta = await fetch(downloadUrl);
  if (!respuesta.ok) throw new Error(`Descarga fallo (${respuesta.status}) para el item ${itemId}`);
  return Buffer.from(await respuesta.arrayBuffer());
}

// PUT a /drive/root:/{ruta}:/content crea las carpetas intermedias que
// falten (comportamiento estandar de Graph para archivos chicos, <4MB, que
// es el caso de un XML/PDF de un solo DTE) -- no hace falta crear "FACTURAS
// IH/2026/08/factura_afecta/" a mano antes de subir.
export async function subirArchivoIh(
  empresa: "IH" | "IL",
  tipoDocumento: string,
  anio: number,
  mes: number,
  nombreArchivo: string,
  contenido: Buffer | string
): Promise<ArchivoSubidoIh> {
  const ruta = `${CARPETA_RAIZ_POR_EMPRESA[empresa]}/${anio}/${String(mes).padStart(2, "0")}/${tipoDocumento}/${nombreArchivo}`;
  const graph = await clienteGraph();
  const resultado = await graph
    .api(`/sites/${SITE_ID()}/drive/root:/${codificarRuta(ruta)}:/content`)
    .put(contenido);
  return { itemId: resultado.id, webUrl: resultado.webUrl };
}
