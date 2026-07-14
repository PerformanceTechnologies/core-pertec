import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

// Sitio de SharePoint "FINANZASPERTEC" (mismo tenant que postular.pertec.cl,
// pero un sitio distinto): requiere que la misma App Registration
// (AZURE_CLIENT_ID) tenga el permiso de aplicacion Sites.Selected concedido
// TAMBIEN a este sitio -- eso se autoriza aparte, no lo hace este codigo.
// SHAREPOINT_FACTURAS_SITE_ID acepta el formato de direccionamiento por ruta
// de Graph, ej: "performancecl.sharepoint.com:/sites/FINANZASPERTEC", asi no
// hace falta resolver el GUID del sitio a mano.
const CARPETA_RAIZ = "FINANZAS PERTEC/FINANZAS/HISTORICO DE SII";
const CARPETA_VENTAS = `${CARPETA_RAIZ}/XML_SII`; // XML, ver lib/xml-dte.ts
const CARPETA_COMPRAS = `${CARPETA_RAIZ}/DTE_SII`; // PDF, ver lib/indexador-facturas-compra.ts

export function credencialesGraphFacturasConfiguradas(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.SHAREPOINT_FACTURAS_SITE_ID
  );
}

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
  return Client.init({
    authProvider: (done) => done(null, token.token),
  });
}

const SITE_ID = () => process.env.SHAREPOINT_FACTURAS_SITE_ID!;

function codificarRuta(ruta: string): string {
  // Graph acepta la ruta despues de "root:/" con cada segmento URL-encoded
  // (los espacios y acentos de "FINANZAS PERTEC", "HISTORICO DE SII" rompen
  // la llamada si van sin codificar).
  return ruta.split("/").map(encodeURIComponent).join("/");
}

export interface CarpetaAnioMes {
  anio: number;
  mes: number; // 1-12
  itemId: string;
}

// Lista las subcarpetas de anio (ej. "2023", "2024") y, dentro de cada una,
// las de mes -- sin asumir si el mes viene como "01" o "01 Enero" (DTE_SII y
// XML_SII usan convenciones distintas), asi que se parsea solo el prefijo
// numerico del nombre.
export async function listarCarpetasAnioMes(carpetaBase: "ventas" | "compras"): Promise<CarpetaAnioMes[]> {
  const graph = await clienteGraph();
  const ruta = carpetaBase === "ventas" ? CARPETA_VENTAS : CARPETA_COMPRAS;
  const resultado: CarpetaAnioMes[] = [];

  const aniosResp = await graph
    .api(`/sites/${SITE_ID()}/drive/root:/${codificarRuta(ruta)}:/children`)
    .select("id,name,folder")
    .get();

  for (const carpetaAnio of aniosResp?.value ?? []) {
    if (!carpetaAnio.folder) continue;
    const anio = Number(carpetaAnio.name);
    if (!Number.isInteger(anio)) continue; // ignora carpetas sueltas (ej. exports viejos)

    const mesesResp = await graph
      .api(`/sites/${SITE_ID()}/drive/items/${carpetaAnio.id}/children`)
      .select("id,name,folder")
      .get();

    for (const carpetaMes of mesesResp?.value ?? []) {
      if (!carpetaMes.folder) continue;
      const mes = Number(String(carpetaMes.name).trim().slice(0, 2));
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) continue;
      resultado.push({ anio, mes, itemId: carpetaMes.id });
    }
  }

  return resultado;
}

export interface ArchivoCarpeta {
  id: string;
  nombre: string;
  webUrl: string;
  ultimaModificacion: string;
}

export async function listarArchivosDeCarpeta(itemId: string): Promise<ArchivoCarpeta[]> {
  const graph = await clienteGraph();
  const archivos: ArchivoCarpeta[] = [];
  let siguiente: string | undefined = `/sites/${SITE_ID()}/drive/items/${itemId}/children?$select=id,name,webUrl,lastModifiedDateTime,file&$top=200`;

  while (siguiente) {
    const resp = await graph.api(siguiente).get();
    for (const item of resp?.value ?? []) {
      if (!item.file) continue;
      archivos.push({
        id: item.id,
        nombre: item.name,
        webUrl: item.webUrl,
        ultimaModificacion: item.lastModifiedDateTime,
      });
    }
    siguiente = resp?.["@odata.nextLink"];
  }

  return archivos;
}

// Se descarga via el "@microsoft.graph.downloadUrl" (URL firmada, valida
// unos minutos) en vez de pedir el contenido directo por el SDK: asi el
// binario se trae con un fetch plano y se controla la codificacion, sin
// depender de como cada version del SDK maneje streams en Node.
async function descargarBuffer(itemId: string): Promise<Buffer> {
  const graph = await clienteGraph();
  const item = await graph
    .api(`/sites/${SITE_ID()}/drive/items/${itemId}`)
    .select("@microsoft.graph.downloadUrl")
    .get();
  const downloadUrl = item?.["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) throw new Error(`No se pudo obtener downloadUrl para el item ${itemId}`);

  const respuesta = await fetch(downloadUrl);
  if (!respuesta.ok) throw new Error(`Descarga fallo (${respuesta.status}) para el item ${itemId}`);
  return Buffer.from(await respuesta.arrayBuffer());
}

export async function descargarContenidoArchivo(itemId: string): Promise<string> {
  const buffer = await descargarBuffer(itemId);
  return buffer.toString("latin1"); // los XML del SII vienen en ISO-8859-1
}

export async function descargarBinarioArchivo(itemId: string): Promise<Buffer> {
  return descargarBuffer(itemId);
}

// NOTA: se probo usar la busqueda de contenido de Microsoft Graph
// (driveItem: search) acotada a esta carpeta, pero devuelve
// "generalException" (500) de forma consistente cuando la app solo tiene el
// permiso Sites.Selected (confirmado en vivo contra este sitio) -- no es
// viable. La busqueda de compras se resuelve indexando el texto de cada PDF
// en Supabase, ver lib/indexador-facturas-compra.ts y
// facturas-historicas.ts#buscarFacturasCompraIndexadas (que exporta el tipo
// ResultadoBusquedaCompra).
