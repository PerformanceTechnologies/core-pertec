import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { sesionDeLaPeticion } from "@/lib/sesion-de-la-peticion";
import { obtenerAccessToken, SinCredencialesDeGraph, tokenDeAplicacion } from "@/lib/contratos/graph-credenciales";
import type { ArchivoCrudo } from "./modelo";

// -----------------------------------------------------------------------------
//  Repositorio Legal ↔ SharePoint. SharePoint ES la base: acá se lee, sube, reemplaza, renombra,
//  mueve y borra directo en «ARCHIVOS CORE/ANTECEDENTES LEGALES». El Core no guarda copia de nada.
//
//  Se conecta con la cuenta de quien usa el Core (así en SharePoint queda a su nombre quién subió o
//  cambió cada archivo) y, si esa persona no conectó SharePoint, con la aplicación del Core: mismo
//  criterio que lib/archivos/sharepoint-core.ts.
//
//  Toda operación sobre un id que llega del navegador se verifica primero: el elemento tiene que
//  estar DEBAJO de la raíz del repositorio. Sin eso, con un id cualquiera se podría borrar un
//  contrato o una factura de otra carpeta del sitio.
// -----------------------------------------------------------------------------

export { SinCredencialesDeGraph };

const ID_DE_ITEM = /^[A-Za-z0-9!_-]{10,120}$/;

function sitioConfigurado(): string {
  return (process.env.SHAREPOINT_LEGAL_SITIO || process.env.SHAREPOINT_CORE_SITIO || process.env.SHAREPOINT_CONTRATOS_SITIO || "performancecl.sharepoint.com:/sites/COREPERTEC").trim();
}

/** La carpeta raíz del repositorio dentro de la biblioteca del sitio. */
export function carpetaRaiz(): string {
  return (process.env.SHAREPOINT_LEGAL_CARPETA || "ARCHIVOS CORE/ANTECEDENTES LEGALES").trim().replace(/^\/+|\/+$/g, "");
}

async function clientePersona(): Promise<Client> {
  const correo = (await sesionDeLaPeticion())?.user?.email;
  if (!correo) throw new SinCredencialesDeGraph("Inicia sesión en el Core para usar SharePoint.");
  const token = await obtenerAccessToken(correo);
  return Client.init({ authProvider: (done) => done(null, token) });
}

async function clienteApp(): Promise<Client> {
  const token = await tokenDeAplicacion();
  return Client.init({ authProvider: (done) => done(null, token) });
}

/** Con la persona y, si falla, con la app del Core. `soloApp` para el cron (no hay sesión). */
async function conGraph<T>(fn: (g: Client) => Promise<T>, soloApp = false): Promise<T> {
  if (soloApp) return fn(await clienteApp());
  try {
    return await fn(await clientePersona());
  } catch (e) {
    const codigo = (e as { statusCode?: number })?.statusCode;
    // Un 404 o un 409 son respuestas de SharePoint sobre el archivo, no de la credencial: no se reintenta.
    if (codigo === 404 || codigo === 409 || codigo === 400) throw e;
    try {
      return await fn(await clienteApp());
    } catch (e2) {
      console.error("[repositorio-legal] SharePoint falló con la persona y con la app:", e instanceof Error ? e.message : e, "|", e2 instanceof Error ? e2.message : e2);
      throw e;
    }
  }
}

let idSitio: string | null = null;
async function sitio(g: Client): Promise<string> {
  if (idSitio) return idSitio;
  const configurado = sitioConfigurado();
  if (!configurado.includes(":")) return (idSitio = configurado);
  const datos = await g.api(`/sites/${configurado}`).select("id").get();
  if (!datos?.id) throw new Error(`SharePoint no devolvió el sitio «${configurado}».`);
  return (idSitio = datos.id as string);
}

function codificar(ruta: string): string {
  return ruta.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** Una ruta relativa al repositorio, limpia: sin «..», sin caracteres que SharePoint prohíbe. */
export function rutaSegura(relativa: string): string {
  return relativa
    .split("/")
    .map((p) => p.replace(/["*:<>?\\|#%\u0000-\u001f]/g, "_").trim())
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
}

export function validarId(id: string): string {
  if (!ID_DE_ITEM.test(id)) throw new Error("Identificador de archivo inválido.");
  return id;
}

// ---------- Lectura ---------------------------------------------------------------

interface ItemGraph {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  file?: { mimeType?: string; hashes?: { quickXorHash?: string; sha256Hash?: string } };
  folder?: { childCount?: number };
}

const CAMPOS = "id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,file,folder";

export interface Arbol {
  archivos: ArchivoCrudo[];
  /** Todas las carpetas, como rutas relativas («SOCIEDADES/Legales X»). */
  carpetas: string[];
  idRaiz: string;
}

/**
 * Recorre todo el repositorio. Va por niveles y pide las carpetas de cada nivel en paralelo: con
 * ~60 carpetas son unos pocos viajes en vez de 60 en fila.
 */
async function recorrer(g: Client): Promise<Arbol> {
  const s = await sitio(g);
  const raiz = await g.api(`/sites/${s}/drive/root:/${codificar(carpetaRaiz())}`).select("id").get();
  const archivos: ArchivoCrudo[] = [];
  const carpetas: string[] = [];
  let nivel: { id: string; ruta: string }[] = [{ id: raiz.id, ruta: "" }];

  while (nivel.length) {
    const siguiente: { id: string; ruta: string }[] = [];
    // De a 8 en paralelo: Graph limita por persona y un repositorio grande no debe tumbarlo.
    for (let i = 0; i < nivel.length; i += 8) {
      const lote = nivel.slice(i, i + 8);
      const respuestas = await Promise.all(
        lote.map(async (c) => {
          const items: ItemGraph[] = [];
          let url: string | undefined = `/sites/${s}/drive/items/${c.id}/children?$select=${CAMPOS}&$top=200`;
          while (url) {
            const r = await g.api(url).get();
            items.push(...((r?.value ?? []) as ItemGraph[]));
            url = r?.["@odata.nextLink"];
          }
          return { c, items };
        }),
      );
      for (const { c, items } of respuestas) {
        for (const it of items) {
          const ruta = c.ruta ? `${c.ruta}/${it.name}` : it.name;
          if (it.folder) {
            carpetas.push(ruta);
            siguiente.push({ id: it.id, ruta });
          } else if (it.file) {
            archivos.push({
              id: it.id,
              nombre: it.name,
              ruta,
              tamano: Number(it.size ?? 0),
              modificado: it.lastModifiedDateTime ?? "",
              modificadoPor: it.lastModifiedBy?.user?.displayName ?? null,
              webUrl: it.webUrl ?? null,
              hash: it.file.hashes?.quickXorHash ?? it.file.hashes?.sha256Hash ?? null,
            });
          }
        }
      }
    }
    nivel = siguiente;
  }
  return { archivos, carpetas, idRaiz: raiz.id as string };
}

// Memoria corta: todos ven la misma carpeta, y abrir tres pantallas seguidas no debe recorrer
// SharePoint tres veces. Cualquier escritura desde el Core la borra.
let memoria: { arbol: Arbol; en: number } | null = null;
const VIDA_MS = 60_000;

export function olvidarArbol(): void {
  memoria = null;
}

export async function leerArbol(opciones: { soloApp?: boolean; fresco?: boolean } = {}): Promise<Arbol> {
  if (!opciones.fresco && memoria && Date.now() - memoria.en < VIDA_MS) return memoria.arbol;
  const arbol = await conGraph(recorrer, opciones.soloApp);
  memoria = { arbol, en: Date.now() };
  return arbol;
}

/** Ruta relativa al repositorio de un elemento, o null si NO está dentro del repositorio. */
async function rutaDentro(g: Client, s: string, id: string): Promise<{ ruta: string; item: ItemGraph & { parentReference?: { path?: string } } } | null> {
  const item = await g.api(`/sites/${s}/drive/items/${encodeURIComponent(validarId(id))}`).get();
  const padre = decodeURIComponent(String(item?.parentReference?.path ?? "")); // «/drive/root:/ARCHIVOS CORE/…»
  const base = `/drive/root:/${carpetaRaiz()}`;
  if (padre !== base && !padre.startsWith(`${base}/`)) return null;
  const relPadre = padre.slice(base.length).replace(/^\//, "");
  return { ruta: relPadre ? `${relPadre}/${item.name}` : item.name, item };
}

async function exigirDentro(g: Client, s: string, id: string) {
  const r = await rutaDentro(g, s, id);
  if (!r) throw new Error("Ese archivo no pertenece al Repositorio Legal.");
  return r;
}

/** La URL de descarga directa (dura unos minutos) y el nombre. */
export async function enlaceDeDescarga(id: string): Promise<{ url: string; nombre: string; ruta: string }> {
  return conGraph(async (g) => {
    const s = await sitio(g);
    const { item, ruta } = await exigirDentro(g, s, id);
    const url = (item as unknown as Record<string, string>)["@microsoft.graph.downloadUrl"];
    if (!url) throw new Error("SharePoint no entregó el enlace de descarga.");
    return { url, nombre: item.name, ruta };
  });
}

/** El contenido de un archivo (para armar un paquete ZIP). */
export async function bajar(id: string): Promise<{ contenido: ArrayBuffer; nombre: string; ruta: string }> {
  const { url, nombre, ruta } = await enlaceDeDescarga(id);
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`La descarga desde SharePoint falló (HTTP ${r.status}).`);
  return { contenido: await r.arrayBuffer(), nombre, ruta };
}

/** URL de vista previa incrustable (PDF, Word, Excel, imágenes). */
export async function vistaPrevia(id: string): Promise<string | null> {
  return conGraph(async (g) => {
    const s = await sitio(g);
    await exigirDentro(g, s, id);
    const r = await g.api(`/sites/${s}/drive/items/${encodeURIComponent(id)}/preview`).post({});
    return (r?.getUrl as string | undefined) ?? null;
  });
}

// ---------- Escritura -------------------------------------------------------------

/**
 * Abre una sesión de carga para que el navegador suba el archivo DIRECTO a SharePoint (las
 * escrituras pesan hasta 20 MB y Vercel corta en ~4,5 MB por petición).
 *
 * Con `reemplazaId` se sube encima de ese archivo: mismo id, y la versión anterior queda en el
 * historial de versiones de SharePoint. Si además cambia el nombre (nueva fecha de emisión), se
 * renombra al confirmar.
 */
export async function abrirSubida(opciones: { carpeta: string; nombre: string; reemplazaId?: string | null }): Promise<string> {
  return conGraph(async (g) => {
    const s = await sitio(g);
    let api: string;
    if (opciones.reemplazaId) {
      await exigirDentro(g, s, opciones.reemplazaId);
      api = `/sites/${s}/drive/items/${encodeURIComponent(opciones.reemplazaId)}/createUploadSession`;
    } else {
      const ruta = [carpetaRaiz(), rutaSegura(opciones.carpeta), rutaSegura(opciones.nombre)].filter(Boolean).join("/");
      api = `/sites/${s}/drive/root:/${codificar(ruta)}:/createUploadSession`;
    }
    const sesion = await g.api(api).post({ item: { "@microsoft.graph.conflictBehavior": opciones.reemplazaId ? "replace" : "rename" } });
    const url = sesion?.uploadUrl as string | undefined;
    if (!url) throw new Error("SharePoint no abrió la sesión de carga.");
    return url;
  });
}

/** Después de una subida: verifica que quedó dentro del repositorio y, si corresponde, la renombra. */
export async function confirmarSubida(id: string, nombreFinal?: string | null): Promise<{ ruta: string }> {
  const r = await conGraph(async (g) => {
    const s = await sitio(g);
    const dentro = await exigirDentro(g, s, id);
    if (nombreFinal && nombreFinal !== dentro.item.name) {
      await g.api(`/sites/${s}/drive/items/${encodeURIComponent(id)}`).patch({ name: rutaSegura(nombreFinal), "@microsoft.graph.conflictBehavior": "rename" });
    }
    return { ruta: dentro.ruta };
  });
  olvidarArbol();
  return r;
}

export async function renombrar(id: string, nombre: string): Promise<void> {
  const limpio = rutaSegura(nombre).replace(/\//g, "_");
  if (!limpio) throw new Error("El nombre no puede quedar vacío.");
  await conGraph(async (g) => {
    const s = await sitio(g);
    await exigirDentro(g, s, id);
    await g.api(`/sites/${s}/drive/items/${encodeURIComponent(id)}`).patch({ name: limpio, "@microsoft.graph.conflictBehavior": "rename" });
  });
  olvidarArbol();
}

/** Crea (si falta) una carpeta relativa al repositorio y devuelve su id. */
async function asegurarCarpeta(g: Client, s: string, relativa: string): Promise<string> {
  let actual = carpetaRaiz();
  let id: string = (await g.api(`/sites/${s}/drive/root:/${codificar(actual)}`).select("id").get()).id;
  for (const parte of rutaSegura(relativa).split("/").filter(Boolean)) {
    actual = `${actual}/${parte}`;
    try {
      id = (await g.api(`/sites/${s}/drive/root:/${codificar(actual)}`).select("id").get()).id;
    } catch (e) {
      if ((e as { statusCode?: number })?.statusCode !== 404) throw e;
      id = (await g.api(`/sites/${s}/drive/items/${id}/children`).post({ name: parte, folder: {}, "@microsoft.graph.conflictBehavior": "fail" })).id;
    }
  }
  return id;
}

/** Mueve un archivo a otra carpeta del repositorio (por ejemplo, a la de otra sociedad). */
export async function mover(id: string, carpetaDestino: string): Promise<void> {
  await conGraph(async (g) => {
    const s = await sitio(g);
    await exigirDentro(g, s, id);
    const destino = await asegurarCarpeta(g, s, carpetaDestino);
    await g.api(`/sites/${s}/drive/items/${encodeURIComponent(id)}`).patch({ parentReference: { id: destino }, "@microsoft.graph.conflictBehavior": "rename" });
  });
  olvidarArbol();
}

/** Manda el archivo a la papelera del sitio (se recupera desde SharePoint durante 93 días). */
export async function eliminar(id: string): Promise<void> {
  await conGraph(async (g) => {
    const s = await sitio(g);
    await exigirDentro(g, s, id);
    await g.api(`/sites/${s}/drive/items/${encodeURIComponent(id)}`).delete();
  });
  olvidarArbol();
}

// ---------- Ordenar el repositorio ------------------------------------------------

/** Mueve y renombra en un solo paso (crea la carpeta de destino si falta). */
export async function moverYRenombrar(id: string, carpetaDestino: string, nombre: string): Promise<void> {
  await conGraph(async (g) => {
    const s = await sitio(g);
    await exigirDentro(g, s, id);
    const destino = await asegurarCarpeta(g, s, carpetaDestino);
    await g.api(`/sites/${s}/drive/items/${encodeURIComponent(id)}`).patch({ parentReference: { id: destino }, name: rutaSegura(nombre).replace(/\//g, "_"), "@microsoft.graph.conflictBehavior": "rename" });
  });
}

/** Crea una carpeta (y las que falten antes) dentro del repositorio. */
export async function crearCarpeta(relativa: string): Promise<void> {
  await conGraph(async (g) => {
    const s = await sitio(g);
    await asegurarCarpeta(g, s, relativa);
  });
  olvidarArbol();
}

/**
 * Borra (a la papelera) las carpetas que quedaron sin archivos después de ordenar, de abajo hacia arriba.
 * Nunca toca la raíz de SOCIEDADES, la de POR REVISAR ni la de la malla, ni las de `conservar` (las
 * sociedades recién creadas, que están vacías a propósito).
 */
export async function borrarCarpetasVacias(conservar: string[] = []): Promise<number> {
  const arbol = await leerArbol({ fresco: true });
  const conArchivos = new Set<string>();
  // Los archivos de sistema que dejan Mac y Windows (.DS_Store, Thumbs.db) no cuentan: una carpeta que
  // solo tiene eso está vacía. Al borrarla, se van con ella a la papelera.
  for (const a of arbol.archivos.filter((x) => !/^(\.ds_store|thumbs\.db|desktop\.ini)$/i.test(x.nombre))) {
    const partes = a.ruta.split("/");
    for (let i = 1; i < partes.length; i++) conArchivos.add(partes.slice(0, i).join("/"));
  }
  const protegidas = new Set(conservar.map((c) => c.toLowerCase()));
  const esProtegida = (c: string) => {
    const p = c.split("/");
    const raiz = p[0].toLowerCase();
    if (p.length === 1 && (raiz === "sociedades" || raiz === "por revisar" || raiz === "malla societaria")) return true;
    // La carpeta vacía de una sociedad se borra (quedó vacía porque se renombró), salvo las recién creadas.
    return protegidas.has(c.toLowerCase());
  };
  // Las más profundas primero; si se borra una carpeta, sus hijas se van con ella.
  const vacias = arbol.carpetas.filter((c) => !conArchivos.has(c) && !esProtegida(c)).sort((a, b) => b.split("/").length - a.split("/").length);
  const borradas: string[] = [];
  await conGraph(async (g) => {
    const s = await sitio(g);
    for (const c of vacias) {
      if (borradas.some((b) => c.startsWith(`${b}/`))) continue;
      // Una carpeta vacía cuyo padre también queda vacío: basta con borrar el padre.
      const padre = c.split("/").slice(0, -1).join("/");
      if (padre && vacias.includes(padre)) continue;
      try {
        await g.api(`/sites/${s}/drive/root:/${codificar(`${carpetaRaiz()}/${c}`)}`).delete();
        borradas.push(c);
      } catch (e) {
        if ((e as { statusCode?: number })?.statusCode !== 404) throw e;
      }
    }
  });
  olvidarArbol();
  return borradas.length;
}
