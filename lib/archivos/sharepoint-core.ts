import "server-only";
import { randomUUID } from "node:crypto";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

// -----------------------------------------------------------------------------
//  Los documentos del Core viven en SharePoint (sitio COREPERTEC, carpeta «ARCHIVOS CORE»).
//  Supabase guarda solo los datos y, en vez de una ruta de bucket, una referencia «sp:<id>».
//
//  Permiso de APLICACIÓN (AZURE_*), no la cuenta de quien sube: el archivo tiene que quedar
//  en la biblioteca de la empresa aunque esa persona se vaya, y subir no puede depender de
//  que cada uno haya conectado SharePoint. Esa app tiene Sites.Selected: un administrador
//  le tiene que dar permiso de escritura sobre COREPERTEC (no lo hace este código).
//
//  Se apunta a los archivos por su id de Graph y no por su ruta: si alguien los mueve o
//  renombra dentro de SharePoint, el Core los sigue encontrando.
// -----------------------------------------------------------------------------

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
/** Arriba de esto se sube por sesión de carga: el PUT simple de Graph acepta hasta 4 MB. */
const TOPE_PUT_SIMPLE = 3.5 * 1024 * 1024;

export const PREFIJO_SP = "sp:";
const ID_DE_ITEM = /^[A-Za-z0-9!_-]{10,120}$/;

export function esReferenciaSharePoint(ruta: string | null | undefined): boolean {
  return typeof ruta === "string" && ruta.startsWith(PREFIJO_SP);
}

/** El id de Graph de una referencia «sp:<id>», validado (viene de la base, pero termina en una URL). */
export function idDeReferencia(ref: string): string {
  const id = ref.slice(PREFIJO_SP.length);
  if (!ID_DE_ITEM.test(id)) throw new Error("Referencia de archivo inválida.");
  return id;
}

export function esIdDeItem(id: string): boolean {
  return ID_DE_ITEM.test(id);
}

function sitioConfigurado(): string {
  return (process.env.SHAREPOINT_CORE_SITIO || "performancecl.sharepoint.com:/sites/COREPERTEC").trim();
}

function carpetaRaiz(): string {
  return (process.env.SHAREPOINT_CORE_CARPETA || "ARCHIVOS CORE").trim().replace(/^\/+|\/+$/g, "");
}

export function sharePointConfigurado(): boolean {
  return Boolean(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

let credencial: ClientSecretCredential | null = null;

async function cliente(): Promise<Client> {
  if (!credencial) {
    if (!sharePointConfigurado()) throw new Error("Faltan AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET.");
    credencial = new ClientSecretCredential(process.env.AZURE_TENANT_ID!, process.env.AZURE_CLIENT_ID!, process.env.AZURE_CLIENT_SECRET!);
  }
  const token = await credencial.getToken(GRAPH_SCOPE);
  if (!token) throw new Error("No fue posible autenticar contra Microsoft Graph.");
  return Client.init({ authProvider: (done) => done(null, token.token) });
}

// El sitio se pide UNA vez por su ruta y después se usa su id compuesto: encadenar
// `/drive/root:/…` detrás de una ruta `host:/sites/X` confunde al analizador de Graph
// (ver lib/contratos/sharepoint.ts).
let idSitio: string | null = null;
async function sitio(graph: Client): Promise<string> {
  if (idSitio) return idSitio;
  const configurado = sitioConfigurado();
  if (!configurado.includes(":")) return (idSitio = configurado);
  const datos = await graph.api(`/sites/${configurado}`).select("id").get();
  if (!datos?.id) throw new Error(`SharePoint no devolvió el sitio «${configurado}».`);
  return (idSitio = datos.id as string);
}

function codificarRuta(ruta: string): string {
  return ruta.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/**
 * Un nombre que SharePoint acepta: sin los caracteres que prohíbe (" * : < > ? / \ |),
 * sin puntos ni espacios al borde y con un largo razonable. La extensión se respeta.
 */
export function nombreSeguro(nombre: string, extensionPorDefecto = "bin"): string {
  const limpio = nombre.normalize("NFC").replace(/["*:<>?/\\|#%\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "");
  const punto = limpio.lastIndexOf(".");
  const base = (punto > 0 ? limpio.slice(0, punto) : limpio).slice(0, 80) || "archivo";
  const ext = (punto > 0 ? limpio.slice(punto + 1) : extensionPorDefecto).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || extensionPorDefecto;
  return `${base}.${ext}`;
}

/**
 * El nombre con que queda en SharePoint: un prefijo corto al azar (dos «boleta.pdf» no chocan)
 * más el nombre original, para que en la biblioteca se reconozca qué es cada archivo.
 */
export function nombreUnico(original: string | null | undefined, extension: string): string {
  const base = (original ?? "").replace(/\.[^.]*$/, "").trim() || "archivo";
  return nombreSeguro(`${randomUUID().slice(0, 8)} ${base}.${extension}`, extension);
}

/** Una carpeta del Core («Tareas/<id>») como ruta segura dentro de la carpeta raíz. */
function rutaCompleta(carpeta: string, nombre?: string): string {
  const partes = carpeta.split("/").map((p) => p.replace(/["*:<>?\\|#%\u0000-\u001f]/g, "_").trim()).filter((p) => p && p !== "." && p !== "..");
  return [carpetaRaiz(), ...partes, ...(nombre ? [nombre] : [])].join("/");
}

/**
 * Sube un archivo a «ARCHIVOS CORE/<carpeta>/<nombre>» y devuelve la referencia «sp:<id>».
 * Las carpetas que falten se crean solas; si el nombre ya existe, SharePoint lo renombra
 * (o lo reemplaza, con `reemplazar`: el mismo archivo, con el mismo id, y la versión anterior
 * queda en el historial de versiones del sitio).
 */
export async function subirASharePoint(carpeta: string, nombre: string, contenido: Buffer, tipo: string, reemplazar = false): Promise<string> {
  const conflicto = reemplazar ? "replace" : "rename";
  const graph = await cliente();
  const s = await sitio(graph);
  const ruta = codificarRuta(rutaCompleta(carpeta, nombre));

  if (contenido.length <= TOPE_PUT_SIMPLE) {
    const item = await graph
      .api(`/sites/${s}/drive/root:/${ruta}:/content`)
      .query({ "@microsoft.graph.conflictBehavior": conflicto })
      .header("Content-Type", tipo || "application/octet-stream")
      .put(contenido);
    if (!item?.id) throw new Error("SharePoint no devolvió el archivo subido.");
    return `${PREFIJO_SP}${item.id}`;
  }

  // Archivo grande: sesión de carga, en trozos de 5 MiB (múltiplo de 320 KiB, como pide Graph).
  const sesion = await graph
    .api(`/sites/${s}/drive/root:/${ruta}:/createUploadSession`)
    .post({ item: { "@microsoft.graph.conflictBehavior": conflicto } });
  const url = sesion?.uploadUrl as string | undefined;
  if (!url) throw new Error("SharePoint no abrió la sesión de carga.");
  const TROZO = 16 * 320 * 1024;
  let item: { id?: string } | null = null;
  for (let desde = 0; desde < contenido.length; desde += TROZO) {
    const hasta = Math.min(desde + TROZO, contenido.length);
    const r = await fetch(url, {
      method: "PUT",
      headers: { "Content-Length": String(hasta - desde), "Content-Range": `bytes ${desde}-${hasta - 1}/${contenido.length}` },
      body: new Uint8Array(contenido.subarray(desde, hasta)),
    });
    if (!r.ok && r.status !== 202) throw new Error(`SharePoint rechazó un trozo del archivo (HTTP ${r.status}).`);
    if (r.status === 200 || r.status === 201) item = await r.json();
  }
  if (!item?.id) throw new Error("SharePoint no confirmó el archivo subido.");
  return `${PREFIJO_SP}${item.id}`;
}

export interface ArchivoBajado {
  contenido: Buffer;
  tipo: string;
  nombre: string;
}

/** El contenido de un archivo, por su referencia. */
export async function bajarDeSharePoint(ref: string): Promise<ArchivoBajado> {
  const r = await abrirDeSharePoint(ref);
  return { contenido: Buffer.from(await r.respuesta.arrayBuffer()), tipo: r.tipo, nombre: r.nombre };
}

/** La respuesta de descarga sin leerla (para devolverla en streaming), con su tipo y nombre. */
export async function abrirDeSharePoint(ref: string): Promise<{ respuesta: Response; tipo: string; nombre: string; tamano: number }> {
  const graph = await cliente();
  const s = await sitio(graph);
  const item = await graph
    .api(`/sites/${s}/drive/items/${encodeURIComponent(idDeReferencia(ref))}`)
    .select("id,name,size,file,@microsoft.graph.downloadUrl")
    .get();
  const url = item?.["@microsoft.graph.downloadUrl"] as string | undefined;
  if (!url) throw new Error("SharePoint no entregó el enlace de descarga.");
  const respuesta = await fetch(url, { cache: "no-store" });
  if (!respuesta.ok || !respuesta.body) throw new Error(`La descarga desde SharePoint falló (HTTP ${respuesta.status}).`);
  return { respuesta, tipo: item?.file?.mimeType || "application/octet-stream", nombre: item?.name || "archivo", tamano: Number(item?.size ?? 0) };
}

/** Manda archivos a la papelera del sitio (se pueden recuperar desde SharePoint por 93 días). */
export async function borrarDeSharePoint(refs: string[]): Promise<void> {
  if (refs.length === 0) return;
  const graph = await cliente();
  const s = await sitio(graph);
  await Promise.all(
    refs.map(async (ref) => {
      try {
        await graph.api(`/sites/${s}/drive/items/${encodeURIComponent(idDeReferencia(ref))}`).delete();
      } catch (e) {
        // Ya no estaba: no es un error para quien borra.
        if ((e as { statusCode?: number })?.statusCode !== 404) throw e;
      }
    }),
  );
}

/** Manda una carpeta completa del Core a la papelera («Rendiciones/<id>»). */
export async function borrarCarpetaDeSharePoint(carpeta: string): Promise<void> {
  const graph = await cliente();
  const s = await sitio(graph);
  try {
    await graph.api(`/sites/${s}/drive/root:/${codificarRuta(rutaCompleta(carpeta))}`).delete();
  } catch (e) {
    if ((e as { statusCode?: number })?.statusCode !== 404) throw e;
  }
}

/** Para el diagnóstico: sube y borra un archivo de prueba. Devuelve null si anduvo, o el motivo. */
export async function probarSharePoint(): Promise<string | null> {
  try {
    const ref = await subirASharePoint("_prueba", `prueba-${Date.now()}.txt`, Buffer.from("Prueba de escritura del Core"), "text/plain");
    await bajarDeSharePoint(ref);
    await borrarDeSharePoint([ref]);
    return null;
  } catch (e) {
    const codigo = (e as { statusCode?: number })?.statusCode;
    const motivo = e instanceof Error ? e.message : String(e);
    return codigo ? `HTTP ${codigo}: ${motivo}` : motivo;
  }
}
