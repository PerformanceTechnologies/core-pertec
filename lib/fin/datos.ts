import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "../supabase-admin";
import { exigirAccesoApp } from "../autorizacion";
import { contextoDeEmpresa } from "../empresas";
import { hoyEnSantiago } from "../graph-calendario";
import type { UsuarioConAcceso } from "../tipos";
import type { Empresa } from "../empresas-modelo";
import {
  PARAMETROS_DEFAULT,
  calcularCesion,
  calcularCompra,
  calcularDashboard,
  calcularFlujo,
  calcularHito,
  calcularMovimiento,
  cifrasProyecto,
  reglaQueCalza,
  sumarDias,
  type Cesion,
  type CifrasProyecto,
  type Compra,
  type Dashboard,
  type FacturaDeHito,
  type Flujo,
  type Hito,
  type Iso,
  type Movimiento,
  type Parametros,
  type PartidaManual,
  type ProyectoBase,
  type ReglaCategoria,
} from "./reglas";

// -----------------------------------------------------------------------------
//  Gestión financiera: la capa de datos (solo servidor).
//
//  Todo se lee y se escribe con la empresa activa (la del selector del Core): ninguna consulta
//  sale sin `empresa_id`. Las reglas del Excel viven en lib/fin/reglas.ts; acá solo se arman las
//  filas y se pasan por ellas, así la pantalla, el dashboard y las pruebas dicen lo mismo.
// -----------------------------------------------------------------------------

export const SLUG_APP_FIN = "gestion-financiera";
export const RUTA_FIN = "/gestion-financiera";
const EMPRESAS_CON_FINANZAS = ["pertec", "zeus", "performance-service"];

export interface ContextoFin {
  usuario: UsuarioConAcceso;
  empresa: Empresa;
  hoy: Iso;
}

/** Quién y en qué empresa. Una vez por pedido. Sin la app o sin empresa válida, fuera. */
export const contextoFin = cache(async (): Promise<ContextoFin> => {
  const usuario = await exigirAccesoApp(SLUG_APP_FIN);
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  if (!activa || !EMPRESAS_CON_FINANZAS.includes(activa.slug)) redirect("/");
  return { usuario, empresa: activa, hoy: hoyEnSantiago().iso };
});

/** Para la cartilla del módulo Finanzas: el mismo contexto, sin redirigir (null si la empresa no aplica). */
export async function contextoFinDeUsuario(usuario: UsuarioConAcceso): Promise<ContextoFin | null> {
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  if (!activa || !EMPRESAS_CON_FINANZAS.includes(activa.slug)) return null;
  return { usuario, empresa: activa, hoy: hoyEnSantiago().iso };
}

export function revienta(que: string, error: { message: string } | null): void {
  if (error) throw new Error(`[fin] No se pudo ${que}: ${error.message}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const n = (v: any): number => (v === null || v === undefined ? 0 : Number(v));
const nOrNull = (v: any): number | null => (v === null || v === undefined ? null : Number(v));

async function tabla<T = any>(nombre: string, empresaId: string, orden?: string): Promise<T[]> {
  let q = supabaseAdmin.from(nombre).select("*").eq("empresa_id", empresaId);
  if (orden) q = q.order(orden);
  const { data, error } = await q.limit(10000);
  revienta(`leer ${nombre}`, error);
  return (data ?? []) as T[];
}

async function porIds<T = any>(nombre: string, columna: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const salida: T[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabaseAdmin.from(nombre).select("*").in(columna, ids.slice(i, i + 300));
    revienta(`leer ${nombre}`, error);
    salida.push(...((data ?? []) as T[]));
  }
  return salida;
}

// ---------- Tipos de lo que ven las pantallas ----------------------------------

export interface Contraparte {
  id: string;
  nombre: string;
  rut: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  plazoPagoDias: number | null;
}

export interface Perfil {
  id: string;
  contactoId: string;
  condicionVentaDias: number | null;
  condicionCompraDias: number | null;
  requiereOc: boolean;
  requiereEdp: boolean;
  requiereHes: boolean;
  contactoCobranza: string | null;
  correoCobranza: string | null;
  telefonoCobranza: string | null;
  referenciaExigida: string | null;
  notas: string | null;
}

export interface CuentaFin {
  id: string;
  nombre: string;
  tipo: "banco" | "tarjeta" | "caja";
  banco: string | null;
  numeroEnmascarado: string | null;
  saldoBanco: number;
  fechaSaldo: Iso | null;
  activa: boolean;
  /** Saldo del banco + movimientos cargados después de la fecha del saldo. */
  saldoCalculado: number;
}

export interface Categoria {
  id: string;
  nombre: string;
  sentido: "ingreso" | "egreso" | "ambos";
  requiereProyecto: boolean;
  cuentaContable: string | null;
  orden: number;
  activa: boolean;
}

export interface Factor {
  id: string;
  nombre: string;
  recursoDefault: "con" | "sin";
  pctAnticipoDefault: number;
  tasaMoraMensual: number;
  activo: boolean;
}

export interface Proyecto extends ProyectoBase {
  descripcion: string | null;
  fechaInicio: Iso | null;
  fechaTermino: Iso | null;
  esGeneral: boolean;
  cifras: CifrasProyecto;
}

export interface Documento {
  id: string;
  direccion: "emitido" | "recibido";
  tipoDte: number;
  folio: string;
  fechaEmision: Iso;
  fechaRecepcion: Iso | null;
  contraparteId: string | null;
  rutContraparte: string;
  razonSocial: string | null;
  neto: number;
  exento: number;
  iva: number;
  otrosImpuestos: number;
  total: number;
  fechaVencimiento: Iso | null;
  referencias: string | null;
  documentoReferenciadoId: string | null;
  origen: string;
  estado: "vigente" | "anulado";
  /** Cobrado o pagado (aplicaciones) + notas de crédito que lo rebajan. */
  aplicado: number;
  saldo: number;
  cedido: boolean;
  hitoIds: string[];
  compraIds: string[];
  /** Solo recibidos: días que quedan para reclamar en el SII (plazo legal desde la recepción). */
  diasParaReclamo: number | null;
}

export interface Cobro {
  id: string;
  numero: string;
  clienteId: string | null;
  fecha: Iso;
  monto: number;
  medio: string;
  cuentaId: string | null;
  referencia: string | null;
  estado: string;
  /** Movimiento del banco con que se concilió (null = registrado a mano, aún sin ligar). */
  movimientoId: string | null;
  aplicaciones: { documentoId: string; monto: number }[];
}

export interface Pago {
  id: string;
  numero: string;
  proveedorId: string | null;
  fechaProgramada: Iso | null;
  fechaPago: Iso | null;
  monto: number;
  cuentaId: string | null;
  medio: string;
  referencia: string | null;
  estado: "programado" | "pagado" | "anulado";
  /** Movimiento del banco con que se concilió (null = aún sin ligar). */
  movimientoId: string | null;
  aplicaciones: { documentoId: string; monto: number }[];
}

export interface CompraVista extends Compra {
  proveedorNombre: string | null;
  proyectoNombre: string | null;
  solicitante: string | null;
  fechaRequerida: Iso | null;
  prioridad: string;
  visadoPor: string | null;
  ocFecha: Iso | null;
  ocEnviadaFecha: Iso | null;
  recepcionFecha: Iso | null;
  recepcionObs: string | null;
  diferenciaAprobada: boolean;
  estadoOverride: string | null;
  motivo: string | null;
  documentoIds: string[];
  creadoEn: string;
}

export interface HitoVista extends Hito {
  clienteNombre: string | null;
  proyectoNombre: string | null;
  cotizacionId: string | null;
  periodoDesde: Iso | null;
  periodoHasta: Iso | null;
  ocClienteFecha: Iso | null;
}

export interface OperacionFactoring {
  id: string;
  numero: string;
  factorId: string;
  factorNombre: string;
  recurso: "con" | "sin";
  fechaCesion: Iso;
  pctAnticipo: number;
  tasaMora: number;
  costoTotal: number;
  fechaAnticipo: Iso | null;
}

export interface MovimientoVista extends Movimiento {
  cuentaNombre: string;
  categoriaNombre: string | null;
  proyectoNombre: string | null;
  contactoId: string | null;
  numeroDocumento: string | null;
  sugerencia: { reglaId: string; categoriaId: string; proyectoId: string | null } | null;
}

export interface VistaFin {
  hoy: Iso;
  empresa: Empresa;
  p: Parametros;
  flags: Record<string, unknown>;
  contrapartes: Contraparte[];
  nombreDe: Map<string, string>;
  perfiles: Map<string, Perfil>;
  cuentas: CuentaFin[];
  categorias: Categoria[];
  reglas: ReglaCategoria[];
  factores: Factor[];
  proyectos: Proyecto[];
  hitos: HitoVista[];
  documentos: Documento[];
  cobros: Cobro[];
  compras: CompraVista[];
  pagos: Pago[];
  operaciones: OperacionFactoring[];
  cesiones: (Cesion & { clienteNombre: string | null })[];
  movimientos: MovimientoVista[];
  partidas: PartidaManual[];
  cajaBancos: number;
  deudaTarjeta: number;
  flujo: Flujo;
  dashboard: Dashboard;
  ultimaImportacion: string | null;
}

// ---------- Lectura y cálculo de todo el módulo -------------------------------

function aParametros(r: any): Parametros & { flags: Record<string, unknown> } {
  if (!r) return { ...PARAMETROS_DEFAULT, flags: {} };
  return {
    tasaIva: n(r.tasa_iva),
    toleranciaFacturaOc: n(r.tolerancia_factura_oc),
    plazoPagoProveedorDias: n(r.plazo_pago_proveedor_dias),
    plazoAclararDias: n(r.plazo_aclarar_dias),
    minimoCaja: n(r.minimo_caja),
    tasaMoraFactoring: n(r.tasa_mora_factoring),
    plazoReclamoFacturaDias: n(r.plazo_reclamo_factura_dias),
    horizonteMeses: n(r.horizonte_meses) || 3,
    condicionPagoDefault: n(r.condicion_pago_default) || 30,
    flags: r.flags ?? {},
  };
}

/**
 * Todo el módulo de una empresa, ya calculado. Son pocas filas por empresa (cientos), así que se
 * lee de una vez y cada pantalla toma lo suyo; React cache evita leerlo dos veces en un pedido.
 */
export const cargarVista = cache(async (): Promise<VistaFin> => cargarVistaDe(await contextoFin()));

/** La misma vista para un contexto ya resuelto (route handlers). */
export async function cargarVistaDe(ctx: ContextoFin): Promise<VistaFin> {
  const { empresa, hoy } = ctx;
  const e = empresa.id;

  const [
    parametros, cuentasR, categoriasR, reglasR, factoresR, proyectosR, hitosR, documentosR, cobrosR, comprasR, pagosR,
    operacionesR, cesionesR, movimientosR, conciliacionesR, partidasR, perfilesR, importacionesR,
  ] = await Promise.all([
    supabaseAdmin.from("fin_parametros").select("*").eq("empresa_id", e).maybeSingle().then((r) => (revienta("leer parámetros", r.error), r.data)),
    tabla("fin_cuentas", e, "orden"),
    tabla("fin_categorias", e, "orden"),
    tabla("fin_reglas", e, "prioridad"),
    tabla("fin_factores", e, "nombre"),
    tabla("fin_proyectos", e, "codigo"),
    tabla("fin_hitos", e, "codigo"),
    tabla("fin_documentos", e, "fecha_emision"),
    tabla("fin_cobros", e, "fecha"),
    tabla("fin_compras", e, "codigo"),
    tabla("fin_pagos", e, "numero"),
    tabla("fin_operaciones_factoring", e, "fecha_cesion"),
    tabla("fin_cesiones", e),
    tabla("fin_movimientos", e, "fecha"),
    tabla("fin_conciliaciones", e),
    tabla("fin_flujo_partidas", e, "mes"),
    tabla("fin_perfiles", e),
    supabaseAdmin.from("fin_importaciones").select("creado_en").eq("empresa_id", e).order("creado_en", { ascending: false }).limit(1).then((r) => r.data ?? []),
  ]);
  const docIds = documentosR.map((d: any) => d.id);
  const [docHitos, docCompras, cobroAplic, pagoAplic, contactosR] = await Promise.all([
    porIds("fin_documento_hitos", "documento_id", docIds),
    porIds("fin_documento_compras", "documento_id", docIds),
    porIds("fin_cobro_aplicaciones", "cobro_id", cobrosR.map((c: any) => c.id)),
    porIds("fin_pago_aplicaciones", "pago_id", pagosR.map((p: any) => p.id)),
    supabaseAdmin
      .from("finanzas_contactos")
      .select("id, razon_social, rut, es_cliente, es_proveedor, plazo_pago_dias, activo")
      .order("razon_social")
      .limit(10000)
      .then((r) => (revienta("leer contactos", r.error), r.data ?? [])),
  ]);

  const { flags, ...p } = aParametros(parametros);
  const contrapartes: Contraparte[] = contactosR
    .filter((c: any) => c.activo)
    .map((c: any) => ({ id: c.id, nombre: c.razon_social, rut: c.rut, esCliente: c.es_cliente, esProveedor: c.es_proveedor, plazoPagoDias: c.plazo_pago_dias }));
  const nombreDe = new Map<string, string>(contactosR.map((c: any) => [c.id, c.razon_social]));
  const perfiles = new Map<string, Perfil>(
    perfilesR.map((r: any) => [
      r.contacto_id,
      {
        id: r.id, contactoId: r.contacto_id, condicionVentaDias: nOrNull(r.condicion_venta_dias), condicionCompraDias: nOrNull(r.condicion_compra_dias),
        requiereOc: r.requiere_oc, requiereEdp: r.requiere_edp, requiereHes: r.requiere_hes, contactoCobranza: r.contacto_cobranza, correoCobranza: r.correo_cobranza,
        telefonoCobranza: r.telefono_cobranza, referenciaExigida: r.referencia_exigida, notas: r.notas,
      },
    ]),
  );
  const plazoCliente = (id: string | null) => {
    if (!id) return null;
    return perfiles.get(id)?.condicionVentaDias ?? contrapartes.find((c) => c.id === id)?.plazoPagoDias ?? null;
  };
  const plazoProveedor = (id: string | null) => (id ? perfiles.get(id)?.condicionCompraDias ?? contrapartes.find((c) => c.id === id)?.plazoPagoDias ?? null : null);

  // ── Documentos: lo aplicado (cobros/pagos vigentes + NC) y el saldo ──
  const cobrosVigentes = new Set(cobrosR.filter((c: any) => c.estado !== "anulado").map((c: any) => c.id));
  const pagosPagados = new Map<string, any>(pagosR.filter((x: any) => x.estado === "pagado").map((x: any) => [x.id, x]));
  const aplicadoA = new Map<string, number>();
  const sumar = (id: string, m: number) => aplicadoA.set(id, (aplicadoA.get(id) ?? 0) + m);
  for (const a of cobroAplic) if (cobrosVigentes.has(a.cobro_id)) sumar(a.documento_id, n(a.monto));
  for (const a of pagoAplic) if (pagosPagados.has(a.pago_id)) sumar(a.documento_id, n(a.monto));
  for (const d of documentosR) if (d.estado === "vigente" && d.tipo_dte === 61 && d.documento_referenciado_id) sumar(d.documento_referenciado_id, n(d.total));
  for (const d of documentosR) if (d.estado === "vigente" && d.tipo_dte === 56 && d.documento_referenciado_id) sumar(d.documento_referenciado_id, -n(d.total));
  const cedidos = new Set(cesionesR.map((c: any) => c.documento_id));
  const hitosDeDoc = new Map<string, any[]>();
  for (const x of docHitos) hitosDeDoc.set(x.documento_id, [...(hitosDeDoc.get(x.documento_id) ?? []), x]);
  const comprasDeDoc = new Map<string, any[]>();
  for (const x of docCompras) comprasDeDoc.set(x.documento_id, [...(comprasDeDoc.get(x.documento_id) ?? []), x]);

  const documentos: Documento[] = documentosR.map((d: any) => {
    const aplicado = aplicadoA.get(d.id) ?? 0;
    const total = n(d.total);
    // Las notas de crédito y las guías no tienen saldo propio: la NC rebaja a la factura que referencia.
    // Igual la nota de débito que referencia una factura: sube el saldo de esa factura (si no, se cobraría dos veces).
    const esCargo = ![61, 52].includes(d.tipo_dte) && !(d.tipo_dte === 56 && d.documento_referenciado_id);
    return {
      id: d.id, direccion: d.direccion, tipoDte: d.tipo_dte, folio: d.folio, fechaEmision: d.fecha_emision, fechaRecepcion: d.fecha_recepcion,
      contraparteId: d.contraparte_id, rutContraparte: d.rut_contraparte, razonSocial: d.razon_social ?? (d.contraparte_id ? nombreDe.get(d.contraparte_id) ?? null : null),
      neto: n(d.neto), exento: n(d.exento), iva: n(d.iva), otrosImpuestos: n(d.otros_impuestos), total, fechaVencimiento: d.fecha_vencimiento, referencias: d.referencias,
      documentoReferenciadoId: d.documento_referenciado_id, origen: d.origen, estado: d.estado, aplicado,
      saldo: d.estado === "anulado" || !esCargo ? 0 : total - aplicado,
      cedido: cedidos.has(d.id),
      hitoIds: (hitosDeDoc.get(d.id) ?? []).map((x) => x.hito_id),
      compraIds: (comprasDeDoc.get(d.id) ?? []).map((x) => x.compra_id),
      diasParaReclamo: d.direccion === "recibido" && d.fecha_recepcion ? p.plazoReclamoFacturaDias - Math.round((Date.parse(hoy) - Date.parse(d.fecha_recepcion)) / 86_400_000) : null,
    };
  });
  const docPorId = new Map(documentos.map((d) => [d.id, d]));

  // ── Cobros y pagos ──
  const cobros: Cobro[] = cobrosR.map((c: any) => ({
    id: c.id, numero: c.numero, clienteId: c.cliente_id, fecha: c.fecha, monto: n(c.monto), medio: c.medio, cuentaId: c.cuenta_id, referencia: c.referencia, estado: c.estado, movimientoId: c.movimiento_id ?? null,
    aplicaciones: cobroAplic.filter((a: any) => a.cobro_id === c.id).map((a: any) => ({ documentoId: a.documento_id, monto: n(a.monto) })),
  }));
  const pagos: Pago[] = pagosR.map((x: any) => ({
    id: x.id, numero: x.numero, proveedorId: x.proveedor_id, fechaProgramada: x.fecha_programada, fechaPago: x.fecha_pago, monto: n(x.monto), cuentaId: x.cuenta_id,
    medio: x.medio, referencia: x.referencia, estado: x.estado, movimientoId: x.movimiento_id ?? null,
    aplicaciones: pagoAplic.filter((a: any) => a.pago_id === x.id).map((a: any) => ({ documentoId: a.documento_id, monto: n(a.monto) })),
  }));
  const ultimaFechaCobro = (docId: string) => cobros.filter((c) => c.estado !== "anulado" && c.aplicaciones.some((a) => a.documentoId === docId)).map((c) => c.fecha).sort().pop() ?? null;

  // ── Hitos ──
  const proyNombre = new Map<string, string>(proyectosR.map((x: any) => [x.id, x.nombre]));
  const hitos: HitoVista[] = hitosR.map((r: any) => {
    // La factura vigente (no NC ni guía) que incluye este hito; su total y lo cobrado se reparten
    // entre sus hitos según el neto aplicado a cada uno.
    const fila = docHitos.find((x: any) => x.hito_id === r.id && docPorId.get(x.documento_id)?.estado === "vigente" && [33, 34, 30, 32].includes(docPorId.get(x.documento_id)!.tipoDte));
    let factura: FacturaDeHito | null = null;
    if (fila) {
      const doc = docPorId.get(fila.documento_id)!;
      const hermanos = hitosDeDoc.get(doc.id) ?? [fila];
      const totalAplicado = hermanos.reduce((s, x) => s + n(x.neto_aplicado), 0) || 1;
      const parte = hermanos.length === 1 ? 1 : n(fila.neto_aplicado) / totalAplicado;
      const pagado = Math.round(doc.aplicado * parte);
      factura = {
        documentoId: doc.id, folio: doc.folio, fechaEmision: doc.fechaEmision, total: Math.round(doc.total * parte), pagado,
        fechaPagoReal: doc.saldo <= 0 ? ultimaFechaCobro(doc.id) : null, cedida: doc.cedido,
      };
    }
    const base = calcularHito(
      {
        id: r.id, codigo: r.codigo, clienteId: r.cliente_id, proyectoId: r.proyecto_id, descripcion: r.descripcion, tipo: r.tipo, periodo: r.periodo,
        cotizacionNumero: null, fechaAceptacion: r.fecha_aceptacion, neto: n(r.neto), exento: n(r.exento ?? 0), ocClienteNumero: r.oc_cliente_numero, estadoTrabajo: r.estado_trabajo,
        guiaDespacho: r.guia_despacho, requiereEdp: r.requiere_edp, edpFechaAprobacion: r.edp_fecha_aprobacion, requiereHes: r.requiere_hes, hesNumero: r.hes_numero,
        fechaEstimadaPago: r.fecha_estimada_pago, condicionPagoDias: nOrNull(r.condicion_pago_dias), comentario: r.comentario, anulado: r.anulado,
      },
      factura,
      plazoCliente(r.cliente_id),
      p,
      hoy,
    );
    return {
      ...base, cotizacionId: r.cotizacion_id, periodoDesde: r.periodo_desde, periodoHasta: r.periodo_hasta, ocClienteFecha: r.oc_cliente_fecha,
      clienteNombre: r.cliente_id ? nombreDe.get(r.cliente_id) ?? null : null, proyectoNombre: r.proyecto_id ? proyNombre.get(r.proyecto_id) ?? null : null,
    };
  });

  // ── Compras ──
  const compras: CompraVista[] = comprasR.map((r: any) => {
    const docs = docCompras.filter((x: any) => x.compra_id === r.id).map((x: any) => docPorId.get(x.documento_id)).filter((d): d is Documento => Boolean(d && d.estado === "vigente"));
    const facturas = docs.filter((d) => d.tipoDte !== 61 && d.tipoDte !== 52);
    const ncs = docs.filter((d) => d.tipoDte === 61);
    const facturaTotal = facturas.length ? facturas.reduce((s, d) => s + d.total, 0) - ncs.reduce((s, d) => s + d.total, 0) : null;
    const condicion = nOrNull(r.condicion_pago_dias) ?? plazoProveedor(r.proveedor_id) ?? p.plazoPagoProveedorDias;
    const venceFactura = facturas.map((d) => d.fechaVencimiento ?? sumarDias(d.fechaEmision, condicion)).sort()[0] ?? null;
    const pagosDeCompra = pagos.filter((x) => x.estado !== "anulado" && x.aplicaciones.some((a) => facturas.some((d) => d.id === a.documentoId)));
    const saldoFacturas = facturas.reduce((s, d) => s + d.saldo, 0);
    const pagada = facturas.length > 0 && saldoFacturas <= 0;
    const calculo = calcularCompra(
      {
        id: r.id, codigo: r.codigo, proyectoId: r.proyecto_id, proveedorId: r.proveedor_id, descripcion: r.descripcion, netoCotizado: nOrNull(r.neto_cotizado),
        aprobadoPor: r.aprobado_por, fechaAprobacion: r.fecha_aprobacion, fechaVisado: r.fecha_visado, ocNumero: r.oc_numero, recepcion: r.recepcion,
        facturaFolio: facturas.map((d) => d.folio).join(", ") || null, facturaTotal, facturaVence: venceFactura,
        fechaProgramada: pagosDeCompra.filter((x) => x.estado === "programado").map((x) => x.fechaProgramada).filter(Boolean).sort()[0] ?? null,
        fechaPagoReal: pagada ? pagosDeCompra.filter((x) => x.estado === "pagado").map((x) => x.fechaPago).filter(Boolean).sort().pop() ?? hoy : null,
        comentario: r.comentario, anulada: r.estado_override === "anulada" || r.estado_override === "rechazada",
      },
      // Una diferencia con la OC ya aprobada (con motivo) deja de detener el pago.
      r.diferencia_aprobada ? { ...p, toleranciaFacturaOc: Number.MAX_SAFE_INTEGER } : p,
      hoy,
    );
    return {
      ...calculo,
      proveedorNombre: r.proveedor_id ? nombreDe.get(r.proveedor_id) ?? null : null, proyectoNombre: r.proyecto_id ? proyNombre.get(r.proyecto_id) ?? null : null,
      solicitante: r.solicitante, fechaRequerida: r.fecha_requerida, prioridad: r.prioridad, visadoPor: r.visado_por, ocFecha: r.oc_fecha, ocEnviadaFecha: r.oc_enviada_fecha,
      recepcionFecha: r.recepcion_fecha, recepcionObs: r.recepcion_obs, diferenciaAprobada: r.diferencia_aprobada, estadoOverride: r.estado_override, motivo: r.motivo,
      documentoIds: docs.map((d) => d.id), creadoEn: r.creado_en,
    };
  });

  // ── Factoring ──
  const factores: Factor[] = factoresR.map((f: any) => ({
    id: f.id, nombre: f.nombre, recursoDefault: f.recurso_default, pctAnticipoDefault: n(f.pct_anticipo_default), tasaMoraMensual: n(f.tasa_mora_mensual), activo: f.activo,
  }));
  const operaciones: OperacionFactoring[] = operacionesR.map((o: any) => ({
    id: o.id, numero: o.numero, factorId: o.factor_id, factorNombre: factores.find((f) => f.id === o.factor_id)?.nombre ?? "Factor", recurso: o.recurso,
    fechaCesion: o.fecha_cesion, pctAnticipo: n(o.pct_anticipo), tasaMora: n(o.tasa_mora), costoTotal: n(o.costo_total), fechaAnticipo: o.fecha_anticipo,
  }));
  const cesiones = cesionesR
    .map((c: any) => {
      const op = operaciones.find((o) => o.id === c.operacion_id);
      const doc = docPorId.get(c.documento_id);
      if (!op || !doc) return null;
      const hitoDoc = hitos.find((h) => h.factura?.documentoId === doc.id);
      const calc = calcularCesion(
        {
          id: c.id, operacionId: op.id, operacionNumero: op.numero, factorNombre: op.factorNombre, recurso: op.recurso, fechaCesion: op.fechaCesion,
          documentoId: doc.id, folio: doc.folio, clienteId: doc.contraparteId, nominal: n(c.nominal), pctAnticipo: op.pctAnticipo, costoFactor: n(c.costo_asignado),
          fechaAnticipo: op.fechaAnticipo, vence: hitoDoc?.vence ?? doc.fechaVencimiento, fechaEstimadaPago: hitoDoc?.fechaEstimadaPago ?? null,
          fechaPagoReal: c.fecha_pago_cliente, factorConfirmaFecha: c.factor_confirma_fecha, moraCobrada: nOrNull(c.mora_cobrada), excedenteRecibidoFecha: c.excedente_fecha,
          tasaMora: op.tasaMora,
        },
        hoy,
      );
      return { ...calc, clienteNombre: doc.razonSocial };
    })
    .filter((x): x is Cesion & { clienteNombre: string | null } => x !== null);

  // ── Banco ──
  const categorias: Categoria[] = categoriasR.map((c: any) => ({
    id: c.id, nombre: c.nombre, sentido: c.sentido, requiereProyecto: c.requiere_proyecto, cuentaContable: c.cuenta_contable, orden: c.orden, activa: c.activa,
  }));
  const reglas: ReglaCategoria[] = reglasR.map((r: any) => ({
    id: r.id, cuentaId: r.cuenta_id, patron: r.patron, montoMin: nOrNull(r.monto_min), montoMax: nOrNull(r.monto_max), categoriaId: r.categoria_id,
    proyectoId: r.proyecto_id, prioridad: r.prioridad, activa: r.activa,
  }));
  const conciliados = new Map<string, number>();
  // «Conciliar sin documento» (entidad «otro») no liga a nada: no cuenta como documento. Si contara,
  // el movimiento quedaría «con documento» y Contabilidad no le haría su asiento (la comisión no
  // llegaba a los libros).
  for (const c of conciliacionesR) if (c.entidad_tipo !== "otro") conciliados.set(c.movimiento_id, (conciliados.get(c.movimiento_id) ?? 0) + 1);
  const cuentaNombre = new Map<string, string>(cuentasR.map((c: any) => [c.id, c.nombre]));
  const catNombre = new Map(categorias.map((c) => [c.id, c.nombre]));
  const movimientos: MovimientoVista[] = movimientosR
    .map((m: any) => {
      const calc = calcularMovimiento(
        {
          id: m.id, cuentaId: m.cuenta_id, fecha: m.fecha, glosa: m.glosa, monto: n(m.monto), categoriaId: m.categoria_id, proyectoId: m.proyecto_id,
          responsable: m.responsable, tieneRespaldo: m.tiene_respaldo, documentoRef: m.documento_ref, conciliaciones: conciliados.get(m.id) ?? 0, comentario: m.comentario,
        },
        p,
        hoy,
      );
      const regla = !m.categoria_id ? reglaQueCalza({ glosa: m.glosa, monto: n(m.monto), cuentaId: m.cuenta_id }, reglas) : null;
      return {
        ...calc, cuentaNombre: cuentaNombre.get(m.cuenta_id) ?? "Cuenta", categoriaNombre: m.categoria_id ? catNombre.get(m.categoria_id) ?? null : null,
        proyectoNombre: m.proyecto_id ? proyNombre.get(m.proyecto_id) ?? null : null, contactoId: m.contacto_id, numeroDocumento: m.numero_documento,
        sugerencia: regla ? { reglaId: regla.id, categoriaId: regla.categoriaId, proyectoId: regla.proyectoId } : null,
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const cuentas: CuentaFin[] = cuentasR.map((c: any) => {
    const desde = c.fecha_saldo as string | null;
    const posteriores = movimientos.filter((m) => m.cuentaId === c.id && (!desde || m.fecha > desde)).reduce((s, m) => s + m.monto, 0);
    return {
      id: c.id, nombre: c.nombre, tipo: c.tipo, banco: c.banco, numeroEnmascarado: c.numero_enmascarado, saldoBanco: n(c.saldo_banco), fechaSaldo: desde,
      activa: c.activa, saldoCalculado: n(c.saldo_banco) + posteriores,
    };
  });
  const cajaBancos = cuentas.filter((c) => c.activa && c.tipo === "banco").reduce((s, c) => s + c.saldoBanco, 0);
  const deudaTarjeta = -cuentas.filter((c) => c.activa && c.tipo === "tarjeta").reduce((s, c) => s + c.saldoBanco, 0);

  const partidas: PartidaManual[] = partidasR.map((x: any) => ({ mes: x.mes, concepto: x.concepto, monto: n(x.monto) }));
  const flujo = calcularFlujo({ hoy, cajaBancos, deudaTarjeta, hitos, compras, cesiones, partidas, p });
  const dashboard = calcularDashboard({ hoy, cajaBancos, deudaTarjeta, hitos, compras, cesiones, movimientos });

  const proyectos: Proyecto[] = proyectosR.map((r: any) => {
    const base: ProyectoBase = {
      id: r.id, codigo: r.codigo, nombre: r.nombre, mandanteId: r.mandante_id, tipo: r.tipo, jefeProyecto: r.jefe_proyecto,
      presupuestoCostos: nOrNull(r.presupuesto_costos), estado: r.estado,
    };
    return { ...base, descripcion: r.descripcion, fechaInicio: r.fecha_inicio, fechaTermino: r.fecha_termino, esGeneral: r.es_general, cifras: cifrasProyecto(base, hitos, compras) };
  });

  return {
    hoy, empresa, p, flags, contrapartes, nombreDe, perfiles, cuentas, categorias, reglas, factores, proyectos, hitos, documentos, cobros, compras, pagos,
    operaciones, cesiones, movimientos, partidas, cajaBancos, deudaTarjeta, flujo, dashboard,
    ultimaImportacion: (importacionesR as any[])[0]?.creado_en ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- Escritura: auditoría, eventos y numeración --------------------------

export async function siguienteNumero(empresaId: string, tipo: string, prefijo: string, relleno = 6): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("fin_siguiente_numero", { p_empresa: empresaId, p_tipo: tipo });
  revienta("numerar", error);
  return `${prefijo}-${String(data).padStart(relleno, "0")}`;
}

/** Todo cambio guarda quién, cuándo y por qué. Si la auditoría falla, el cambio igual quedó. */
export async function auditar(
  ctx: ContextoFin,
  tabla: string,
  registroId: string | null,
  accion: string,
  detalle: string | null,
  extra: { antes?: unknown; despues?: unknown; motivo?: string | null } = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from("fin_auditoria").insert({
    empresa_id: ctx.empresa.id, tabla, registro_id: registroId, accion, detalle, antes: extra.antes ?? null, despues: extra.despues ?? null,
    motivo: extra.motivo ?? null, usuario: ctx.usuario.correo,
  });
  if (error) console.warn("[fin] auditoría:", error.message);
}

export async function registrarEvento(ctx: ContextoFin, tipo: string, entidadTipo: string, entidadId: string | null, payload: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabaseAdmin.from("fin_eventos").insert({ empresa_id: ctx.empresa.id, tipo, entidad_tipo: entidadTipo, entidad_id: entidadId, payload });
  if (error) console.warn("[fin] evento:", error.message);
}

export interface EventoAuditoria {
  id: string;
  accion: string;
  detalle: string | null;
  motivo: string | null;
  usuario: string | null;
  creadoEn: string;
}

export async function historialDe(empresaId: string, registroId: string): Promise<EventoAuditoria[]> {
  const { data, error } = await supabaseAdmin
    .from("fin_auditoria")
    .select("id, accion, detalle, motivo, usuario, creado_en")
    .eq("empresa_id", empresaId)
    .eq("registro_id", registroId)
    .order("creado_en", { ascending: false })
    .limit(100);
  revienta("leer historial", error);
  return (data ?? []).map((r) => ({ id: r.id, accion: r.accion, detalle: r.detalle, motivo: r.motivo, usuario: r.usuario, creadoEn: r.creado_en }));
}

/** El proyecto «General» de la empresa (para gastos que no son de un proyecto). */
export async function proyectoGeneral(empresaId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("fin_proyectos").select("id").eq("empresa_id", empresaId).eq("es_general", true).maybeSingle();
  return data?.id ?? null;
}

/** Comprueba que un registro sea de la empresa activa antes de tocarlo. */
export async function exigirDeEmpresa(tabla: string, id: string, empresaId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin.from(tabla).select("*").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
  revienta(`leer ${tabla}`, error);
  if (!data) throw new Error("[fin] Ese registro no existe o es de otra empresa.");
  return data;
}

export function fechaValida(v: FormDataEntryValue | null): Iso | null {
  const t = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export function montoDe(v: FormDataEntryValue | null): number | null {
  const t = String(v ?? "").replace(/[$\s.]/g, "").replace(",", ".").trim();
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? Math.round(x) : null;
}

/** Liga un movimiento bancario a un cobro/pago: queda «Conciliado con documento». */
export async function conciliarConMovimiento(empresaId: string, movimientoId: string, tipo: "cobro" | "pago" | "factoring" | "traspaso" | "otro", entidadId: string | null, monto: number, categoriaId: string | null): Promise<void> {
  const { data: m } = await supabaseAdmin.from("fin_movimientos").select("id, categoria_id").eq("id", movimientoId).eq("empresa_id", empresaId).maybeSingle();
  if (!m) throw new Error("[fin] Ese movimiento no existe o es de otra empresa.");
  await supabaseAdmin.from("fin_conciliaciones").insert({ empresa_id: empresaId, movimiento_id: movimientoId, entidad_tipo: tipo, entidad_id: entidadId, monto });
  await supabaseAdmin
    .from("fin_movimientos")
    .update({ tiene_respaldo: true, categoria_id: m.categoria_id ?? categoriaId, actualizado_en: new Date().toISOString() })
    .eq("id", movimientoId);
}

/** Lo que el motor contable necesita de la vista (lib/fin/contabilidad.ts). */
export function entradaContable(v: VistaFin): import("./contabilidad").EntradaContable {
  const generales = new Set(v.proyectos.filter((p) => p.esGeneral).map((p) => p.id));
  const tarjetas = new Set(v.cuentas.filter((c) => c.tipo === "tarjeta").map((c) => c.id));
  const cuentaDeCategoria = new Map(v.categorias.map((c) => [c.id, c.cuentaContable]));
  return {
    documentos: v.documentos.map((d) => {
      const hito = v.hitos.find((h) => d.hitoIds.includes(h.id));
      const compra = v.compras.find((c) => d.compraIds.includes(c.id));
      const proyectoId = hito?.proyectoId ?? compra?.proyectoId ?? null;
      return { ...d, tipoVenta: hito?.tipo ?? null, proyectoId, esGeneral: proyectoId ? generales.has(proyectoId) : true };
    }),
    cobros: v.cobros,
    pagos: v.pagos,
    operaciones: v.operaciones.map((o) => {
      const cs = v.cesiones.filter((c) => c.operacionId === o.id);
      return { ...o, anticipo: cs.reduce((s, c) => s + c.anticipo, 0), costo: o.costoTotal, nominal: cs.reduce((s, c) => s + c.nominal, 0) };
    }),
    // Lo conciliado CON documento ya entra por su cobro/pago: acá solo lo que no tiene documento.
    movimientos: v.movimientos
      .filter((m) => m.estado === "Conciliado" && m.categoriaId)
      .map((m) => ({ id: m.id, fecha: m.fecha, glosa: m.glosa, monto: m.monto, cuentaContable: cuentaDeCategoria.get(m.categoriaId!) ?? null, esTarjeta: tarjetas.has(m.cuentaId), proyectoId: m.proyectoId, estado: m.estado })),
  };
}

/** Como contextoFin, pero para route handlers: devuelve null en vez de redirigir. */
export async function contextoFinApi(): Promise<ContextoFin | null> {
  const { verificarAccesoAppApi } = await import("../autorizacion");
  const acceso = await verificarAccesoAppApi(SLUG_APP_FIN);
  if (!acceso.usuario) return null;
  const { activa } = await contextoDeEmpresa(acceso.usuario.id, acceso.usuario.rol);
  if (!activa || !EMPRESAS_CON_FINANZAS.includes(activa.slug)) return null;
  return { usuario: acceso.usuario, empresa: activa, hoy: hoyEnSantiago().iso };
}

// ---------- Comercial (oportunidades y cotizaciones) ---------------------------------

export interface Oportunidad {
  id: string;
  codigo: string;
  nombre: string;
  clienteId: string | null;
  proyectoId: string | null;
  tipo: string;
  etapa: string;
  montoEstimado: number;
  probabilidad: number;
  fechaCierre: Iso | null;
  responsable: string | null;
  origen: string | null;
  motivoPerdida: string | null;
  descripcion: string | null;
  actualizadoEn: string;
  ultimaActividad: string | null;
}

export interface Cotizacion {
  id: string;
  numero: string;
  version: number;
  oportunidadId: string | null;
  clienteId: string | null;
  proyectoId: string | null;
  titulo: string;
  fecha: Iso;
  validezDias: number;
  tipo: string;
  condicionPagoDias: number | null;
  requiereOc: boolean;
  requiereEdp: boolean;
  requiereHes: boolean;
  estado: string;
  fechaEnvio: Iso | null;
  fechaAceptacion: Iso | null;
  ocClienteNumero: string | null;
  motivo: string | null;
  neto: number;
  iva: number;
  total: number;
  notas: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const cargarComercial = cache(async () => {
  const { empresa } = await contextoFin();
  const [ops, cots, acts] = await Promise.all([
    tabla("fin_oportunidades", empresa.id, "orden"),
    tabla("fin_cotizaciones", empresa.id, "fecha"),
    supabaseAdmin.from("fin_actividades").select("entidad_id, creado_en").eq("empresa_id", empresa.id).eq("entidad_tipo", "oportunidad").order("creado_en", { ascending: false }).limit(5000).then((r) => r.data ?? []),
  ]);
  const ultima = new Map<string, string>();
  for (const a of acts as any[]) if (!ultima.has(a.entidad_id)) ultima.set(a.entidad_id, a.creado_en);
  const oportunidades: Oportunidad[] = ops.map((r: any) => ({
    id: r.id, codigo: r.codigo, nombre: r.nombre, clienteId: r.cliente_id, proyectoId: r.proyecto_id, tipo: r.tipo, etapa: r.etapa, montoEstimado: n(r.monto_estimado),
    probabilidad: r.probabilidad, fechaCierre: r.fecha_cierre, responsable: r.responsable, origen: r.origen, motivoPerdida: r.motivo_perdida, descripcion: r.descripcion,
    actualizadoEn: r.actualizado_en, ultimaActividad: ultima.get(r.id) ?? null,
  }));
  const cotizaciones: Cotizacion[] = cots
    .map((r: any) => ({
      id: r.id, numero: r.numero, version: r.version, oportunidadId: r.oportunidad_id, clienteId: r.cliente_id, proyectoId: r.proyecto_id, titulo: r.titulo, fecha: r.fecha,
      validezDias: r.validez_dias, tipo: r.tipo, condicionPagoDias: nOrNull(r.condicion_pago_dias), requiereOc: r.requiere_oc, requiereEdp: r.requiere_edp, requiereHes: r.requiere_hes,
      estado: r.estado, fechaEnvio: r.fecha_envio, fechaAceptacion: r.fecha_aceptacion, ocClienteNumero: r.oc_cliente_numero, motivo: r.motivo, neto: n(r.neto), iva: n(r.iva),
      total: n(r.total), notas: r.notas,
    }))
    .reverse();
  return { oportunidades, cotizaciones };
});

export async function lineasDeCotizacion(cotizacionId: string): Promise<import("./modelo").LineaCotizacion[]> {
  const { data, error } = await supabaseAdmin.from("fin_cotizacion_lineas").select("*").eq("cotizacion_id", cotizacionId).order("orden");
  revienta("leer las líneas", error);
  return (data ?? []).map((l: any) => ({
    productoId: l.producto_id, descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad, precioUnitario: n(l.precio_unitario),
    descuentoPct: n(l.descuento_pct), exento: l.exento, meses: nOrNull(l.meses),
  }));
}

export interface Actividad {
  id: string;
  tipo: string;
  texto: string;
  fecha: Iso;
  vencimiento: Iso | null;
  hecha: boolean;
  creadoPor: string | null;
  creadoEn: string;
}

export async function actividadesDe(entidadTipo: string, entidadId: string): Promise<Actividad[]> {
  const { empresa } = await contextoFin();
  const { data, error } = await supabaseAdmin.from("fin_actividades").select("*").eq("empresa_id", empresa.id).eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId).order("creado_en", { ascending: false }).limit(200);
  revienta("leer actividades", error);
  return (data ?? []).map((a: any) => ({ id: a.id, tipo: a.tipo, texto: a.texto, fecha: a.fecha, vencimiento: a.vencimiento, hecha: a.hecha, creadoPor: a.creado_por, creadoEn: a.creado_en }));
}

export async function adjuntosDe(entidadTipo: string, entidadId: string): Promise<{ id: string; nombre: string; tipo: string; creadoEn: string }[]> {
  const { empresa } = await contextoFin();
  const { data } = await supabaseAdmin.from("fin_adjuntos").select("id, nombre, tipo, creado_en").eq("empresa_id", empresa.id).eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId).order("creado_en", { ascending: false });
  return (data ?? []).map((a: any) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, creadoEn: a.creado_en }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Productos del Inventario (catálogo compartido entre empresas), solo lectura, para líneas de cotización. */
export async function productosInventario(): Promise<{ id: string; nombre: string; precio: number; unidad: string | null }[]> {
  const [{ data: ps }, { data: us }] = await Promise.all([
    supabaseAdmin.from("inv_productos").select("id, nombre, precio, unidad_id").eq("activo", true).order("nombre").limit(2000),
    supabaseAdmin.from("inv_unidades").select("id, abreviacion"),
  ]);
  const abrev = new Map((us ?? []).map((u) => [u.id as string, u.abreviacion as string]));
  return (ps ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, precio: Number(p.precio ?? 0), unidad: p.unidad_id ? abrev.get(p.unidad_id as string) ?? null : null }));
}

/** Asientos ya contabilizados de un rango (con sus líneas) y el estado del período. */
export async function asientosGuardados(empresaId: string, desde: Iso, hasta: Iso): Promise<{ id: string; numero: string; fecha: Iso; glosa: string; origenTipo: string; origenId: string | null; lineas: { cuenta: string; debe: number; haber: number }[] }[]> {
  const { data, error } = await supabaseAdmin.from("fin_asientos").select("id, numero, fecha, glosa, origen_tipo, origen_id, fin_asiento_lineas(cuenta_codigo, debe, haber)").eq("empresa_id", empresaId).neq("estado", "anulado").gte("fecha", desde).lte("fecha", hasta).order("fecha");
  revienta("leer asientos", error);
  return (data ?? []).map((a) => ({
    id: a.id, numero: a.numero, fecha: a.fecha, glosa: a.glosa, origenTipo: a.origen_tipo, origenId: a.origen_id,
    lineas: ((a.fin_asiento_lineas ?? []) as { cuenta_codigo: string; debe: number; haber: number }[]).map((l) => ({ cuenta: l.cuenta_codigo, debe: Number(l.debe), haber: Number(l.haber) })),
  }));
}

/**
 * Un período cerrado no admite documentos, cobros, pagos ni cesiones con fecha en ese mes (ni anularlos).
 * Devuelve el error para mostrar, o null si el mes está abierto.
 */
export async function periodoCerrado(empresaId: string, fecha: string | null | undefined): Promise<string | null> {
  if (!fecha || !/^\d{4}-\d{2}/.test(fecha)) return null;
  const { estado } = await estadoPeriodo(empresaId, Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)));
  return estado === "cerrado" ? `El período ${fecha.slice(5, 7)}/${fecha.slice(0, 4)} está cerrado: reábrelo en Contabilidad para registrar o anular con esa fecha.` : null;
}

export async function estadoPeriodo(empresaId: string, anio: number, mes: number): Promise<{ estado: string; cerradoPor: string | null }> {
  const { data } = await supabaseAdmin.from("fin_periodos").select("estado, cerrado_por").eq("empresa_id", empresaId).eq("anio", anio).eq("mes", mes).maybeSingle();
  return { estado: data?.estado ?? "abierto", cerradoPor: data?.cerrado_por ?? null };
}

export async function cuentasContables(empresaId: string): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.from("fin_cuentas_contables").select("codigo, nombre").eq("empresa_id", empresaId);
  return new Map((data ?? []).map((c) => [c.codigo as string, c.nombre as string]));
}

export async function rutinasHechas(empresaId: string): Promise<Map<string, { por: string | null; en: string }>> {
  const { data } = await supabaseAdmin.from("fin_rutinas").select("tarea, periodo, hecha_por, hecha_en").eq("empresa_id", empresaId).order("hecha_en", { ascending: false }).limit(500);
  return new Map((data ?? []).map((r) => [`${r.tarea}|${r.periodo}`, { por: r.hecha_por as string | null, en: r.hecha_en as string }]));
}
