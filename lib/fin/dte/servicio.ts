import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../supabase-admin";
import { faltantesParaFacturar, type DatosContacto } from "../../contactos-modelo";
import { normalizarRut } from "../../contratos/rut";
import { auditar, periodoCerrado, registrarEvento, revienta, type ContextoFin } from "../datos";
import {
  calcularTotales, esAccionRecibido, nombreCorto, normalizarDocumento, validarCesion, validarDocumento,
  type AccionRecibido, type CesionDte, type DocumentoDte, type EstadoEmision, type EstadoSii, type Iso, type PersonaAutorizada, type TipoEmitible,
} from "./modelo";
import { ErrorDte, type Ambiente, type DocumentoRecibido, type EmisorDte, type ProveedorDte } from "./proveedor";
import { buscarEmitido, crearProveedorSimpleFactura } from "./simplefactura";
import { after } from "next/server";
import { archivarDte } from "./archivo";
import { cuentaSimpleFactura, estadoCuentaDte, registrarPruebaDte, type CuentaSimpleFactura } from "./cuenta";

// -----------------------------------------------------------------------------
//  Facturación electrónica: el servicio (solo servidor).
//
//  Orquesta: arma el emisor con los datos de la empresa activa, valida con las mismas reglas del editor, llama al
//  proveedor y deja todo en la base. Las Server Actions (acciones-dte.ts) solo verifican permisos y llaman aquí.
//
//  Garantías:
//   · Una emisión no sale dos veces: antes de llamar al proveedor se toma la fila con un update condicionado
//     (estado borrador/error → enviando). Un doble clic o dos pestañas: el segundo no encuentra la fila libre.
//   · Si la llamada queda en duda (timeout, 5xx), la fila queda «enviando» con aviso: NO se reintenta a ciegas,
//     porque el SII pudo haber recibido el documento. Se revisa en el proveedor y se marca a mano.
//   · En certificación (pruebas) nada toca fin_documentos, hitos, saldos, flujo ni contabilidad.
//   · Las credenciales son de cada empresa, cifradas en fin_dte_cuentas (las carga el administrador del Core).
//   · Sin la emisión habilitada por el administrador se puede consultar, pero no emitir, ceder ni responder al SII.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ConfigDte {
  /** La empresa tiene cargada su cuenta del proveedor (Administración › Integraciones). */
  configurado: boolean;
  /** El administrador del Core habilitó la emisión (sin esto: solo consultas). */
  emisionHabilitada: boolean;
  /** Carpeta de SharePoint donde se archivan los documentos (null = la de omisión). */
  carpetaSp: string | null;
  /** La empresa activa tiene la facturación electrónica encendida (Configuración). */
  activo: boolean;
  ambiente: Ambiente;
  proveedorNombre: string;
  emisor: EmisorDte;
  /** Lo que le falta a la empresa (emisor) para emitir. Vacío = completa. */
  faltantesEmisor: string[];
  /** Quien firma las cesiones (AEC) por la empresa. Null si falta algún dato. */
  personaAutorizada: PersonaAutorizada | null;
  /** El servidor emite con otro RUT (cuenta demo de SimpleFactura, solo en certificación). */
  emisorDemo: boolean;
  tasaIva: number;
}

/** Lee la configuración de facturación de la empresa activa. Nunca lanza por falta de configuración. */
export async function configuracionDte(empresaId: string): Promise<ConfigDte> {
  const [{ data: e, error: e1 }, { data: par, error: e2 }, cuenta] = await Promise.all([
    supabaseAdmin.from("empresas").select("*").eq("id", empresaId).single(),
    supabaseAdmin.from("fin_parametros").select("tasa_iva, flags").eq("empresa_id", empresaId).maybeSingle(),
    estadoCuentaDte(empresaId),
  ]);
  revienta("leer la empresa", e1);
  revienta("leer los parámetros", e2);
  const r = e as any;
  const flags = ((par as any)?.flags ?? {}) as Record<string, unknown>;
  const emisor: EmisorDte = {
    // SimpleFactura exige el RUT sin puntos y con guion («77.590.967-6» → «77590967-6»).
    rut: r.rut ? normalizarRut(r.rut) : "",
    razonSocial: (flags.dte_razon_social as string) || r.razon_social || r.nombre,
    giro: r.giro ?? null,
    acteco: r.acteco ?? null,
    direccion: r.direccion ?? null,
    comuna: r.comuna ?? null,
    ciudad: r.ciudad ?? null,
    correo: r.correo_dte ?? r.correo_comercial ?? null,
    telefono: r.telefono ?? null,
    sucursal: (flags.dte_sucursal as string) || "Casa Matriz",
  };
  const falta: string[] = [];
  if (!emisor.rut) falta.push("RUT");
  if (!emisor.giro) falta.push("giro");
  if (!emisor.acteco) falta.push("código de actividad económica (acteco)");
  if (!emisor.direccion) falta.push("dirección");
  if (!emisor.comuna) falta.push("comuna");
  return {
    configurado: cuenta.cargada,
    emisionHabilitada: cuenta.emisionHabilitada,
    carpetaSp: cuenta.carpetaSp,
    activo: flags.dte_activo === true,
    ambiente: cuenta.ambiente,
    proveedorNombre: "SimpleFactura",
    emisor,
    faltantesEmisor: falta,
    personaAutorizada: flags.dte_cesion_rut && flags.dte_cesion_nombre && flags.dte_cesion_correo
      ? { rut: String(flags.dte_cesion_rut), nombre: String(flags.dte_cesion_nombre), correo: String(flags.dte_cesion_correo) }
      : null,
    emisorDemo: cuenta.ambiente === "certificacion" && Boolean(cuenta.rutEmisorPrueba),
    tasaIva: Number((par as any)?.tasa_iva ?? 0.19),
  };
}

/**
 * El proveedor listo para usar, o un error que se puede mostrar tal cual a la persona.
 * «consulta»: estados, PDF/XML, recibidos (basta la cuenta cargada). «emision»: emitir, ceder, responder al SII
 * (además la emisión habilitada por el administrador, la facturación encendida y el emisor completo).
 */
export async function proveedorDe(empresaId: string, uso: "consulta" | "emision" = "emision"): Promise<{ cfg: ConfigDte; prov: ProveedorDte; cuenta: CuentaSimpleFactura }> {
  const [cfg, cuenta] = await Promise.all([configuracionDte(empresaId), cuentaSimpleFactura(empresaId)]);
  if (!cfg.configurado || !cuenta) throw new ErrorDte("La facturación electrónica aún no está conectada: el administrador del Core carga la cuenta de SimpleFactura en Administración › Integraciones.", "sin_configurar", 0);
  if (uso === "emision") {
    if (!cfg.emisionHabilitada) throw new ErrorDte("La emisión de documentos aún no está habilitada. El administrador del Core la habilita en Administración › Integraciones.", "emision_deshabilitada", 0);
    if (!cfg.activo) throw new ErrorDte("La facturación electrónica está apagada para esta empresa. Enciéndela en Facturación › Configuración.", "apagado", 0);
    if (cfg.faltantesEmisor.length && !cfg.emisorDemo) throw new ErrorDte(`Faltan datos de la empresa para emitir: ${cfg.faltantesEmisor.join(", ")}. Complétalos en Facturación › Configuración.`, "emisor_incompleto", 0);
  }
  return { cfg, prov: crearProveedorSimpleFactura(cuenta), cuenta };
}

// ---------- Clientes (receptores) ----------------------------------------------------------------

export interface ClienteDteFila {
  id: string;
  rut: string | null;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correoDte: string | null;
  plazoDias: number | null;
  faltantes: string[];
}

/** Contactos activos con lo que el receptor necesita; el plazo de venta del perfil de la empresa manda. */
export async function clientesParaDte(empresaId: string): Promise<ClienteDteFila[]> {
  const [{ data, error }, { data: perfiles }] = await Promise.all([
    supabaseAdmin.from("finanzas_contactos").select("*").eq("activo", true).order("razon_social").limit(10000),
    supabaseAdmin.from("fin_perfiles").select("contacto_id, condicion_venta_dias").eq("empresa_id", empresaId),
  ]);
  revienta("leer los contactos", error);
  const plazo = new Map<string, number | null>((perfiles ?? []).map((p: any) => [p.contacto_id, p.condicion_venta_dias]));
  return (data ?? [])
    .filter((c: any) => c.tipo_contribuyente !== "extranjero")
    .map((c: any) => {
      const datos: DatosContacto = {
        rut: c.rut, tipoPersona: c.tipo_persona, razonSocial: c.razon_social, giro: c.giro, direccion: c.direccion, comuna: c.comuna, ciudad: c.ciudad, pais: c.pais,
        tipoContribuyente: c.tipo_contribuyente, correoDte: c.correo_dte, correo: c.correo, telefono: c.telefono, esCliente: c.es_cliente, esProveedor: c.es_proveedor,
        plazoPagoDias: c.plazo_pago_dias, notas: c.notas,
      };
      return {
        id: c.id, rut: c.rut, razonSocial: c.razon_social, giro: c.giro, direccion: c.direccion, comuna: c.comuna, ciudad: c.ciudad, correoDte: c.correo_dte,
        plazoDias: plazo.get(c.id) ?? c.plazo_pago_dias ?? null,
        faltantes: faltantesParaFacturar(datos).filter((f) => f.bloquea).map((f) => f.texto.replace(/^Falta (el|la) /, "").replace(/^El |^«/, "")),
      };
    });
}

// ---------- Emisiones -----------------------------------------------------------------------------

export interface Emision {
  id: string;
  tipoDte: TipoEmitible;
  estado: EstadoEmision;
  ambiente: Ambiente;
  documento: DocumentoDte;
  contraparteId: string | null;
  receptorRut: string;
  receptorNombre: string | null;
  fechaEmision: Iso;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  hitoIds: string[];
  documentoReferenciadoId: string | null;
  folio: string | null;
  trackId: string | null;
  documentoId: string | null;
  error: string | null;
  intentos: number;
  creadoPor: string | null;
  creadoEn: string;
  enviadoPor: string | null;
  enviadoEn: string | null;
  emitidoEn: string | null;
  estadoSii: EstadoSii | null;
  estadoSiiDetalle: string | null;
}

const aEmision = (r: any, doc?: any): Emision => ({
  id: r.id, tipoDte: r.tipo_dte, estado: r.estado, ambiente: r.ambiente, documento: r.documento, contraparteId: r.contraparte_id, receptorRut: r.receptor_rut,
  receptorNombre: r.receptor_nombre, fechaEmision: r.fecha_emision, neto: Number(r.neto), exento: Number(r.exento), iva: Number(r.iva), total: Number(r.total),
  hitoIds: r.hito_ids ?? [], documentoReferenciadoId: r.documento_referenciado_id, folio: r.folio, trackId: r.track_id, documentoId: r.documento_id, error: r.error,
  intentos: r.intentos, creadoPor: r.creado_por, creadoEn: r.creado_en, enviadoPor: r.enviado_por, enviadoEn: r.enviado_en, emitidoEn: r.emitido_en,
  estadoSii: (doc?.estado_sii ?? r.respuesta?.estadoSii ?? null) as EstadoSii | null,
  estadoSiiDetalle: doc?.estado_sii_detalle ?? r.respuesta?.estadoSiiDetalle ?? null,
});

export async function listarEmisiones(empresaId: string, limite = 500): Promise<Emision[]> {
  const { data, error } = await supabaseAdmin.from("fin_dte_emisiones").select("*").eq("empresa_id", empresaId).order("creado_en", { ascending: false }).limit(limite);
  revienta("leer las emisiones", error);
  const docIds = (data ?? []).map((r: any) => r.documento_id).filter(Boolean);
  const docs = docIds.length ? (await supabaseAdmin.from("fin_documentos").select("id, estado_sii, estado_sii_detalle").in("id", docIds)).data ?? [] : [];
  const porId = new Map(docs.map((d: any) => [d.id, d]));
  return (data ?? []).map((r: any) => aEmision(r, r.documento_id ? porId.get(r.documento_id) : null));
}

export async function obtenerEmision(empresaId: string, id: string): Promise<Emision | null> {
  const { data, error } = await supabaseAdmin.from("fin_dte_emisiones").select("*").eq("empresa_id", empresaId).eq("id", id).maybeSingle();
  revienta("leer la emisión", error);
  if (!data) return null;
  const doc = (data as any).documento_id ? (await supabaseAdmin.from("fin_documentos").select("estado_sii, estado_sii_detalle").eq("id", (data as any).documento_id).maybeSingle()).data : null;
  return aEmision(data, doc);
}

export interface OrigenEmision {
  hitoIds?: string[];
  documentoReferenciadoId?: string | null;
}

/** Lee y normaliza el JSON que manda el editor. Devuelve el documento o un texto de error. */
export function leerDocumento(json: string): DocumentoDte | string {
  try {
    const d = JSON.parse(json) as DocumentoDte;
    if (!d || typeof d !== "object" || !Array.isArray(d.lineas) || !Array.isArray(d.referencias) || !d.receptor) return "El documento llegó incompleto.";
    return normalizarDocumento(d);
  } catch {
    return "El documento llegó dañado.";
  }
}

/** Revisa que lo que viene del Core (hitos, documento referenciado) sea de la empresa y esté disponible. */
async function validarOrigen(ctx: ContextoFin, doc: DocumentoDte, origen: OrigenEmision, contraparteId: string | null): Promise<string | null> {
  const e = ctx.empresa.id;
  if (origen.hitoIds?.length) {
    if (doc.tipo !== 33 && doc.tipo !== 34 && doc.tipo !== 52) return "Solo facturas y guías nacen de hitos.";
    const { data: hitos, error } = await supabaseAdmin.from("fin_hitos").select("id, cliente_id, anulado").eq("empresa_id", e).in("id", origen.hitoIds);
    revienta("leer los hitos", error);
    if ((hitos ?? []).length !== origen.hitoIds.length) return "Alguno de los hitos no existe o es de otra empresa.";
    if ((hitos ?? []).some((h: any) => h.anulado)) return "Alguno de los hitos está anulado.";
    if (contraparteId && (hitos ?? []).some((h: any) => h.cliente_id && h.cliente_id !== contraparteId)) return "El cliente de la factura no es el de los hitos.";
    if (doc.tipo !== 52) {
      // Un hito no se factura dos veces: ni con factura vigente ni con otra emisión en curso.
      const { data: ligadas } = await supabaseAdmin
        .from("fin_documento_hitos")
        .select("hito_id, fin_documentos!inner(estado, tipo_dte)")
        .in("hito_id", origen.hitoIds)
        .eq("fin_documentos.estado", "vigente")
        .in("fin_documentos.tipo_dte", [33, 34]);
      if ((ligadas ?? []).length) return "Alguno de los hitos ya tiene una factura vigente.";
    }
  }
  if (origen.documentoReferenciadoId) {
    const { data: ref } = await supabaseAdmin.from("fin_documentos").select("id, direccion, estado, tipo_dte, total").eq("empresa_id", e).eq("id", origen.documentoReferenciadoId).maybeSingle();
    if (!ref) return "El documento que se corrige no existe o es de otra empresa.";
    if ((ref as any).direccion !== "emitido") return "Solo se corrigen documentos emitidos por la empresa.";
    if ((ref as any).estado !== "vigente") return "El documento que se corrige está anulado.";
  }
  return null;
}

/** Guarda (o actualiza) un borrador. No llama al proveedor. */
export async function guardarBorrador(ctx: ContextoFin, id: string | null, doc: DocumentoDte, contraparteId: string | null, origen: OrigenEmision, ambiente: Ambiente, tasaIva: number): Promise<string> {
  const tot = calcularTotales(doc, tasaIva);
  const fila = {
    tipo_dte: doc.tipo, documento: doc, contraparte_id: contraparteId, receptor_rut: doc.receptor.rut, receptor_nombre: doc.receptor.razonSocial || null,
    fecha_emision: doc.fechaEmision, neto: tot.neto, exento: tot.exento, iva: tot.iva, total: tot.total,
    hito_ids: origen.hitoIds ?? [], documento_referenciado_id: origen.documentoReferenciadoId ?? null, actualizado_en: new Date().toISOString(),
  };
  if (id) {
    // Solo se edita lo que no ha salido: borrador o con error.
    const { data, error } = await supabaseAdmin.from("fin_dte_emisiones").update(fila).eq("id", id).eq("empresa_id", ctx.empresa.id).in("estado", ["borrador", "error"]).select("id");
    revienta("guardar el borrador", error);
    if (!data?.length) throw new ErrorDte("Ese documento ya no se puede editar (se está enviando o ya se emitió).", "no_editable", 409);
    return id;
  }
  const { data, error } = await supabaseAdmin
    .from("fin_dte_emisiones")
    .insert({ ...fila, empresa_id: ctx.empresa.id, estado: "borrador", ambiente, clave_idempotencia: randomUUID(), creado_por: ctx.usuario.correo })
    .select("id")
    .single();
  revienta("guardar el borrador", error);
  await auditar(ctx, "fin_dte_emisiones", data!.id, "crear", `Borrador de ${nombreCorto(doc.tipo, null)} para ${doc.receptor.razonSocial} por ${tot.total}`);
  return data!.id;
}

/**
 * Emite un borrador: lo toma (para que nadie más lo mande), valida, llama al proveedor y registra el resultado.
 * Devuelve la emisión al final, en el estado que haya quedado.
 */
export async function emitir(ctx: ContextoFin, emisionId: string): Promise<Emision> {
  const e = ctx.empresa.id;
  const { cfg, prov } = await proveedorDe(e);
  const actual = await obtenerEmision(e, emisionId);
  if (!actual) throw new ErrorDte("Ese documento no existe o es de otra empresa.", "no_existe", 404);
  if (actual.estado === "emitido") return actual;
  if (actual.estado === "enviando") throw new ErrorDte("Este documento ya se está enviando. Si quedó así por un corte, revisa en SimpleFactura si salió antes de reintentar.", "en_curso", 409);
  if (actual.estado === "descartado") throw new ErrorDte("Ese borrador fue descartado.", "descartado", 409);
  if (actual.ambiente !== cfg.ambiente) throw new ErrorDte(`Este borrador es del ambiente de ${actual.ambiente === "produccion" ? "producción" : "pruebas"} y el servidor está en ${cfg.ambiente === "produccion" ? "producción" : "pruebas"}. Crea uno nuevo.`, "ambiente", 409);

  const doc = normalizarDocumento(actual.documento);
  const problemas = validarDocumento(doc, ctx.hoy, cfg.tasaIva);
  if (problemas.length) throw new ErrorDte(problemas.map((p) => p.texto).join(" "), "invalido", 400);
  if (cfg.ambiente === "produccion") {
    const cerrado = await periodoCerrado(e, doc.fechaEmision);
    if (cerrado) throw new ErrorDte(cerrado, "periodo_cerrado", 409);
    const malOrigen = await validarOrigen(ctx, doc, { hitoIds: actual.hitoIds, documentoReferenciadoId: actual.documentoReferenciadoId }, actual.contraparteId);
    if (malOrigen) throw new ErrorDte(malOrigen, "origen", 409);
  }

  // Tomar la fila: borrador/error → enviando. Si otra pestaña ya la tomó, aquí no vuelve ninguna fila.
  const ahora = new Date().toISOString();
  const { data: tomada, error: eTomar } = await supabaseAdmin
    .from("fin_dte_emisiones")
    .update({ estado: "enviando", enviado_por: ctx.usuario.correo, enviado_en: ahora, intentos: actual.intentos + 1, error: null, actualizado_en: ahora })
    .eq("id", emisionId)
    .eq("empresa_id", e)
    .in("estado", ["borrador", "error"])
    .select("id");
  revienta("tomar el documento", eTomar);
  if (!tomada?.length) throw new ErrorDte("Otra persona (u otra pestaña) acaba de enviar este documento.", "en_curso", 409);

  let resultado;
  try {
    resultado = await prov.emitir(cfg.emisor, doc, cfg.tasaIva);
  } catch (err) {
    const incierto = err instanceof ErrorDte ? err.incierto : true;
    const mensaje = err instanceof Error ? err.message.replace(/^\[[^\]]+\]\s*/, "") : "Error desconocido del proveedor.";
    await supabaseAdmin
      .from("fin_dte_emisiones")
      .update({
        // En duda NO vuelve a «error» (que permite reintentar): queda «enviando» hasta revisar en el proveedor.
        estado: incierto ? "enviando" : "error",
        error: incierto ? `Sin respuesta clara de SimpleFactura (${mensaje}). Revisa en SimpleFactura si el documento salió antes de reintentar.` : mensaje,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", emisionId);
    await auditar(ctx, "fin_dte_emisiones", emisionId, incierto ? "envio_incierto" : "rechazo", mensaje);
    throw err instanceof ErrorDte ? err : new ErrorDte(mensaje, "desconocido", 0, true);
  }

  // Salió: folio asignado. Desde aquí, cualquier error se registra pero el documento EXISTE en el SII.
  const tot = calcularTotales(doc, cfg.tasaIva);
  let documentoId: string | null = null;
  const avisos: string[] = [];
  if (cfg.ambiente === "produccion") {
    try {
      documentoId = await registrarEnLibros(ctx, actual, doc, resultado.folio, resultado.trackId, resultado.estadoSii, tot);
    } catch (err) {
      avisos.push(`El documento salió con folio ${resultado.folio}, pero no se pudo registrar en Ventas: ${err instanceof Error ? err.message : err}. Regístralo a mano.`);
    }
  }
  const { error: eFin } = await supabaseAdmin
    .from("fin_dte_emisiones")
    .update({
      estado: "emitido", folio: resultado.folio, track_id: resultado.trackId, documento_id: documentoId, emitido_en: new Date().toISOString(),
      error: avisos.length ? avisos.join(" ") : null, respuesta: { estadoSii: resultado.estadoSii, crudo: recortar(resultado.crudo) }, actualizado_en: new Date().toISOString(),
    })
    .eq("id", emisionId);
  if (eFin) console.error("[dte] emitido pero no se pudo guardar el folio:", emisionId, resultado.folio, eFin.message);
  await auditar(ctx, "fin_dte_emisiones", emisionId, "emitir", `${nombreCorto(doc.tipo, resultado.folio)} a ${doc.receptor.razonSocial} por ${tot.total} (${cfg.ambiente})`);
  await registrarEvento(ctx, "dte_emitido", "dte_emision", emisionId, { tipo: doc.tipo, folio: resultado.folio, total: tot.total, ambiente: cfg.ambiente });
  if (cfg.ambiente === "produccion") enSegundoPlano(() => archivarEmitido(ctx, prov, cfg.emisor, { tipo: doc.tipo, folio: resultado.folio, fecha: doc.fechaEmision, rut: doc.receptor.rut, nombre: doc.receptor.razonSocial, tot, documentoId }));
  return (await obtenerEmision(e, emisionId))!;
}

/** Corre después de responder (after); fuera de una petición (scripts), en el momento. Nunca hace fallar al llamador. */
function enSegundoPlano(f: () => Promise<unknown>): void {
  const seguro = () => f().catch((err) => console.error("[dte] tarea en segundo plano:", err instanceof Error ? err.message : err));
  try {
    after(seguro);
  } catch {
    void seguro();
  }
}

/** Baja el PDF y el XML del documento recién emitido y los deja en SharePoint (Emitidos/AAAA/MM Mes). */
async function archivarEmitido(
  ctx: ContextoFin,
  prov: ProveedorDte,
  emisor: EmisorDte,
  d: { tipo: number; folio: string; fecha: string; rut: string; nombre: string; tot: ReturnType<typeof calcularTotales>; documentoId: string | null },
): Promise<void> {
  const [pdf, xml] = [await prov.pdf(emisor, d.tipo, d.folio).catch(() => null), await prov.xml(emisor, d.tipo, d.folio).catch(() => null)];
  const aviso = await archivarDte(ctx.empresa, {
    clase: "emitido", tipoDte: d.tipo, folio: d.folio, fecha: d.fecha, rut: d.rut, nombre: d.nombre,
    neto: d.tot.neto, iva: d.tot.iva, exento: d.tot.exento, total: d.tot.total, pdf, xml, documentoId: d.documentoId, origen: "emision",
  });
  if (aviso) console.error("[dte] archivo:", aviso);
}

/** Deja el documento emitido en Ventas, igual que el registro manual (hitos, NC que anula, guía en el hito). */
async function registrarEnLibros(ctx: ContextoFin, em: Emision, doc: DocumentoDte, folio: string, trackId: string | null, estadoSii: EstadoSii, tot: ReturnType<typeof calcularTotales>): Promise<string> {
  const e = ctx.empresa.id;
  const referenciasTexto = doc.referencias.map((r) => `${r.tipo === "801" ? "OC" : r.tipo} ${r.folio}`).join(" · ") || null;
  const { data, error } = await supabaseAdmin
    .from("fin_documentos")
    .insert({
      empresa_id: e, direccion: "emitido", tipo_dte: doc.tipo, folio, fecha_emision: doc.fechaEmision, contraparte_id: em.contraparteId, rut_contraparte: doc.receptor.rut,
      razon_social: doc.receptor.razonSocial, neto: tot.neto, exento: tot.exento, iva: tot.iva, total: tot.total, fecha_vencimiento: doc.fechaVencimiento,
      referencias: referenciasTexto?.slice(0, 500) ?? null, documento_referenciado_id: em.documentoReferenciadoId, origen: "api_dte", estado_sii: estadoSii,
      track_id: trackId, ambiente: "produccion", emision_id: em.id, estado_sii_en: new Date().toISOString(), creado_por: ctx.usuario.correo,
    })
    .select("id")
    .single();
  revienta("registrar el documento", error);
  const docId = data!.id as string;

  if ((doc.tipo === 33 || doc.tipo === 34) && em.hitoIds.length) {
    const { data: hitos } = await supabaseAdmin.from("fin_hitos").select("id, neto").in("id", em.hitoIds).eq("empresa_id", e);
    const { error: e2 } = await supabaseAdmin.from("fin_documento_hitos").insert((hitos ?? []).map((h: any) => ({ documento_id: docId, hito_id: h.id, neto_aplicado: Number(h.neto) })));
    revienta("ligar la factura a sus hitos", e2);
  }
  if (doc.tipo === 52 && em.hitoIds.length) {
    await supabaseAdmin.from("fin_hitos").update({ guia_despacho: folio }).in("id", em.hitoIds).eq("empresa_id", e);
    await supabaseAdmin.from("fin_documento_hitos").insert(em.hitoIds.map((h) => ({ documento_id: docId, hito_id: h, neto_aplicado: 0 })));
  }
  // NC que anula (CodRef 1) por el total: la factura queda anulada y sus hitos vuelven a «Lista para facturar».
  if (doc.tipo === 61 && em.documentoReferenciadoId && doc.referencias.some((r) => r.codRef === 1)) {
    const { data: ref } = await supabaseAdmin.from("fin_documentos").select("total").eq("id", em.documentoReferenciadoId).maybeSingle();
    if (ref && tot.total >= Number((ref as any).total)) {
      await supabaseAdmin.from("fin_documento_hitos").delete().eq("documento_id", em.documentoReferenciadoId);
      await supabaseAdmin.from("fin_documentos").update({ estado: "anulado", motivo_anulacion: `Anulada por NC electrónica ${folio}` }).eq("id", em.documentoReferenciadoId);
    }
  }
  await auditar(ctx, "fin_documentos", docId, "crear", `${nombreCorto(doc.tipo, folio)} emitida electrónicamente por ${tot.total}`);
  if (doc.tipo === 33 || doc.tipo === 34) await registrarEvento(ctx, "factura_venta_registrada", "documento", docId, { folio, total: tot.total, hitos: em.hitoIds, origen: "api_dte" });
  return docId;
}

/** Marca como emitido a mano un envío que quedó en duda (se revisó en SimpleFactura que sí salió con ese folio). */
export async function resolverEnvioIncierto(ctx: ContextoFin, emisionId: string, folio: string | null): Promise<void> {
  const em = await obtenerEmision(ctx.empresa.id, emisionId);
  if (!em || em.estado !== "enviando") throw new ErrorDte("Solo se resuelven documentos que quedaron «enviando».", "estado", 409);
  if (!folio) {
    // No salió: vuelve a «error» para poder reintentar.
    await supabaseAdmin.from("fin_dte_emisiones").update({ estado: "error", error: "Se revisó en SimpleFactura: no salió. Se puede reintentar.", actualizado_en: new Date().toISOString() }).eq("id", emisionId);
    await auditar(ctx, "fin_dte_emisiones", emisionId, "resolver", "No salió: queda para reintentar");
    return;
  }
  const cfg = await configuracionDte(ctx.empresa.id);
  const doc = normalizarDocumento(em.documento);
  const tot = calcularTotales(doc, cfg.tasaIva);
  const documentoId = em.ambiente === "produccion" ? await registrarEnLibros(ctx, em, doc, folio, null, "pendiente", tot) : null;
  await supabaseAdmin.from("fin_dte_emisiones").update({ estado: "emitido", folio, documento_id: documentoId, emitido_en: new Date().toISOString(), error: null, actualizado_en: new Date().toISOString() }).eq("id", emisionId);
  await auditar(ctx, "fin_dte_emisiones", emisionId, "resolver", `Salió con folio ${folio} (revisado en SimpleFactura)`);
}

/**
 * Liga una guía emitida «suelta» (desde Nueva guía) al hito de la venta o el arriendo que despachó. En producción
 * queda igual que si hubiera nacido del hito: el folio en el hito y el vínculo en fin_documento_hitos, así la factura
 * de ese hito la referenciará. Solo guías sin hito; el cliente tiene que ser el mismo (salvo traslados a la propia empresa).
 */
export async function ligarGuiaAHito(ctx: ContextoFin, emisionId: string, hitoId: string): Promise<void> {
  const e = ctx.empresa.id;
  const em = await obtenerEmision(e, emisionId);
  if (!em || em.tipoDte !== 52 || em.estado !== "emitido") throw new ErrorDte("Solo se ligan guías de despacho ya emitidas.", "estado", 409);
  if (em.hitoIds.length) throw new ErrorDte("Esta guía ya está ligada a un hito.", "ya_ligada", 409);
  const { data: h } = await supabaseAdmin.from("fin_hitos").select("id, codigo, cliente_id, anulado, guia_despacho").eq("id", hitoId).eq("empresa_id", e).maybeSingle();
  if (!h) throw new ErrorDte("Ese hito no existe o es de otra empresa.", "no_existe", 404);
  if ((h as any).anulado) throw new ErrorDte("Ese hito está anulado.", "anulado", 409);
  const { data: emp } = await supabaseAdmin.from("empresas").select("rut").eq("id", e).maybeSingle();
  const aSiMisma = Boolean((emp as any)?.rut) && normalizarRut((emp as any).rut) === em.receptorRut;
  if (!aSiMisma && em.contraparteId && (h as any).cliente_id && em.contraparteId !== (h as any).cliente_id) {
    throw new ErrorDte("La guía es de otro cliente que el del hito.", "otro_cliente", 409);
  }
  const { error } = await supabaseAdmin.from("fin_dte_emisiones").update({ hito_ids: [hitoId], actualizado_en: new Date().toISOString() }).eq("id", emisionId).eq("empresa_id", e);
  revienta("ligar la guía", error);
  if (em.ambiente === "produccion" && em.documentoId) {
    if (!(h as any).guia_despacho) await supabaseAdmin.from("fin_hitos").update({ guia_despacho: em.folio }).eq("id", hitoId);
    await supabaseAdmin.from("fin_documento_hitos").upsert({ documento_id: em.documentoId, hito_id: hitoId, neto_aplicado: 0 }, { onConflict: "documento_id,hito_id", ignoreDuplicates: true });
  }
  await auditar(ctx, "fin_dte_emisiones", emisionId, "ligar_hito", `Guía ${em.folio} ligada al hito ${(h as any).codigo}`);
  await auditar(ctx, "fin_hitos", hitoId, "ligar_guia", `Guía de despacho N° ${em.folio}`);
}

/** Busca en SimpleFactura si un envío en duda salió (mismo tipo, receptor, fecha y total). Devuelve los folios que calzan. */
export async function verificarEnvio(ctx: ContextoFin, emisionId: string): Promise<string[]> {
  const { cfg, cuenta } = await proveedorDe(ctx.empresa.id, "consulta");
  const em = await obtenerEmision(ctx.empresa.id, emisionId);
  if (!em || em.estado !== "enviando") throw new ErrorDte("Solo se verifican documentos que quedaron «enviando».", "estado", 409);
  return buscarEmitido(cuenta, cfg.emisor, em.tipoDte, em.receptorRut, em.fechaEmision, em.total);
}

export async function descartarBorrador(ctx: ContextoFin, emisionId: string, motivo: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("fin_dte_emisiones")
    .update({ estado: "descartado", error: motivo.slice(0, 300), actualizado_en: new Date().toISOString() })
    .eq("id", emisionId)
    .eq("empresa_id", ctx.empresa.id)
    .in("estado", ["borrador", "error"])
    .select("id");
  revienta("descartar", error);
  if (!data?.length) throw new ErrorDte("Solo se descartan borradores o documentos con error.", "estado", 409);
  await auditar(ctx, "fin_dte_emisiones", emisionId, "descartar", null, { motivo });
}

/** Consulta el estado en el SII (vía proveedor) y lo guarda. */
export async function actualizarEstado(ctx: ContextoFin, emisionId: string): Promise<EstadoSii> {
  const { cfg, prov } = await proveedorDe(ctx.empresa.id, "consulta");
  const em = await obtenerEmision(ctx.empresa.id, emisionId);
  if (!em?.folio) throw new ErrorDte("Ese documento aún no tiene folio.", "sin_folio", 409);
  const est = await prov.consultarEstado(cfg.emisor, em.tipoDte, em.folio);
  const ahora = new Date().toISOString();
  if (em.documentoId) {
    await supabaseAdmin.from("fin_documentos").update({ estado_sii: est.estadoSii, estado_sii_detalle: est.detalle?.slice(0, 500) ?? null, estado_sii_en: ahora, ...(est.trackId ? { track_id: est.trackId } : {}) }).eq("id", em.documentoId);
  }
  await supabaseAdmin
    .from("fin_dte_emisiones")
    .update({ respuesta: { estadoSii: est.estadoSii, estadoSiiDetalle: est.detalle?.slice(0, 500) ?? null }, ...(est.trackId ? { track_id: est.trackId } : {}), actualizado_en: ahora })
    .eq("id", emisionId);
  return est.estadoSii;
}

/** PDF o XML de un documento emitido (lo entrega el proveedor; no se guarda copia en el Core). */
export async function archivoEmitido(ctx: ContextoFin, emisionId: string, que: "pdf" | "xml"): Promise<{ nombre: string; contenido: Buffer }> {
  const { cfg, prov } = await proveedorDe(ctx.empresa.id, "consulta");
  const em = await obtenerEmision(ctx.empresa.id, emisionId);
  if (!em?.folio) throw new ErrorDte("Ese documento aún no tiene folio.", "sin_folio", 409);
  const contenido = que === "pdf" ? await prov.pdf(cfg.emisor, em.tipoDte, em.folio) : await prov.xml(cfg.emisor, em.tipoDte, em.folio);
  return { nombre: `DTE${em.tipoDte}-${em.folio}${em.ambiente === "certificacion" ? "-PRUEBA" : ""}.${que}`, contenido };
}

/** Número y fecha de las cotizaciones (para referenciarlas en una guía o factura sin OC). */
export async function cotizacionesDe(empresaId: string, ids: string[]): Promise<{ id: string; numero: string; fecha: Iso }[]> {
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from("fin_cotizaciones").select("id, numero, version, fecha, fecha_aceptacion").eq("empresa_id", empresaId).in("id", ids);
  revienta("leer las cotizaciones", error);
  return (data ?? []).map((c: any) => ({ id: c.id, numero: c.version > 1 ? `${c.numero} v${c.version}` : c.numero, fecha: c.fecha }));
}

/**
 * Las guías de despacho con que ya se despacharon estos hitos: las emitidas por el Core en el ambiente actual y, en
 * producción, también las registradas a mano en Ventas.
 */
export async function guiasDeHitos(empresaId: string, ambiente: Ambiente, hitoIds: string[], documentos: { tipoDte: number; direccion: string; estado: string; folio: string; fechaEmision: Iso; hitoIds: string[] }[]): Promise<{ folio: string; fecha: Iso }[]> {
  if (!hitoIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("fin_dte_emisiones")
    .select("folio, fecha_emision, hito_ids")
    .eq("empresa_id", empresaId)
    .eq("ambiente", ambiente)
    .eq("estado", "emitido")
    .eq("tipo_dte", 52)
    .overlaps("hito_ids", hitoIds);
  revienta("leer las guías de los hitos", error);
  const salida = (data ?? []).filter((r: any) => r.folio).map((r: any) => ({ folio: String(r.folio), fecha: r.fecha_emision as Iso }));
  if (ambiente === "produccion") {
    for (const d of documentos) {
      if (d.tipoDte === 52 && d.direccion === "emitido" && d.estado === "vigente" && d.hitoIds.some((h) => hitoIds.includes(h))) salida.push({ folio: d.folio, fecha: d.fechaEmision });
    }
  }
  return salida;
}

/** La emisión que originó un documento del Core (para abrir su PDF desde Ventas). */
export async function emisionDeDocumento(empresaId: string, documentoId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("fin_dte_emisiones").select("id").eq("empresa_id", empresaId).eq("documento_id", documentoId).maybeSingle();
  return (data as any)?.id ?? null;
}

// ---------- Recibidos ------------------------------------------------------------------------------

export interface Recibido {
  id: string;
  ambiente: Ambiente;
  tipoDte: number;
  folio: string;
  rutEmisor: string;
  razonSocial: string | null;
  fechaEmision: Iso | null;
  fechaRecepcion: string | null;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  accion: AccionRecibido | null;
  accionEn: string | null;
  accionPor: string | null;
  accionMotivo: string | null;
  documentoId: string | null;
  contraparteId: string | null;
  descartado: boolean;
  /** Días corridos que quedan para aceptar o reclamar (8 desde la recepción en el SII). null si no hay fecha. */
  diasParaResponder: number | null;
}

export async function listarRecibidos(empresaId: string, ambiente: Ambiente, hoy: Iso, plazoDias: number): Promise<Recibido[]> {
  // Lo de producción (SII y proveedor) se ve siempre: son documentos reales. En pruebas se suma lo de certificación.
  const ambientes = ambiente === "certificacion" ? ["produccion", "certificacion"] : ["produccion"];
  const { data, error } = await supabaseAdmin.from("fin_dte_recibidos").select("*").eq("empresa_id", empresaId).in("ambiente", ambientes).order("fecha_emision", { ascending: false }).limit(2000);
  revienta("leer los recibidos", error);
  return (data ?? []).map((r: any) => {
    const rec = r.fecha_recepcion ? String(r.fecha_recepcion).slice(0, 10) : null;
    return {
      id: r.id, ambiente: r.ambiente, tipoDte: r.tipo_dte, folio: r.folio, rutEmisor: r.rut_emisor, razonSocial: r.razon_social, fechaEmision: r.fecha_emision,
      fechaRecepcion: r.fecha_recepcion, neto: Number(r.neto), exento: Number(r.exento), iva: Number(r.iva), total: Number(r.total), accion: r.accion, accionEn: r.accion_en,
      accionPor: r.accion_por, accionMotivo: r.accion_motivo, documentoId: r.documento_id, contraparteId: r.contraparte_id, descartado: r.descartado,
      diasParaResponder: rec ? plazoDias - Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${rec}T12:00:00Z`)) / 86_400_000) : null,
    };
  });
}

/** Trae del proveedor lo recibido entre dos fechas y lo deja en la bandeja (sin duplicar; actualiza montos y acción). */
export async function sincronizarRecibidos(ctx: ContextoFin, desde: Iso, hasta: Iso): Promise<{ nuevos: number; actualizados: number }> {
  const { cfg, prov } = await proveedorDe(ctx.empresa.id, "consulta");
  const filas = await prov.recibidos(cfg.emisor, desde, hasta);
  const { data: existentes } = await supabaseAdmin.from("fin_dte_recibidos").select("tipo_dte, folio, rut_emisor").eq("empresa_id", ctx.empresa.id).eq("ambiente", cfg.ambiente);
  const ya = new Set((existentes ?? []).map((x: any) => `${x.tipo_dte}|${x.folio}|${x.rut_emisor}`));
  const ruts = [...new Set(filas.map((f) => f.rutEmisor))];
  const { data: contactos } = ruts.length ? await supabaseAdmin.from("finanzas_contactos").select("id, rut").in("rut", ruts) : { data: [] };
  const contactoDe = new Map((contactos ?? []).map((c: any) => [c.rut, c.id]));
  let nuevos = 0;
  let actualizados = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200).map((f) => {
      if (ya.has(`${f.tipoDte}|${f.folio}|${f.rutEmisor}`)) actualizados++;
      else nuevos++;
      return {
        empresa_id: ctx.empresa.id, ambiente: cfg.ambiente, tipo_dte: f.tipoDte, folio: f.folio, rut_emisor: f.rutEmisor, razon_social: f.razonSocial,
        fecha_emision: f.fechaEmision, fecha_recepcion: f.fechaRecepcion, neto: f.neto, exento: f.exento, iva: f.iva, total: f.total,
        contraparte_id: contactoDe.get(f.rutEmisor) ?? null, datos: recortar(f.crudo), sincronizado_en: new Date().toISOString(),
        ...(f.accion ? { accion: f.accion } : {}),
      };
    });
    const { error } = await supabaseAdmin.from("fin_dte_recibidos").upsert(lote, { onConflict: "empresa_id,ambiente,tipo_dte,folio,rut_emisor" });
    revienta("guardar los recibidos", error);
  }
  await auditar(ctx, "fin_dte_recibidos", null, "sincronizar", `${nuevos} nuevos, ${actualizados} actualizados (${desde} a ${hasta})`);
  if (cfg.ambiente === "produccion" && filas.length) enSegundoPlano(() => archivarRecibidos(ctx, prov, cfg.emisor, filas));
  return { nuevos, actualizados };
}

/** Cuántos PDF de recibidos se bajan por sincronización (la API admite 2 llamadas por segundo). */
const TOPE_ARCHIVO_RECIBIDOS = 40;

/** Deja en SharePoint (Recibidos/AAAA/MM Mes) el PDF de los recibidos que aún no están archivados con archivo. */
async function archivarRecibidos(ctx: ContextoFin, prov: ProveedorDte, emisor: EmisorDte, filas: DocumentoRecibido[]): Promise<void> {
  const { data: ya } = await supabaseAdmin.from("fin_dte_archivo").select("tipo_dte, folio, rut_contraparte, pdf_ref").eq("empresa_id", ctx.empresa.id).eq("clase", "recibido");
  const conPdf = new Set((ya ?? []).filter((x: any) => x.pdf_ref).map((x: any) => `${x.tipo_dte}|${x.folio}|${x.rut_contraparte}`));
  const faltan = filas.filter((f) => !conPdf.has(`${f.tipoDte}|${f.folio}|${f.rutEmisor.replace(/\./g, "").toUpperCase()}`)).slice(0, TOPE_ARCHIVO_RECIBIDOS);
  for (const f of faltan) {
    const pdf = await prov.pdfRecibido?.(emisor, { tipoDte: f.tipoDte, folio: f.folio, rutEmisor: f.rutEmisor }).catch(() => null) ?? null;
    const aviso = await archivarDte(ctx.empresa, {
      clase: "recibido", tipoDte: f.tipoDte, folio: f.folio, fecha: f.fechaEmision, rut: f.rutEmisor, nombre: f.razonSocial,
      neto: f.neto, iva: f.iva, exento: f.exento, total: f.total, pdf, origen: "recibido_api",
    });
    if (aviso) console.error("[dte] archivo recibido:", aviso);
  }
}

/** Acepta o reclama un recibido en el SII (vía proveedor). */
export async function responderRecibido(ctx: ContextoFin, recibidoId: string, accion: AccionRecibido, motivo: string | null): Promise<void> {
  if (!esAccionRecibido(accion)) throw new ErrorDte("Acción inválida.", "accion", 400);
  const { cfg, prov } = await proveedorDe(ctx.empresa.id);
  const { data: r } = await supabaseAdmin.from("fin_dte_recibidos").select("*").eq("id", recibidoId).eq("empresa_id", ctx.empresa.id).maybeSingle();
  if (!r) throw new ErrorDte("Ese documento no existe o es de otra empresa.", "no_existe", 404);
  if ((r as any).accion) throw new ErrorDte(`Ya se respondió (${(r as any).accion}). El SII no admite cambiar la respuesta.`, "ya_respondido", 409);
  await prov.responderRecibido(cfg.emisor, { tipoDte: (r as any).tipo_dte, folio: (r as any).folio, rutEmisor: (r as any).rut_emisor }, accion, motivo);
  const ahora = new Date().toISOString();
  await supabaseAdmin.from("fin_dte_recibidos").update({ accion, accion_en: ahora, accion_por: ctx.usuario.correo, accion_motivo: motivo?.slice(0, 300) ?? null }).eq("id", recibidoId);
  if ((r as any).documento_id) await supabaseAdmin.from("fin_documentos").update({ acuse: accion, acuse_en: ahora }).eq("id", (r as any).documento_id);
  await auditar(ctx, "fin_dte_recibidos", recibidoId, "responder_sii", `${accion} a ${(r as any).razon_social ?? (r as any).rut_emisor} folio ${(r as any).folio}`, { motivo });
}

// ---------- Cesión ----------------------------------------------------------------------------------

export interface Cedible {
  /** Documento del Core (producción) o emisión de prueba (certificación). */
  documentoId: string | null;
  emisionId: string | null;
  tipoDte: 33;
  folio: string;
  receptor: string | null;
  receptorId: string | null;
  /** Forma de pago de la factura (solo se ceden a crédito). null si no se sabe. */
  aCredito: boolean | null;
  fechaEmision: Iso;
  vencimiento: Iso | null;
  total: number;
  saldo: number;
}

/** Facturas que se pueden ceder: en producción, las vigentes del Core con saldo y no cedidas; en pruebas, las emitidas de prueba. */
export async function cedibles(empresaId: string, ambiente: Ambiente, documentos: { id: string; contraparteId: string | null; direccion: string; tipoDte: number; folio: string; razonSocial: string | null; fechaEmision: Iso; fechaVencimiento: Iso | null; total: number; saldo: number; estado: string; cedido: boolean; origen: string }[]): Promise<Cedible[]> {
  const { data: ya } = await supabaseAdmin.from("fin_dte_cesiones").select("documento_id, emision_id, estado").eq("empresa_id", empresaId).in("estado", ["enviando", "cedida"]);
  const tomados = new Set((ya ?? []).flatMap((x: any) => [x.documento_id, x.emision_id]).filter(Boolean));
  if (ambiente === "produccion") {
    return documentos
      .filter((d) => d.direccion === "emitido" && d.tipoDte === 33 && d.estado === "vigente" && !d.cedido && d.saldo > 0 && !tomados.has(d.id))
      .map((d) => ({ documentoId: d.id, emisionId: null, tipoDte: 33 as const, folio: d.folio, receptor: d.razonSocial, receptorId: d.contraparteId, aCredito: null, fechaEmision: d.fechaEmision, vencimiento: d.fechaVencimiento, total: d.total, saldo: d.saldo }));
  }
  const { data } = await supabaseAdmin.from("fin_dte_emisiones").select("*").eq("empresa_id", empresaId).eq("ambiente", "certificacion").eq("estado", "emitido").eq("tipo_dte", 33).order("emitido_en", { ascending: false }).limit(200);
  return (data ?? [])
    .filter((r: any) => !tomados.has(r.id))
    .map((r: any) => ({ documentoId: null, emisionId: r.id, tipoDte: 33 as const, folio: r.folio, receptor: r.receptor_nombre, receptorId: r.contraparte_id, aCredito: r.documento?.formaPago === 2, fechaEmision: r.fecha_emision, vencimiento: r.documento?.fechaVencimiento ?? null, total: Number(r.total), saldo: Number(r.total) }));
}

export interface CesionElectronica {
  id: string;
  ambiente: Ambiente;
  documentoId: string | null;
  emisionId: string | null;
  tipoDte: number;
  folio: string;
  monto: number;
  cesionarioRut: string;
  cesionarioNombre: string;
  estado: "enviando" | "cedida" | "error" | "rechazada";
  trackId: string | null;
  error: string | null;
  creadoPor: string | null;
  creadoEn: string;
}

export async function listarCesionesElectronicas(empresaId: string): Promise<CesionElectronica[]> {
  const { data, error } = await supabaseAdmin.from("fin_dte_cesiones").select("*").eq("empresa_id", empresaId).order("creado_en", { ascending: false }).limit(500);
  revienta("leer las cesiones", error);
  return (data ?? []).map((r: any) => ({
    id: r.id, ambiente: r.ambiente, documentoId: r.documento_id, emisionId: r.emision_id, tipoDte: r.tipo_dte, folio: r.folio, monto: Number(r.monto), cesionarioRut: r.cesionario_rut,
    cesionarioNombre: r.cesionario_nombre, estado: r.estado, trackId: r.track_id, error: r.error, creadoPor: r.creado_por, creadoEn: r.creado_en,
  }));
}

/**
 * Cede electrónicamente una factura (AEC) a un factor. Igual que la emisión: se registra «enviando» ANTES de llamar
 * (con clave única por documento), así dos clics no ceden dos veces. Si sale bien, en producción liga la cesión a la
 * fila de fin_cesiones de la operación de factoring (si se indicó).
 */
export async function ceder(
  ctx: ContextoFin,
  o: { documentoId: string | null; emisionId: string | null; factorId: string | null; cesion: CesionDte; total: number; vencimiento?: Iso | null; cesionFilaId?: string | null },
): Promise<CesionElectronica> {
  const { cfg, prov } = await proveedorDe(ctx.empresa.id);
  const problemas = validarCesion(o.cesion, o.total);
  if (problemas.length) throw new ErrorDte(problemas.map((p) => p.texto).join(" "), "invalido", 400);
  if (cfg.ambiente === "produccion" && !o.documentoId) throw new ErrorDte("En producción se cede una factura del Core.", "invalido", 400);
  const clave = `ceder:${o.documentoId ?? o.emisionId}`;
  const { data: fila, error } = await supabaseAdmin
    .from("fin_dte_cesiones")
    .insert({
      empresa_id: ctx.empresa.id, ambiente: cfg.ambiente, documento_id: o.documentoId, emision_id: o.emisionId, tipo_dte: o.cesion.tipoDte, folio: o.cesion.folio,
      factor_id: o.factorId, monto: o.cesion.montoCesion, cesionario_rut: o.cesion.cesionarioRut, cesionario_nombre: o.cesion.cesionarioRazonSocial,
      cesionario_direccion: o.cesion.cesionarioDireccion, cesionario_correo: o.cesion.cesionarioCorreo, cedente_correo: o.cesion.personaAutorizada.correo,
      vencimiento: o.vencimiento ?? null, estado: "enviando", clave_idempotencia: clave, cesion_id: o.cesionFilaId ?? null, creado_por: ctx.usuario.correo,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    // Hubo un intento antes: si quedó en error, se reintenta sobre la misma fila; si no, se frena.
    const { data: previa } = await supabaseAdmin.from("fin_dte_cesiones").select("id, estado").eq("empresa_id", ctx.empresa.id).eq("clave_idempotencia", clave).single();
    if ((previa as any)?.estado !== "error" && (previa as any)?.estado !== "rechazada") throw new ErrorDte("Esta factura ya fue cedida (o se está cediendo).", "ya_cedida", 409);
    const { data: retomada } = await supabaseAdmin.from("fin_dte_cesiones").update({ estado: "enviando", error: null, monto: o.cesion.montoCesion, actualizado_en: new Date().toISOString() }).eq("id", (previa as any).id).in("estado", ["error", "rechazada"]).select("id");
    if (!retomada?.length) throw new ErrorDte("Otra persona acaba de ceder esta factura.", "en_curso", 409);
    return cederFila(ctx, prov, cfg.emisor, (previa as any).id, o.cesion);
  }
  revienta("registrar la cesión", error);
  return cederFila(ctx, prov, cfg.emisor, fila!.id, o.cesion);
}

async function cederFila(ctx: ContextoFin, prov: ProveedorDte, emisor: EmisorDte, id: string, cesion: CesionDte): Promise<CesionElectronica> {
  try {
    const r = await prov.ceder(emisor, cesion);
    await supabaseAdmin.from("fin_dte_cesiones").update({ estado: "cedida", track_id: r.trackId, respuesta: recortar(r.crudo), actualizado_en: new Date().toISOString() }).eq("id", id);
    await auditar(ctx, "fin_dte_cesiones", id, "ceder", `Factura ${cesion.folio} cedida a ${cesion.cesionarioRazonSocial} por ${cesion.montoCesion}`);
    await registrarEvento(ctx, "dte_cedido", "dte_cesion", id, { folio: cesion.folio, monto: cesion.montoCesion });
  } catch (err) {
    const incierto = err instanceof ErrorDte ? err.incierto : true;
    const mensaje = err instanceof Error ? err.message.replace(/^\[[^\]]+\]\s*/, "") : "Error desconocido.";
    await supabaseAdmin
      .from("fin_dte_cesiones")
      .update({ estado: incierto ? "enviando" : "error", error: incierto ? `Sin respuesta clara (${mensaje}). Revisa en SimpleFactura antes de reintentar.` : mensaje, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    await auditar(ctx, "fin_dte_cesiones", id, "ceder_error", mensaje);
    throw err;
  }
  const lista = await listarCesionesElectronicas(ctx.empresa.id);
  return lista.find((c) => c.id === id)!;
}

// ---------- Configuración ----------------------------------------------------------------------------

export async function probarConexion(empresaId: string): Promise<{ ok: boolean; detalle: string }> {
  const [cfg, cuenta] = await Promise.all([configuracionDte(empresaId), cuentaSimpleFactura(empresaId)]);
  if (!cuenta) return { ok: false, detalle: "La empresa no tiene cargada la cuenta de SimpleFactura (Administración › Integraciones)." };
  if (!cfg.emisor.rut) return { ok: false, detalle: "La empresa no tiene RUT." };
  let r: { ok: boolean; detalle: string };
  try {
    r = await crearProveedorSimpleFactura(cuenta).probarConexion(cfg.emisor);
  } catch (e) {
    r = { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
  await registrarPruebaDte(empresaId, r.ok, r.detalle).catch(() => undefined);
  return r;
}

// ---------- Utilidades -----------------------------------------------------------------------------

/** Recorta lo que devuelve el proveedor antes de guardarlo (sin PDF/XML en base64 ni cuerpos enormes). */
function recortar(x: unknown): unknown {
  try {
    const s = JSON.stringify(x, (_k, v) => (typeof v === "string" && v.length > 2000 ? `${v.slice(0, 200)}…(${v.length} caracteres)` : v));
    if (!s) return null;
    return s.length > 20_000 ? { recortado: s.slice(0, 20_000) } : JSON.parse(s);
  } catch {
    return null;
  }
}

