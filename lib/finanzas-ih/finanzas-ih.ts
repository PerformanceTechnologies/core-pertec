import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import type { DocumentoIh } from "./sii-rcv-ih";
import type { DteParseado } from "../xml-dte";
import { claveDocumento } from "./claves";

export interface RespaldoDocumento {
  xmlSharepointItemId?: string;
  xmlSharepointWebUrl?: string;
  pdfSharepointItemId?: string;
  pdfSharepointWebUrl?: string;
  // Solo para documentos emitidos (XML): detalle estructurado (emisor,
  // receptor, items) sacado del mismo XML que se sube a SharePoint, para
  // mostrarlo bonito en el modal sin tener que volver a pedirlo a SharePoint
  // -- igual que datos en facturas_venta_historico (lib/xml-dte.ts).
  datos?: DteParseado["datos"];
}

export interface FinanzasIhDocumentoFila {
  id: string;
  empresa: "IH" | "IL";
  tipo_documento: "factura_afecta" | "factura_exenta" | "nota_credito" | "nota_debito" | "guia_despacho" | "boleta";
  direccion: "compra" | "venta" | null;
  codigo_dte: number;
  estado_sii: "registro" | "pendiente" | "no_incluir" | "reclamado" | null;
  rut_contraparte: string;
  razon_social_contraparte: string | null;
  folio: number;
  fecha_emision: string | null;
  monto_exento: number | null;
  monto_neto: number | null;
  monto_iva: number | null;
  monto_total: number | null;
  periodo: string | null;
  fuente: "rcv" | "portal_mipyme";
  codigo_portal: string | null;
  datos: DteParseado["datos"] | null;
  pdf_sharepoint_item_id: string | null;
  pdf_sharepoint_web_url: string | null;
  xml_sharepoint_item_id: string | null;
  xml_sharepoint_web_url: string | null;
  creado_en: string;
  actualizado_en: string;
}

// Paginado explicito con .range(): PostgREST tope las filas por respuesta a
// su "db-max-rows" (1000 por defecto en Supabase) SIN IMPORTAR el .limit()
// que se le pida -- mismo motivo que obtenerColumnaCompleta en
// lib/facturas-historicas.ts. Sin esto, con mas de 1000 documentos en la
// tabla (ya se supero, ver [[project-facturas-ih-boletas-bhe]]) el panel
// mostraba solo un subconjunto silenciosamente truncado.
export async function listarDocumentosIh(
  empresa?: "IH" | "IL",
  limite = 3000
): Promise<FinanzasIhDocumentoFila[]> {
  const filas: FinanzasIhDocumentoFila[] = [];
  const tamanoPagina = 1000;

  while (filas.length < limite) {
    let query = supabaseAdmin
      .from("finanzas_ih_documentos")
      .select("*")
      .order("fecha_emision", { ascending: false })
      .order("folio", { ascending: false })
      .range(filas.length, Math.min(filas.length + tamanoPagina, limite) - 1);
    if (empresa) query = query.eq("empresa", empresa);

    const { data } = await query;
    if (!data || data.length === 0) break;
    filas.push(...(data as FinanzasIhDocumentoFila[]));
    if (data.length < tamanoPagina) break;
  }

  return filas;
}

// Solo la ultima corrida EXITOSA, mismo patron que obtenerUltimaEjecucionExitosa
// en lib/finanzas.ts: los fallos se avisan por correo, no en el dashboard.
export async function obtenerUltimaEjecucionExitosaIh(): Promise<{ ejecutado_en: string } | null> {
  const { data } = await supabaseAdmin
    .from("finanzas_ih_ejecuciones")
    .select("ejecutado_en")
    .eq("exito", true)
    .order("ejecutado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Usado por el boton "Actualizar con SII ahora" para saber si el workflow de
// GitHub Actions ya termino: cada corrida completa inserta DOS filas (RCV +
// Portal MIPYME, y despues Boletas de Honorarios -- ver
// scripts/sincronizar-finanzas-ih.mts), asi que la UI hace polling de esto
// hasta ver 2 filas nuevas (o una fallida) desde que se encolo.
export async function obtenerEjecucionesDesdeIh(
  desdeIso: string
): Promise<{ ejecutado_en: string; exito: boolean; mensaje_error: string | null }[]> {
  const { data } = await supabaseAdmin
    .from("finanzas_ih_ejecuciones")
    .select("ejecutado_en, exito, mensaje_error")
    .gt("ejecutado_en", desdeIso)
    .order("ejecutado_en", { ascending: true });
  return data ?? [];
}

// Upsert por la clave natural (empresa, tipo_documento, folio,
// rut_contraparte): re-ejecutar la misma ventana de dias no duplica filas, y
// si el estado SII de un documento cambio se actualiza en vez de insertar.
// No pisa las columnas de SharePoint (pdf/xml_sharepoint_*): esas las llena
// aparte el paso de subida de archivos (lib/finanzas-ih/sharepoint-ih.ts),
// que corre despues y solo para documentos nuevos.
export async function guardarDocumentosIh(documentos: DocumentoIh[]): Promise<number> {
  if (documentos.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("finanzas_ih_documentos")
    .upsert(
      documentos.map((d) => ({
        empresa: d.empresa,
        tipo_documento: d.tipoDocumento,
        direccion: d.direccion,
        codigo_dte: d.codigoDte,
        estado_sii: d.estadoSii,
        rut_contraparte: d.rutContraparte,
        razon_social_contraparte: d.razonSocialContraparte,
        folio: d.folio,
        fecha_emision: d.fechaEmision,
        monto_exento: d.montoExento,
        monto_neto: d.montoNeto,
        monto_iva: d.montoIva,
        monto_total: d.montoTotal,
        periodo: d.periodo,
        fuente: d.fuente,
        codigo_portal: d.codigoPortal,
        actualizado_en: new Date().toISOString(),
      })),
      { onConflict: "empresa,tipo_documento,folio,rut_contraparte", count: "exact" }
    );

  if (error) throw new Error(error.message);
  return count ?? documentos.length;
}

// Trae TODAS las filas de una columna paginando con .range(): PostgREST tope
// las filas por respuesta a su "db-max-rows" (1000 por defecto en Supabase)
// sin importar el .limit()/tamaño de la tabla -- mismo motivo que
// obtenerColumnaCompleta en lib/facturas-historicas.ts. Sin esto,
// listarClavesYaRespaldadasIh y actualizarRespaldosPorClaveIh solo veian los
// primeros 1000 documentos y perdian de vista el resto silenciosamente
// (descubierto diagnosticando el FUNCTION_INVOCATION_TIMEOUT de produccion,
// 2026-08-13 -- ver [[project-facturas-ih-boletas-bhe]]).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function paginarTodo<T>(columnas: string, filtrar?: (query: any) => any): Promise<T[]> {
  const filas: T[] = [];
  const tamanoPagina = 1000;
  for (let desde = 0; ; desde += tamanoPagina) {
    let query = supabaseAdmin.from("finanzas_ih_documentos").select(columnas).range(desde, desde + tamanoPagina - 1);
    if (filtrar) query = filtrar(query);
    const { data } = await query;
    if (!data || data.length === 0) break;
    filas.push(...(data as T[]));
    if (data.length < tamanoPagina) break;
  }
  return filas;
}

// Documentos que YA tienen XML o PDF en SharePoint -- lib/finanzas-ih/
// sii-guias-ih.ts los usa para no volver a pedirlos cada corrida (el
// respaldo se hace EN LINEA durante el scraping, no en un paso aparte; ver
// ese archivo para el porque).
export async function listarClavesYaRespaldadasIh(): Promise<Set<string>> {
  const filas = await paginarTodo<{ folio: number; rut_contraparte: string }>("folio, rut_contraparte", (q) =>
    q.or("xml_sharepoint_item_id.not.is.null,pdf_sharepoint_item_id.not.is.null")
  );

  const claves = new Set<string>();
  for (const fila of filas) {
    claves.add(claveDocumento(fila.folio, fila.rut_contraparte));
  }
  return claves;
}

// Aplica los respaldos conseguidos en esta corrida (clave = claveDocumento)
// contra las filas ya guardadas -- se hace por clave y no por id porque
// sii-guias-ih.ts no conoce el id de Supabase (opera solo con folio/rut).
export async function actualizarRespaldosPorClaveIh(respaldos: Map<string, RespaldoDocumento>): Promise<number> {
  if (respaldos.size === 0) return 0;

  const data = await paginarTodo<{ id: string; folio: number; rut_contraparte: string }>("id, folio, rut_contraparte");
  let actualizados = 0;
  for (const fila of data ?? []) {
    const respaldo = respaldos.get(claveDocumento(fila.folio, fila.rut_contraparte));
    if (!respaldo) continue;

    const cambios: Record<string, unknown> = {
      xml_sharepoint_item_id: respaldo.xmlSharepointItemId ?? null,
      xml_sharepoint_web_url: respaldo.xmlSharepointWebUrl ?? null,
      pdf_sharepoint_item_id: respaldo.pdfSharepointItemId ?? null,
      pdf_sharepoint_web_url: respaldo.pdfSharepointWebUrl ?? null,
      actualizado_en: new Date().toISOString(),
    };
    if (respaldo.datos) cambios.datos = respaldo.datos;

    const { error } = await supabaseAdmin.from("finanzas_ih_documentos").update(cambios).eq("id", fila.id);
    if (!error) actualizados++;
  }
  return actualizados;
}

export async function registrarEjecucionIh(
  exito: boolean,
  documentosNuevos: number,
  archivosSubidos: number,
  mensajeError?: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("finanzas_ih_ejecuciones").insert({
    exito,
    documentos_nuevos: documentosNuevos,
    archivos_subidos: archivosSubidos,
    mensaje_error: mensajeError ?? null,
  });
  if (error) throw new Error(error.message);
}
