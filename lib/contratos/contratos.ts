import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { columnasDeContrato, filaAContrato, TABLA_CONTRATOS, urlDelLogo, type Contrato } from "./contrato-actual";
import { asegurarCarpeta, carpetaRaizDeContratos, validarNombre, type Seccion } from "./sharepoint";
import { PLANTILLA_DE_CONTRATO, type CarpetaDePlantilla } from "./plantilla";
import type { UsuarioConAcceso } from "./tipos";

/**
 * La lista de contratos y su creación: lo único de Contratos que vive FUERA de un contrato. Por
 * eso usa el cliente de core-pertec y no el de lib/contratos/supabase-admin.ts, que exige uno.
 */

/** Direcciones que ya son pantallas: un contrato no puede llamarse así. */
const SLUGS_RESERVADOS = new Set(["nuevo", "nueva", "reporte", "estructura"]);

export async function listarContratos(): Promise<Contrato[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLA_CONTRATOS)
    .select(await columnasDeContrato())
    .order("activo", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) {
    // Sin la migración la tabla no existe: se muestra la lista vacía con el aviso en el registro,
    // en vez de tumbar la pantalla.
    console.error(`[contratos] No se pudo leer ${TABLA_CONTRATOS}. ¿Se corrió la migración? ${error.message}`);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(filaAContrato);
}

/** «Contrato Ventanas 2027» → «contrato-ventanas-2027». */
function slugDe(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "contrato"
  );
}

/** El primero libre: «ventanas», «ventanas-2», «ventanas-3»… */
async function slugLibre(nombre: string): Promise<string> {
  const base = slugDe(nombre);
  const { data } = await supabaseAdmin.from(TABLA_CONTRATOS).select("slug").like("slug", `${base}%`);
  const usados = new Set(((data ?? []) as { slug: string }[]).map((f) => f.slug));
  for (let n = 1; ; n++) {
    const candidato = n === 1 ? base : `${base}-${n}`;
    if (!usados.has(candidato) && !SLUGS_RESERVADOS.has(candidato)) return candidato;
  }
}

export interface DatosDeContratoNuevo {
  nombre: string;
  cliente: string | null;
  numero: string | null;
  fechaInicio: string | null;
  administrador: string | null;
}

/**
 * Crea un contrato: su fila, sus catálogos sembrados con los de DCH y el cliente como responsable
 * externo. Las carpetas de SharePoint van aparte (prepararCarpetas): dependen de que quien lo crea
 * tenga SharePoint conectado, y un contrato sin carpetas todavía sirve para cargar personas.
 */
export async function crearContrato(
  datos: DatosDeContratoNuevo,
  usuario: UsuarioConAcceso,
  /** La carpeta ya creada en SharePoint (ver prepararCarpetasDeNombre). */
  carpetaCreada?: { id: string; webUrl: string },
): Promise<Contrato> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error("El contrato necesita un nombre.");
  // El nombre es también el de su carpeta: lo que SharePoint no acepta se rechaza acá, antes de
  // crear nada.
  const carpeta = validarNombre(nombre);

  const { data, error } = await supabaseAdmin
    .from(TABLA_CONTRATOS)
    .insert({
      slug: await slugLibre(nombre),
      nombre,
      cliente: datos.cliente?.trim() || null,
      numero: datos.numero?.trim() || null,
      fecha_inicio: datos.fechaInicio || null,
      administrador: datos.administrador?.trim() || null,
      carpeta,
      carpeta_item_id: carpetaCreada?.id ?? null,
      carpeta_url: carpetaCreada?.webUrl ?? null,
      creado_por: usuario.id,
    })
    .select(await columnasDeContrato())
    .single();
  if (error) throw new Error(error.message);
  const contrato = filaAContrato(data as unknown as Record<string, unknown>);

  const { error: errorCatalogos } = await supabaseAdmin.rpc("ct_preparar_contrato", { p_contrato: contrato.id });
  if (errorCatalogos) throw new Error(`El contrato se creó, pero no sus catálogos: ${errorCatalogos.message}`);

  // El cliente es a quien más se le asignan requisitos «del mandante»: queda listo para elegirlo.
  if (contrato.cliente) {
    await supabaseAdmin
      .from("ct_responsables_externos")
      .insert({ contrato_id: contrato.id, nombre: contrato.cliente })
      .then(({ error: e }) => e && console.error(`[contratos] No se pudo agregar el cliente como responsable: ${e.message}`));
  }

  return contrato;
}

/**
 * Crea en SharePoint la carpeta de un contrato y la estructura de la plantilla, a partir de su
 * nombre: CONTRATOS/<nombre>/…
 *
 * Idempotente: lo que ya existe se usa, lo que falta se crea. Se puede volver a correr si la
 * primera vez se cortó a medias.
 */
export async function prepararCarpetasDeNombre(nombre: string): Promise<{ id: string; webUrl: string }> {
  const nombreDeCarpeta = validarNombre(nombre);
  const raiz: Seccion = { slug: "contratos", nombre: "Contratos", carpeta: carpetaRaizDeContratos() };
  const carpeta = await asegurarCarpeta(raiz, "", nombreDeCarpeta);

  const seccion: Seccion = { slug: "arranque", nombre: nombreDeCarpeta, carpeta: `${raiz.carpeta}/${nombreDeCarpeta}` };
  async function crear(nodos: CarpetaDePlantilla[], rutaPadre: string): Promise<void> {
    // De a una por nivel y en orden: en paralelo, Graph responde 429 con estructuras grandes.
    for (const nodo of nodos) {
      await asegurarCarpeta(seccion, rutaPadre, nodo.nombre);
      if (nodo.carpetas?.length) await crear(nodo.carpetas, [rutaPadre, nodo.nombre].filter(Boolean).join("/"));
    }
  }
  await crear(PLANTILLA_DE_CONTRATO, "");
  return carpeta;
}

/** Lo mismo para un contrato que ya existe (el botón de su portada), y lo anota en él. */
export async function prepararCarpetas(contrato: Contrato): Promise<{ id: string; webUrl: string }> {
  const carpeta = await prepararCarpetasDeNombre(contrato.carpeta);
  await supabaseAdmin
    .from(TABLA_CONTRATOS)
    .update({ carpeta_item_id: carpeta.id, carpeta_url: carpeta.webUrl, actualizado_en: new Date().toISOString() })
    .eq("id", contrato.id);
  return carpeta;
}

/** Lo que el menú necesita de cada contrato: poco, porque se pide en cada página. */
export interface ContratoDelMenu {
  slug: string;
  nombre: string;
  activo: boolean;
  logo: string | null;
}

/**
 * Los contratos para la barra lateral. Nunca lanza: el menú está en todas las páginas de
 * core-pertec, y un problema acá no puede tumbarlas.
 */
export async function listarContratosDelMenu(): Promise<ContratoDelMenu[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLA_CONTRATOS)
    .select((await columnasDeContrato()).includes("logo_actualizado") ? "slug, nombre, activo, logo_actualizado" : "slug, nombre, activo")
    .order("activo", { ascending: false })
    .order("nombre", { ascending: true });
  if (error) {
    console.error(`[contratos] No se pudo leer la lista para el menú: ${error.message}`);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((f) => {
    const version = f.logo_actualizado ? String(new Date(f.logo_actualizado as string).getTime()) : null;
    return {
      slug: f.slug as string,
      nombre: f.nombre as string,
      activo: Boolean(f.activo),
      logo: urlDelLogo({ slug: f.slug as string, logoVersion: version }),
    };
  });
}

/** Los formatos que se aceptan: los que el navegador produce al reducir la imagen, y que el PDF sabe incrustar. */
const LOGO_VALIDO = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
/** ~300 KB de imagen: la del navegador sale de unos 200 px y pesa mucho menos. */
const LOGO_MAXIMO = 400_000;

/** Guarda (o quita, con null) el logo de un contrato. */
export async function guardarLogo(contratoId: string, logo: string | null): Promise<void> {
  if (logo !== null) {
    if (!LOGO_VALIDO.test(logo)) throw new Error("El logo tiene que ser una imagen PNG o JPG.");
    if (logo.length > LOGO_MAXIMO) throw new Error("La imagen es demasiado grande. Prueba con una más chica.");
  }
  const { error } = await supabaseAdmin
    .from(TABLA_CONTRATOS)
    .update({ logo, logo_actualizado: logo ? new Date().toISOString() : null, actualizado_en: new Date().toISOString() })
    .eq("id", contratoId);
  if (error) throw new Error(error.message);
}

/** La imagen del logo, para servirla. */
export async function leerLogo(slug: string): Promise<{ tipo: string; bytes: Buffer } | null> {
  const { data } = await supabaseAdmin.from(TABLA_CONTRATOS).select("logo").eq("slug", slug).maybeSingle();
  const logo = (data?.logo as string | null) ?? null;
  const partes = logo ? /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(logo) : null;
  return partes ? { tipo: partes[1], bytes: Buffer.from(partes[2], "base64") } : null;
}
