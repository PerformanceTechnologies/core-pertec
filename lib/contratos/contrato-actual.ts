import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
// El cliente de core-pertec y no el de Contratos: este es el que le dice a aquel cuál es el contrato.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CABECERA_CONTRATO } from "./cabecera";
import { enContrato } from "./rutas";

export interface Contrato {
  id: string;
  slug: string;
  nombre: string;
  cliente: string | null;
  numero: string | null;
  fechaInicio: string | null;
  administrador: string | null;
  dotacionRequerida: number | null;
  /** La carpeta del contrato dentro de la carpeta raíz de contratos en SharePoint. */
  carpeta: string;
  carpetaItemId: string | null;
  carpetaUrl: string | null;
  activo: boolean;
  creadoEn: string;
  /** La versión del logo (cuándo se cambió), o null si no tiene. Va en la URL de la imagen. */
  logoVersion: string | null;
}

export const TABLA_CONTRATOS = "ct_contratos";

/**
 * Todo menos la imagen del logo. El logo se sirve aparte (ver [contrato]/logo/route.ts): traerlo en
 * cada consulta del contrato sumaría decenas de KB a cada página sin usarlos.
 */
export const COLUMNAS_SIN_LOGO =
  "id, slug, nombre, cliente, numero, fecha_inicio, administrador, dotacion_requerida, carpeta, " +
  "carpeta_item_id, carpeta_url, activo, creado_en, logo_actualizado";

/**
 * Las columnas para leer un contrato, según exista ya la del logo.
 *
 * El logo llegó con la migración 0002: si el código se despliega antes de correrla, pedir
 * `logo_actualizado` haría fallar cada página de los contratos. Se prueba una vez por instancia y
 * se recuerda solo el SÍ: mientras falte, se vuelve a preguntar, para que el logo aparezca apenas
 * se corra la migración y no cuando se recicle la instancia.
 */
let columnaDeLogoExiste = false;
export async function columnasDeContrato(): Promise<string> {
  if (columnaDeLogoExiste) return COLUMNAS_SIN_LOGO;
  const { error } = await supabaseAdmin.from(TABLA_CONTRATOS).select("logo_actualizado").limit(1);
  if (error) return COLUMNAS_SIN_LOGO.replace(", logo_actualizado", "");
  columnaDeLogoExiste = true;
  return COLUMNAS_SIN_LOGO;
}

/** La dirección de la imagen del logo, con su versión para la caché. Null si no tiene. */
export function urlDelLogo(contrato: Pick<Contrato, "slug" | "logoVersion">): string | null {
  return contrato.logoVersion ? `/contratos/${contrato.slug}/logo?v=${contrato.logoVersion}` : null;
}

export function filaAContrato(f: Record<string, unknown>): Contrato {
  return {
    id: f.id as string,
    slug: f.slug as string,
    nombre: f.nombre as string,
    cliente: (f.cliente as string | null) ?? null,
    numero: (f.numero as string | null) ?? null,
    fechaInicio: (f.fecha_inicio as string | null) ?? null,
    administrador: (f.administrador as string | null) ?? null,
    dotacionRequerida: (f.dotacion_requerida as number | null) ?? null,
    carpeta: f.carpeta as string,
    carpetaItemId: (f.carpeta_item_id as string | null) ?? null,
    carpetaUrl: (f.carpeta_url as string | null) ?? null,
    activo: Boolean(f.activo),
    creadoEn: f.creado_en as string,
    logoVersion: f.logo_actualizado ? String(new Date(f.logo_actualizado as string).getTime()) : null,
  };
}

export const obtenerContratoPorSlug = cache(async function obtenerContratoPorSlug(
  slug: string,
): Promise<Contrato | null> {
  const { data } = await supabaseAdmin
    .from(TABLA_CONTRATOS)
    .select(await columnasDeContrato())
    .eq("slug", slug)
    .maybeSingle();
  return data ? filaAContrato(data as unknown as Record<string, unknown>) : null;
});

/**
 * El contrato de esta petición: el de la dirección (/contratos/<contrato>/…).
 *
 * Lo pasa proxy.ts en una cabecera, así que sirve igual en una página, en una Server Action y en
 * una descarga. Sin contrato —o con uno que no existe— la respuesta es un 404: no hay nada que
 * mostrar ni que guardar fuera de un contrato.
 *
 * Envuelto en cache(): lo piden decenas de funciones en la misma petición y es una sola consulta.
 */
export const contratoActual = cache(async function contratoActual(): Promise<Contrato> {
  const slug = (await headers()).get(CABECERA_CONTRATO);
  if (!slug) notFound();
  const contrato = await obtenerContratoPorSlug(slug);
  if (!contrato) notFound();
  return contrato;
});

/** El id del contrato de esta petición: lo que filtra cada consulta. */
export async function idDelContrato(): Promise<string> {
  return (await contratoActual()).id;
}

/** «/contratos/<contrato>» + lo que siga. Toda dirección dentro de un contrato sale de acá. */
export async function rutaDelContrato(resto = ""): Promise<string> {
  return `/contratos/${(await contratoActual()).slug}${resto}`;
}

/** Una dirección escrita como en core-ih («/contratos/acreditacion»), con el contrato de esta petición. */
export async function enEsteContrato(href: string): Promise<string> {
  return enContrato((await contratoActual()).slug, href);
}
