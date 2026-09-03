import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { ESTADOS_FACTURA, type EstadoFactura, type FacturaSii } from "./sii-rcv";

export interface FacturaSiiFila {
  id: string;
  tipo_documento: "compra" | "venta";
  codigo_dte: number;
  /** Ver ESTADOS_FACTURA: la tabla tiene un CHECK con esos mismos valores. */
  estado: EstadoFactura;
  rut_contraparte: string;
  razon_social: string | null;
  folio: number;
  fecha_docto: string | null;
  fecha_recepcion: string | null;
  /** Acuse de recibo del receptor. Solo ventas. */
  fecha_acuse: string | null;
  /** Reclamo del receptor. Solo ventas: de acá sale estado = reclamado. */
  fecha_reclamo: string | null;
  monto_exento: number | null;
  monto_neto: number | null;
  monto_iva_recuperable: number | null;
  monto_iva_no_recuperable: number | null;
  monto_total: number | null;
  periodo: string;
  creado_en: string;
  actualizado_en: string;
}

/**
 * Las facturas del panel.
 *
 * El tope estaba en 300 y la tabla llegó a 303 el día que se pusieron al día cuatro
 * meses: tres filas quedaron afuera sin que nada lo dijera, y con ellas los totales de
 * las tarjetas dejaron de cuadrar con el SII. Un tope que recorta en silencio es peor que
 * no tener tope: no se nota hasta que alguien suma a mano.
 *
 * 5000 no es un número mágico: son unos tres años de RCV de PERTEC, y sigue siendo una
 * sola consulta de una tabla chica. Si algún día se acerca, el panel necesita paginar de
 * verdad —no un tope más grande— y por eso se avisa en el log en vez de recortar callado.
 */
export async function listarFacturasSii(limite = 5000): Promise<FacturaSiiFila[]> {
  const { data } = await supabaseAdmin
    .from("facturas_sii")
    .select("*")
    .order("fecha_docto", { ascending: false })
    .order("folio", { ascending: false })
    .limit(limite);
  const filas = (data ?? []) as FacturaSiiFila[];
  if (filas.length === limite) {
    console.warn(
      `[finanzas] el panel llegó al tope de ${limite} facturas: hay filas que no se están ` +
        "mostrando y los totales del encabezado quedan cortos. Hace falta paginar.",
    );
  }
  return filas;
}

// Solo la ultima corrida EXITOSA: los fallos se avisan por correo a
// soporte@pertec.cl, nunca se muestran en el dashboard.
export async function obtenerUltimaEjecucionExitosa(): Promise<{
  ejecutado_en: string;
} | null> {
  const { data } = await supabaseAdmin
    .from("finanzas_sii_ejecuciones")
    .select("ejecutado_en")
    .eq("exito", true)
    .order("ejecutado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Upsert por la clave natural (tipo_documento, codigo_dte, rut_contraparte,
// folio): re-ejecutar la misma ventana de dias no debe duplicar filas, y si
// el estado de un documento cambio (ej. de "pendiente" a "registro") se
// actualiza en vez de insertar una fila nueva.
export async function guardarFacturasSii(filas: FacturaSii[]): Promise<number> {
  if (filas.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from("facturas_sii")
    .upsert(
      filas.map((f) => ({
        tipo_documento: f.tipoDocumento,
        codigo_dte: f.codigoDte,
        estado: f.estado,
        rut_contraparte: f.rutContraparte,
        razon_social: f.razonSocial,
        folio: f.folio,
        fecha_docto: f.fechaDocto,
        fecha_recepcion: f.fechaRecepcion,
        fecha_acuse: f.fechaAcuse,
        fecha_reclamo: f.fechaReclamo,
        monto_exento: f.montoExento,
        monto_neto: f.montoNeto,
        monto_iva_recuperable: f.montoIvaRecuperable,
        monto_iva_no_recuperable: f.montoIvaNoRecuperable,
        monto_total: f.montoTotal,
        periodo: f.periodo,
        actualizado_en: new Date().toISOString(),
      })),
      { onConflict: "tipo_documento,codigo_dte,rut_contraparte,folio", count: "exact" }
    );

  if (error) {
    // El CHECK de estado rechaza el valor pero no lo nombra: Postgres dice
    // "violates check constraint facturas_sii_estado_check" y nada mas. Pasó con
    // "aceptado", que se agregó al código y no a la tabla, y sin esto la próxima vez
    // vuelve a costar una corrida entera darse cuenta de cuál valor sobra.
    if (error.message.includes("facturas_sii_estado_check")) {
      const intentados = [...new Set(filas.map((f) => f.estado))].sort();
      const sobran = intentados.filter((e) => !ESTADOS_FACTURA.includes(e));
      throw new Error(
        `${error.message} — se intentó guardar: ${intentados.join(", ")}.` +
          (sobran.length > 0
            ? ` No están en ESTADOS_FACTURA: ${sobran.join(", ")}.`
            : " Todos están en ESTADOS_FACTURA, así que falta la migración del CHECK en la tabla."),
      );
    }
    throw new Error(error.message);
  }
  return count ?? filas.length;
}

/**
 * Una fila de la tabla al tipo que usa el resto del módulo.
 *
 * Los montos pasan por Number() aunque la fila los declare number: PostgREST puede
 * devolver un numeric como string, y `suma + "42358564"` no suma, concatena — el total
 * del correo saldría con veinte dígitos.
 */
function comoFacturaSii(f: FacturaSiiFila): FacturaSii {
  const monto = (valor: number | null): number | null =>
    valor === null || valor === undefined ? null : Number(valor);
  return {
    tipoDocumento: f.tipo_documento,
    codigoDte: Number(f.codigo_dte),
    estado: f.estado,
    rutContraparte: f.rut_contraparte,
    razonSocial: f.razon_social,
    folio: Number(f.folio),
    fechaDocto: f.fecha_docto,
    fechaRecepcion: f.fecha_recepcion,
    montoExento: monto(f.monto_exento),
    montoNeto: monto(f.monto_neto),
    montoIvaRecuperable: monto(f.monto_iva_recuperable),
    montoIvaNoRecuperable: monto(f.monto_iva_no_recuperable),
    montoTotal: monto(f.monto_total),
    periodo: f.periodo,
    fechaAcuse: f.fecha_acuse,
    fechaReclamo: f.fecha_reclamo,
  };
}

/**
 * Las ventas reclamadas o rechazadas que TODAVÍA NO se avisaron.
 *
 * Lo que decide es `avisado_en`, no el estado. La primera versión comparaba el estado
 * leído del SII contra el guardado y avisaba "lo nuevo", y eso tenía un agujero: la
 * factura quedaba guardada como reclamada aunque el correo hubiera fallado, así que en la
 * corrida siguiente ya no era nueva y no se avisaba nunca más. Pasó con nueve facturas
 * por $121 millones: se guardaron, la pantalla dijo "avisadas por correo" y a Finanzas no
 * le llegó nada, sin forma de reintentar.
 *
 * Con esto el reintento es automático: el sello se pone recién cuando el envío sale bien
 * (ver marcarReclamosAvisados), así que un correo caído se vuelve a intentar solo en la
 * corrida siguiente, y una vez avisado no se repite.
 *
 * Se consulta DESPUÉS de guardar, al contrario que antes: ahora la marca no es el estado,
 * así que guardar no borra la información que hace falta para decidir.
 *
 * Solo ventas: en compra el reclamo lo hace PERTEC, no es una novedad para nadie.
 */
export async function reclamosSinAvisar(): Promise<FacturaSii[]> {
  const { data, error } = await supabaseAdmin
    .from("facturas_sii")
    .select("*")
    .eq("tipo_documento", "venta")
    .eq("estado", "reclamado")
    .is("avisado_en", null)
    .order("fecha_docto", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => comoFacturaSii(f as FacturaSiiFila));
}

/**
 * Marca estas ventas como avisadas. Se llama SOLO si el correo salió.
 *
 * Si se llamara antes de enviar, o pase lo que pase con el envío, se vuelve al agujero de
 * la primera versión: una factura marcada como avisada que nadie avisó.
 */
export async function marcarReclamosAvisados(reclamos: FacturaSii[]): Promise<void> {
  if (reclamos.length === 0) return;
  const ahora = new Date().toISOString();
  // De a una y por su clave natural completa —la misma del upsert— porque dos empresas
  // distintas pueden emitir el mismo folio en tipos de documento distintos.
  for (const f of reclamos) {
    const { error } = await supabaseAdmin
      .from("facturas_sii")
      .update({ avisado_en: ahora })
      .eq("tipo_documento", "venta")
      .eq("codigo_dte", f.codigoDte)
      .eq("rut_contraparte", f.rutContraparte)
      .eq("folio", f.folio);
    if (error) throw new Error(error.message);
  }
}

/**
 * Olvida el aviso de una venta que ya no está reclamada.
 *
 * El cliente puede revertir un reclamo. Si después vuelve a reclamar la misma factura, eso
 * es un hecho NUEVO y hay que avisarlo: sin esto, el sello viejo lo taparía para siempre.
 */
export async function olvidarAvisosDeReclamosRevertidos(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("facturas_sii")
    .update({ avisado_en: null })
    .eq("tipo_documento", "venta")
    .neq("estado", "reclamado")
    .not("avisado_en", "is", null);
  if (error) throw new Error(error.message);
}

export async function registrarEjecucion(
  exito: boolean,
  documentosNuevos: number,
  mensajeError?: string,
  /**
   * Lo que hay que poder mirar después, y que en un log de Vercel se pierde.
   *
   * En un objeto y no como dos parámetros más: ya se pasaron mal una vez —el diagnóstico
   * viajó en el lugar del aviso— y un cuarto y quinto argumento opcionales del mismo
   * tipo se confunden solos.
   */
  extras: {
    /**
     * Cómo salió el aviso a Finanzas: { folios, destinatario, asunto, enviado, error }.
     *
     * Ausente cuando no había reclamos nuevos que avisar. Existe porque no había forma de
     * contestar "¿salió el correo?": el envío va por Graph y su fallo se atrapaba en un
     * console.error que se pierde con los logs, mientras la pantalla igual decía
     * "avisadas por correo a Finanzas".
     */
    aviso?: unknown;
    /**
     * Qué ofreció el RCV, cuando ninguna venta trajo estado.
     *
     * Para poder MIRAR qué trae el SII en vez de deducirlo: el estado de las ventas se
     * derivó dos veces de columnas supuestas. Solo rótulos de columna y de pestaña:
     * ningún valor de ninguna fila.
     */
    diagnostico?: unknown;
  } = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from("finanzas_sii_ejecuciones").insert({
    exito,
    documentos_nuevos: documentosNuevos,
    mensaje_error: mensajeError ?? null,
    aviso_reclamos: extras.aviso ?? null,
    diagnostico: extras.diagnostico ?? null,
  });
  if (error) throw new Error(error.message);
}
