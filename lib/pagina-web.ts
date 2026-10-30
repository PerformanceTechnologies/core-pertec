import "server-only";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { pertecWebSupabase } from "./pertec-web-supabase";
import {
  casoDesdeFila,
  equipoDesdeFila,
  imagenesDeEquipo,
  imagenesQueSobran,
  rutaEnBucket,
  solicitudDesdeFila,
  CAMPOS_CONFIG,
  type BucketWeb,
  type Caso,
  type Equipo,
  type EstadoSolicitud,
  type Solicitud,
} from "./pagina-web-modelo";

// -----------------------------------------------------------------------------
//  Página web: lo que toca la base y el storage del sitio (solo servidor).
//
//  Todo va con la llave de servicio del Supabase de pertec-web, que se salta RLS.
//  Por eso cada Server Action y la ruta de subida exigen la app "pagina-web" ANTES de
//  llamar a cualquier cosa de acá: este archivo no revisa permisos, confía en que
//  quien lo llama ya lo hizo.
// -----------------------------------------------------------------------------

function fallar(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`[pagina-web] ${contexto}: ${error.message}`);
}

const baseUrl = () => process.env.PERTEC_WEB_SUPABASE_URL ?? "";

// ─── Imágenes ────────────────────────────────────────────────────────────────

// Lado mayor de una imagen del sitio. La ficha de un equipo la muestra a ~900 px de
// ancho; 1600 deja margen para pantallas densas sin subir fotos de 12 MP tal cual.
const LADO_MAXIMO = 1600;

/**
 * Comprime y sube una imagen a un bucket del sitio. Devuelve su URL pública.
 *
 * El admin del sitio subía el archivo tal como venía. Acá se reduce: una foto de
 * celular pesa 4–8 MB y el sitio la carga entera en cada visita. Una imagen con
 * transparencia (un render de un equipo sobre fondo vacío) queda en PNG para no
 * perderla; el resto, JPEG.
 *
 * El nombre sigue la convención del sitio —plano, `<ms>-<aleatorio>.<ext>`—, que es
 * lo que rutaEnBucket reconoce como propio a la hora de borrar.
 */
export async function subirImagen(bucket: BucketWeb, contenido: Buffer): Promise<string> {
  const imagen = sharp(contenido, { failOn: "error" }).rotate(); // rotate(): respeta la orientación EXIF de la foto
  const meta = await imagen.metadata();
  const conTransparencia = Boolean(meta.hasAlpha);
  const redimensionada = imagen.resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true });
  const salida = conTransparencia
    ? await redimensionada.png({ compressionLevel: 9, palette: true }).toBuffer()
    : await redimensionada.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();

  const ext = conTransparencia ? "png" : "jpg";
  const ruta = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const { error } = await pertecWebSupabase.storage.from(bucket).upload(ruta, salida, {
    contentType: conTransparencia ? "image/png" : "image/jpeg",
    upsert: false,
  });
  fallar("subir imagen", error);
  return pertecWebSupabase.storage.from(bucket).getPublicUrl(ruta).data.publicUrl;
}

/**
 * Borra imágenes del bucket. Solo las que son de ese bucket (ver rutaEnBucket): una URL
 * externa o de otro lado se ignora. No falla si alguna ya no estaba: una imagen
 * huérfana es basura, no un motivo para que no se guarde el equipo.
 */
export async function borrarImagenes(bucket: BucketWeb, urls: string[]): Promise<void> {
  const rutas = urls.map((u) => rutaEnBucket(u, bucket, baseUrl())).filter((r): r is string => r !== null);
  if (rutas.length === 0) return;
  const { error } = await pertecWebSupabase.storage.from(bucket).remove(rutas);
  if (error) console.warn(`[pagina-web] No se pudieron borrar ${rutas.length} imagen(es) de ${bucket}:`, error.message);
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

export async function listarEquipos(): Promise<Equipo[]> {
  const { data, error } = await pertecWebSupabase
    .from("equipos")
    .select("*")
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  fallar("listar equipos", error);
  return (data ?? []).map(equipoDesdeFila);
}

async function obtenerEquipo(id: string): Promise<Equipo | null> {
  const { data, error } = await pertecWebSupabase.from("equipos").select("*").eq("id", id).maybeSingle();
  fallar("leer equipo", error);
  return data ? equipoDesdeFila(data) : null;
}

/**
 * Crea (id null) o actualiza un equipo. Las imágenes que tenía y ya no tiene se borran
 * del storage DESPUÉS de guardar: si el guardado falla, no quedan filas apuntando a
 * archivos borrados. (El admin del sitio las borraba al quitarlas del formulario, aunque
 * después se cancelara.)
 */
export async function guardarEquipo(id: string | null, datos: Omit<Equipo, "id">): Promise<string> {
  if (!id) {
    const { data, error } = await pertecWebSupabase.from("equipos").insert(datos).select("id").single();
    fallar("crear equipo", error);
    return data!.id as string;
  }
  const antes = await obtenerEquipo(id);
  if (!antes) throw new Error("[pagina-web] Ese equipo ya no existe.");
  const { error } = await pertecWebSupabase.from("equipos").update(datos).eq("id", id);
  fallar("guardar equipo", error);
  await borrarImagenes("equipos", imagenesQueSobran(imagenesDeEquipo(antes), imagenesDeEquipo(datos)));
  return id;
}

/** Borra el equipo y TODAS sus imágenes, galería incluida (el sitio dejaba la galería). */
export async function eliminarEquipo(id: string): Promise<void> {
  const antes = await obtenerEquipo(id);
  const { error } = await pertecWebSupabase.from("equipos").delete().eq("id", id);
  fallar("eliminar equipo", error);
  if (antes) await borrarImagenes("equipos", imagenesDeEquipo(antes));
}

// ─── Casos de éxito ──────────────────────────────────────────────────────────

export async function listarCasos(): Promise<Caso[]> {
  const { data, error } = await pertecWebSupabase
    .from("casos")
    .select("*")
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  fallar("listar casos", error);
  return (data ?? []).map(casoDesdeFila);
}

async function obtenerCaso(id: string): Promise<Caso | null> {
  const { data, error } = await pertecWebSupabase.from("casos").select("*").eq("id", id).maybeSingle();
  fallar("leer caso", error);
  return data ? casoDesdeFila(data) : null;
}

export async function guardarCaso(id: string | null, datos: Omit<Caso, "id">): Promise<string> {
  if (!id) {
    const { data, error } = await pertecWebSupabase.from("casos").insert(datos).select("id").single();
    fallar("crear caso", error);
    return data!.id as string;
  }
  const antes = await obtenerCaso(id);
  if (!antes) throw new Error("[pagina-web] Ese caso ya no existe.");
  const { error } = await pertecWebSupabase.from("casos").update(datos).eq("id", id);
  fallar("guardar caso", error);
  await borrarImagenes("casos", imagenesQueSobran([antes.imagen_url], [datos.imagen_url]));
  return id;
}

export async function eliminarCaso(id: string): Promise<void> {
  const antes = await obtenerCaso(id);
  const { error } = await pertecWebSupabase.from("casos").delete().eq("id", id);
  fallar("eliminar caso", error);
  if (antes) await borrarImagenes("casos", [antes.imagen_url]);
}

// ─── Solicitudes ─────────────────────────────────────────────────────────────

export async function listarSolicitudes(): Promise<Solicitud[]> {
  const { data, error } = await pertecWebSupabase
    .from("solicitudes")
    .select("*")
    .order("created_at", { ascending: false });
  fallar("listar solicitudes", error);
  return (data ?? []).map(solicitudDesdeFila);
}

export async function contarSolicitudesNuevas(): Promise<number> {
  const { count, error } = await pertecWebSupabase
    .from("solicitudes")
    .select("id", { count: "exact", head: true })
    .eq("estado", "nuevo");
  if (error) return 0; // es un contador del menú: sin él la página igual sirve
  return count ?? 0;
}

/** Solo estado y notas internas: lo que mandó el cliente no se edita. */
export async function actualizarSolicitud(id: string, estado: EstadoSolicitud, notas: string): Promise<void> {
  const { error } = await pertecWebSupabase
    .from("solicitudes")
    .update({ estado, notas_internas: notas })
    .eq("id", id);
  fallar("guardar solicitud", error);
}

export async function eliminarSolicitud(id: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("solicitudes").delete().eq("id", id);
  fallar("eliminar solicitud", error);
}

// ─── Configuración de contacto ───────────────────────────────────────────────

export async function leerConfig(): Promise<Record<string, string>> {
  const claves = CAMPOS_CONFIG.map((c) => c.clave);
  const { data, error } = await pertecWebSupabase.from("config").select("key, value").in("key", claves);
  fallar("leer configuración", error);
  const valores: Record<string, string> = Object.fromEntries(claves.map((k) => [k, ""]));
  for (const fila of data ?? []) valores[fila.key as string] = (fila.value as string) ?? "";
  return valores;
}

/** Upsert por clave, como save-config del sitio. Llega ya saneado: solo las 9 claves. */
export async function guardarConfig(valores: Record<string, string>): Promise<void> {
  const filas = Object.entries(valores).map(([key, value]) => ({ key, value }));
  const { error } = await pertecWebSupabase.from("config").upsert(filas, { onConflict: "key" });
  fallar("guardar configuración", error);
}
