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
}

export const TABLA_CONTRATOS = "ct_contratos";

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
  };
}

export const obtenerContratoPorSlug = cache(async function obtenerContratoPorSlug(
  slug: string,
): Promise<Contrato | null> {
  const { data } = await supabaseAdmin.from(TABLA_CONTRATOS).select("*").eq("slug", slug).maybeSingle();
  return data ? filaAContrato(data) : null;
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
