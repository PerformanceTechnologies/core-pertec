import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  bajarDeSharePoint,
  borrarCarpetaDeSharePoint,
  borrarDeSharePoint,
  esReferenciaSharePoint,
  idDeReferencia,
  subirASharePoint,
} from "./sharepoint-core";

// -----------------------------------------------------------------------------
//  Dónde vive cada archivo del Core.
//
//  Lo NUEVO va a SharePoint y en la base queda «sp:<id>». Lo que ya estaba en Supabase
//  Storage se sigue leyendo de su bucket: la ruta vieja no tiene el prefijo, así que cada
//  función mira la referencia y va al lugar que corresponde. Nada se migra ni se borra solo.
//
//  Se sube con la cuenta de quien está usando el Core, igual que Contratos. Si SharePoint
//  falla (su cuenta no dio acceso a SharePoint, o no tiene permiso en el sitio), el archivo
//  se guarda en el bucket de antes para que su trabajo no se pierda, y queda en el log.
//  /api/archivos/estado dice si SharePoint anda con la cuenta de quien lo abre.
// -----------------------------------------------------------------------------

export { esReferenciaSharePoint } from "./sharepoint-core";

interface Respaldo {
  bucket: string;
  /** La ruta que habría tenido en el bucket (la de siempre). */
  ruta: string;
  /** Otro proyecto de Supabase (el de pertec-web). Por defecto, el del Core. */
  cliente?: SupabaseClient;
}

/**
 * Guarda un archivo en SharePoint («ARCHIVOS CORE/<carpeta>/<nombre>») y devuelve lo que
 * se anota en la base. Si SharePoint falla, lo deja en el bucket de antes y devuelve esa ruta.
 */
export async function guardarArchivo(o: {
  carpeta: string;
  nombre: string;
  contenido: Buffer;
  tipo: string;
  respaldo: Respaldo;
  /** Si ya hay uno con ese nombre en la carpeta, se reemplaza en vez de sumar otro. */
  reemplazar?: boolean;
}): Promise<string> {
  try {
    return await subirASharePoint(o.carpeta, o.nombre, o.contenido, o.tipo, o.reemplazar);
  } catch (e) {
    console.error(
      `[archivos] SharePoint no recibió «${o.carpeta}/${o.nombre}»; queda en Supabase (${o.respaldo.bucket}). Motivo:`,
      e instanceof Error ? e.message : e,
    );
    const { error } = await (o.respaldo.cliente ?? supabaseAdmin).storage
      .from(o.respaldo.bucket)
      .upload(o.respaldo.ruta, o.contenido, { contentType: o.tipo, upsert: Boolean(o.reemplazar) });
    if (error) throw new Error(`No se pudo guardar el archivo: ${error.message}`);
    return o.respaldo.ruta;
  }
}

/** El contenido de un archivo, esté donde esté. null si no se pudo leer (y queda en el log). */
export async function leerArchivo(bucket: string, ruta: string, cliente: SupabaseClient = supabaseAdmin): Promise<Buffer | null> {
  try {
    if (esReferenciaSharePoint(ruta)) return (await bajarDeSharePoint(ruta)).contenido;
    const { data, error } = await cliente.storage.from(bucket).download(ruta);
    if (error || !data) throw new Error(error?.message ?? "sin datos");
    return Buffer.from(await data.arrayBuffer());
  } catch (e) {
    console.error(`[archivos] No se pudo leer ${ruta}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Borra archivos, estén donde estén. Los de SharePoint van a la papelera del sitio.
 * No lanza: borrar un registro no puede fallar porque quedó un archivo suelto.
 */
export async function borrarArchivos(bucket: string, rutas: (string | null | undefined)[], cliente: SupabaseClient = supabaseAdmin): Promise<void> {
  const validas = rutas.filter((r): r is string => Boolean(r));
  const sp = validas.filter((r) => esReferenciaSharePoint(r));
  const viejas = validas.filter((r) => !esReferenciaSharePoint(r));
  await Promise.all([
    sp.length
      ? borrarDeSharePoint(sp).catch((e) => console.error(`[archivos] Quedaron archivos sin borrar en SharePoint:`, e instanceof Error ? e.message : e))
      : null,
    viejas.length
      ? cliente.storage.from(bucket).remove(viejas).then(({ error }) => {
          if (error) console.error(`[archivos] Quedaron archivos sin borrar en ${bucket}:`, error.message);
        })
      : null,
  ]);
}

/** Borra una carpeta completa del Core en SharePoint (no lanza). */
export async function borrarCarpeta(carpeta: string): Promise<void> {
  await borrarCarpetaDeSharePoint(carpeta).catch((e) =>
    console.error(`[archivos] No se pudo borrar la carpeta ${carpeta} en SharePoint:`, e instanceof Error ? e.message : e),
  );
}

// ---------- Enlaces ------------------------------------------------------------------

function secreto(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("Falta AUTH_SECRET para firmar los enlaces de archivos.");
  return s;
}

function firmar(partes: string[]): string {
  return createHmac("sha256", secreto()).update(partes.join("\n")).digest("base64url");
}

export interface ParametrosEnlace {
  /** Nombre con que se descarga. */
  n?: string;
  /** "1" = descargar en vez de mostrar. */
  d?: string;
  /** Vence (epoch en segundos): enlace temporal, no pide sesión. */
  e?: string;
  /** App que hay que tener para abrirlo: enlace permanente, pide sesión. */
  a?: string;
  f?: string;
}

function partesFirmadas(id: string, p: ParametrosEnlace): string[] {
  return [id, p.n ?? "", p.d ?? "", p.e ?? "", p.a ?? ""];
}

function armarUrl(id: string, p: ParametrosEnlace): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, f: firmar(partesFirmadas(id, p)) })) if (v) q.set(k, v);
  return `/api/archivos/${encodeURIComponent(id)}?${q.toString()}`;
}

/** Revisa la firma de un enlace. Devuelve qué exige («temporal» o la app), o null si no vale. */
export function revisarEnlace(id: string, p: ParametrosEnlace): { tipo: "temporal" } | { tipo: "app"; app: string } | null {
  if (!p.f) return null;
  const esperado = Buffer.from(firmar(partesFirmadas(id, p)));
  const recibido = Buffer.from(p.f);
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;
  if (p.e) return Number(p.e) * 1000 >= Date.now() ? { tipo: "temporal" } : null;
  if (p.a) return { tipo: "app", app: p.a };
  return null;
}

/**
 * Un enlace temporal para ver o bajar el archivo, esté donde esté. Si está en SharePoint,
 * además de no estar vencido pide sesión en el Core: el archivo se baja con la cuenta de
 * quien lo abre.
 */
export async function enlaceTemporal(
  bucket: string,
  ruta: string,
  o: { segundos?: number; descarga?: string | true } = {},
  cliente: SupabaseClient = supabaseAdmin,
): Promise<string | null> {
  const segundos = o.segundos ?? 60;
  if (esReferenciaSharePoint(ruta)) {
    const id = idDeReferencia(ruta);
    return armarUrl(id, {
      n: typeof o.descarga === "string" ? o.descarga.slice(0, 200) : undefined,
      d: o.descarga ? "1" : undefined,
      e: String(Math.floor(Date.now() / 1000) + segundos),
    });
  }
  const { data, error } = await cliente.storage.from(bucket).createSignedUrl(ruta, segundos, o.descarga ? { download: o.descarga } : undefined);
  if (error) {
    console.error(`[archivos] No se pudo firmar ${ruta}:`, error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Un enlace que no vence, para guardarlo en la base (fotos de mantención, boletas de gastos).
 * Solo lo abre alguien con sesión en el Core y acceso a `app`.
 */
export function enlacePermanente(ref: string, app: string, nombre?: string): string {
  return armarUrl(idDeReferencia(ref), { a: app, n: nombre?.slice(0, 200) || undefined });
}
