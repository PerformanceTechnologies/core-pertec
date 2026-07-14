import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { DteParseado } from "./xml-dte";
import type { DatosCompraExtraidos } from "./extraer-datos-factura-compra";

export interface FacturaVentaFila {
  id: string;
  drive_item_id: string;
  nombre_archivo: string;
  anio: number;
  mes: number;
  folio: number | null;
  tipo_dte: number | null;
  rut_receptor: string | null;
  razon_social_receptor: string | null;
  fecha_emision: string | null;
  monto_exento: number | null;
  monto_neto: number | null;
  monto_iva: number | null;
  monto_total: number | null;
  datos: DteParseado["datos"];
  web_url: string | null;
  creado_en: string;
}

export interface FiltrosFacturaVenta {
  folio?: number;
  rut?: string;
  busqueda?: string; // razon social, texto libre
  fechaDesde?: string;
  fechaHasta?: string;
}

export async function listarFacturasVenta(filtros: FiltrosFacturaVenta = {}, limite = 300): Promise<FacturaVentaFila[]> {
  let consulta = supabaseAdmin.from("facturas_venta_historico").select("*");

  if (filtros.folio) consulta = consulta.eq("folio", filtros.folio);
  if (filtros.rut) consulta = consulta.ilike("rut_receptor", `%${filtros.rut}%`);
  if (filtros.busqueda) consulta = consulta.ilike("razon_social_receptor", `%${filtros.busqueda}%`);
  if (filtros.fechaDesde) consulta = consulta.gte("fecha_emision", filtros.fechaDesde);
  if (filtros.fechaHasta) consulta = consulta.lte("fecha_emision", filtros.fechaHasta);

  const { data, error } = await consulta
    .order("fecha_emision", { ascending: false })
    .order("folio", { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);
  return (data ?? []) as FacturaVentaFila[];
}

// Paginado explicito: Supabase/PostgREST limita cada respuesta a 1000 filas
// por defecto -- sin esto, con mas de 1000 documentos ya indexados el set
// queda incompleto y el indexador vuelve a descargar y procesar archivos que
// ya estaban guardados en cada corrida.
async function obtenerColumnaCompleta(tabla: string, columna: string): Promise<string[]> {
  const valores: string[] = [];
  const tamanoPagina = 1000;
  let desde = 0;

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(tabla)
      .select(columna)
      .range(desde, desde + tamanoPagina - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const fila of data) valores.push((fila as unknown as Record<string, string>)[columna]);
    if (data.length < tamanoPagina) break;
    desde += tamanoPagina;
  }

  return valores;
}

// IDs ya indexados: el backfill/cron los usa para no volver a descargar y
// parsear un XML que ya esta en la tabla (los archivos de este historico no
// se modifican una vez archivados).
export async function obtenerDriveItemIdsIndexados(): Promise<Set<string>> {
  return new Set(await obtenerColumnaCompleta("facturas_venta_historico", "drive_item_id"));
}

export interface ArchivoVentaAIndexar {
  driveItemId: string;
  nombreArchivo: string;
  anio: number;
  mes: number;
  webUrl: string;
  dte: DteParseado;
}

export async function guardarFacturasVenta(archivos: ArchivoVentaAIndexar[]): Promise<number> {
  if (archivos.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("facturas_venta_historico")
    .upsert(
      archivos.map((a) => ({
        drive_item_id: a.driveItemId,
        nombre_archivo: a.nombreArchivo,
        anio: a.anio,
        mes: a.mes,
        folio: a.dte.folio,
        tipo_dte: a.dte.tipoDte,
        rut_receptor: a.dte.rutReceptor,
        razon_social_receptor: a.dte.razonSocialReceptor,
        fecha_emision: a.dte.fechaEmision,
        monto_exento: a.dte.montoExento,
        monto_neto: a.dte.montoNeto,
        monto_iva: a.dte.montoIva,
        monto_total: a.dte.montoTotal,
        datos: a.dte.datos,
        web_url: a.webUrl,
      })),
      { onConflict: "drive_item_id", count: "exact" }
    );

  if (error) throw new Error(error.message);
  return count ?? archivos.length;
}

// Solo la ultima corrida EXITOSA: los fallos se avisan por correo, nunca se
// muestran en el dashboard (mismo patron que finanzas_sii_ejecuciones).
export async function obtenerUltimaEjecucionHistoricoExitosa(): Promise<{ ejecutado_en: string } | null> {
  const { data } = await supabaseAdmin
    .from("facturas_historico_ejecuciones")
    .select("ejecutado_en")
    .eq("exito", true)
    .order("ejecutado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function registrarEjecucionHistorico(
  exito: boolean,
  documentosNuevos: number,
  mensajeError?: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("facturas_historico_ejecuciones").insert({
    exito,
    documentos_nuevos: documentosNuevos,
    mensaje_error: mensajeError ?? null,
  });
  if (error) throw new Error(error.message);
}

// --- Compras (PDF): texto completo indexado, ver comentario en la migracion
// de facturas_compra_historico sobre por que no se uso busqueda de Graph. ---

export interface ResultadoBusquedaCompra {
  id: string;
  nombre: string;
  webUrl: string | null;
  ultimaModificacion: string;
  folio: number | null;
  tipoDocumentoDetectado: string | null;
  rutEmisor: string | null;
  razonSocialEmisor: string | null;
  fechaEmision: string | null;
  montoTotal: number | null;
}

export async function obtenerDriveItemIdsIndexadosCompra(): Promise<Set<string>> {
  return new Set(await obtenerColumnaCompleta("facturas_compra_historico", "drive_item_id"));
}

export interface ArchivoCompraAIndexar {
  driveItemId: string;
  nombreArchivo: string;
  anio: number;
  mes: number;
  webUrl: string;
  textoExtraido: string;
  datos: DatosCompraExtraidos;
}

export async function guardarFacturasCompra(archivos: ArchivoCompraAIndexar[]): Promise<number> {
  if (archivos.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("facturas_compra_historico")
    .upsert(
      archivos.map((a) => ({
        drive_item_id: a.driveItemId,
        nombre_archivo: a.nombreArchivo,
        anio: a.anio,
        mes: a.mes,
        texto_extraido: a.textoExtraido,
        web_url: a.webUrl,
        folio: a.datos.folio,
        tipo_documento_detectado: a.datos.tipoDocumentoDetectado,
        rut_emisor: a.datos.rutEmisor,
        razon_social_emisor: a.datos.razonSocialEmisor,
        fecha_emision: a.datos.fechaEmision,
        monto_total: a.datos.montoTotal,
      })),
      { onConflict: "drive_item_id", count: "exact" }
    );

  if (error) throw new Error(error.message);
  return count ?? archivos.length;
}

export interface FiltrosFacturaCompra {
  termino?: string; // texto libre (RUT, proveedor, folio) contra el texto extraido del PDF
  tiposDocumento?: string[]; // valores exactos de tipo_documento_detectado
}

// Busqueda de texto libre (ILIKE, no tsvector): un RUT o folio se escribe
// siempre igual, y con ~5 mil filas una sub-busqueda de substring es rapida
// sin depender de como el diccionario "spanish" de Postgres tokenice numeros
// con puntos y guiones.
export async function buscarFacturasCompraIndexadas(
  filtros: FiltrosFacturaCompra,
  limite = 100
): Promise<ResultadoBusquedaCompra[]> {
  let consulta = supabaseAdmin
    .from("facturas_compra_historico")
    .select(
      "drive_item_id, nombre_archivo, web_url, creado_en, folio, tipo_documento_detectado, rut_emisor, razon_social_emisor, fecha_emision, monto_total"
    );

  if (filtros.termino) {
    const patron = `%${filtros.termino.replace(/[%_]/g, "\\$&")}%`;
    consulta = consulta.or(`texto_extraido.ilike.${patron},nombre_archivo.ilike.${patron}`);
  }
  if (filtros.tiposDocumento && filtros.tiposDocumento.length > 0) {
    consulta = consulta.in("tipo_documento_detectado", filtros.tiposDocumento);
  }

  const { data, error } = await consulta
    .order("fecha_emision", { ascending: false, nullsFirst: false })
    .order("anio", { ascending: false })
    .order("mes", { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);

  return (data ?? []).map((f) => ({
    id: f.drive_item_id as string,
    nombre: f.nombre_archivo as string,
    webUrl: f.web_url as string | null,
    ultimaModificacion: f.creado_en as string,
    folio: f.folio as number | null,
    tipoDocumentoDetectado: f.tipo_documento_detectado as string | null,
    rutEmisor: f.rut_emisor as string | null,
    razonSocialEmisor: f.razon_social_emisor as string | null,
    fechaEmision: f.fecha_emision as string | null,
    montoTotal: f.monto_total as number | null,
  }));
}
