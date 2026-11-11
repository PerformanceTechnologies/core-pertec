import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import { exigirDeEmpresa, revienta, type ContextoFin } from "./datos";
import { logoComoDataUri, perfilDeEmpresa } from "./empresa-perfil";
import type { DatosOc } from "./oc-documento";
import type { ResumenCompra } from "./oc-resumen";
import type { CompraVista } from "./datos";
import { esMoneda, type LineaOc } from "./oc-modelo";

/* eslint-disable @typescript-eslint/no-explicit-any */

const n = (v: any): number => (v === null || v === undefined ? 0 : Number(v));

/** Las líneas de detalle de una solicitud con formato OC, en su orden. */
export async function lineasDeCompra(compraId: string): Promise<LineaOc[]> {
  const { data, error } = await supabaseAdmin.from("fin_compra_lineas").select("*").eq("compra_id", compraId).order("orden");
  revienta("leer las líneas de la compra", error);
  return (data ?? []).map((l: any) => ({
    productoId: l.producto_id ?? null, descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad ?? null, precioUnitario: n(l.precio_unitario),
    descuentoPct: n(l.descuento_pct), exento: Boolean(l.exento), nota: l.nota ?? null,
  }));
}

export async function tasaIvaDe(empresaId: string): Promise<number> {
  const { data } = await supabaseAdmin.from("fin_parametros").select("tasa_iva").eq("empresa_id", empresaId).maybeSingle();
  return data?.tasa_iva === null || data?.tasa_iva === undefined ? 0.19 : Number(data.tasa_iva);
}

const fechaDe = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);

/**
 * Todo lo que el PDF y el resumen de una OC necesitan, siempre de la empresa activa (exigirDeEmpresa devuelve
 * «no existe» si el id es de otra).
 */
export async function ocParaDocumento(ctx: ContextoFin, id: string): Promise<{ documento: DatosOc; formatoOc: boolean; proveedorId: string | null; proveedorCorreos: string[] }> {
  const c = (await exigirDeEmpresa("fin_compras", id, ctx.empresa.id)) as any;
  const [lineas, perfil, tasaIva, empresaFila] = await Promise.all([
    lineasDeCompra(id),
    perfilDeEmpresa(ctx.empresa.id),
    tasaIvaDe(ctx.empresa.id),
    supabaseAdmin.from("empresas").select("condiciones_oc").eq("id", ctx.empresa.id).maybeSingle(),
  ]);

  let proveedor: DatosOc["proveedor"] = null;
  const correos: string[] = [];
  if (c.proveedor_id) {
    const { data: f, error } = await supabaseAdmin.from("finanzas_contactos").select("razon_social, rut, giro, direccion, comuna, ciudad, correo, telefono").eq("id", c.proveedor_id).maybeSingle();
    revienta("leer el proveedor", error);
    if (f) {
      const lugar = [f.direccion, f.comuna, f.ciudad].filter(Boolean).join(", ");
      proveedor = { nombre: f.razon_social, rut: f.rut ?? null, giro: f.giro ?? null, direccion: lugar || null, telefono: f.telefono ?? null, correo: c.proveedor_correo || f.correo || null };
      if (c.proveedor_correo) correos.push(c.proveedor_correo);
      const { data: personas } = await supabaseAdmin.from("finanzas_contacto_personas").select("correo, principal").eq("contacto_id", c.proveedor_id).order("principal", { ascending: false });
      correos.push(...((personas ?? []).map((p) => p.correo).filter(Boolean) as string[]).slice(0, 2));
      if (f.correo) correos.push(f.correo);
    }
  }
  let proyecto: string | null = null;
  if (c.proyecto_id) {
    const { data: p } = await supabaseAdmin.from("fin_proyectos").select("nombre").eq("id", c.proyecto_id).maybeSingle();
    proyecto = p?.nombre ?? null;
  }
  const solicitante = c.solicitante_nombre?.trim() || (c.solicitante ? String(c.solicitante).split("@")[0] : "—");
  const moneda = esMoneda(c.moneda) ? c.moneda : "CLP";

  return {
    documento: {
      empresa: { slug: perfil.slug, nombre: perfil.nombre, rut: perfil.rut, direccion: perfil.direccion, giro: perfil.giro, telefono: perfil.telefono, correo: perfil.correo, web: perfil.web, condicionesOc: (empresaFila.data as any)?.condiciones_oc ?? null },
      logo: await logoComoDataUri(perfil.slug),
      numero: c.oc_numero ?? null,
      fecha: fechaDe(c.oc_fecha) ?? fechaDe(c.creado_en) ?? ctx.hoy,
      titulo: c.descripcion, proyecto, solicitante, proveedor, atencion: c.atencion ?? null,
      moneda, tipoCambio: n(c.tipo_cambio) || 1, lineas, tasaIva,
      entregaLugar: c.entrega_lugar ?? null, entregaPlazo: c.entrega_plazo ?? null, fechaRequerida: c.fecha_requerida ?? null,
      formaPago: c.forma_pago ?? null, condicionPagoDias: c.condicion_pago_dias === null || c.condicion_pago_dias === undefined ? null : Number(c.condicion_pago_dias),
      observaciones: c.observaciones_oc ?? null, condiciones: c.condiciones_oc ?? null,
      firmas: {
        solicitado: { nombre: solicitante, fecha: fechaDe(c.enviada_aprobacion_en) ?? fechaDe(c.creado_en) },
        aprobado: c.aprobado_por ? { nombre: c.aprobado_por, fecha: fechaDe(c.fecha_aprobacion) } : null,
        visado: c.visado_por ? { nombre: c.visado_por, fecha: fechaDe(c.fecha_visado) } : null,
      },
    },
    formatoOc: Boolean(c.formato_oc),
    proveedorId: c.proveedor_id ?? null,
    proveedorCorreos: [...new Set(correos.map((x) => x.trim()).filter(Boolean))],
  };
}

/** Las líneas de varias solicitudes de una vez (la bandeja de aprobación arma el resumen de cada una). */
export async function lineasDeCompras(compraIds: string[]): Promise<Map<string, LineaOc[]>> {
  const salida = new Map<string, LineaOc[]>();
  if (compraIds.length === 0) return salida;
  for (let i = 0; i < compraIds.length; i += 300) {
    const { data, error } = await supabaseAdmin.from("fin_compra_lineas").select("*").in("compra_id", compraIds.slice(i, i + 300)).order("orden");
    revienta("leer los ítems de las compras", error);
    for (const l of (data ?? []) as any[]) {
      const fila: LineaOc = {
        productoId: l.producto_id ?? null, descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad ?? null, precioUnitario: n(l.precio_unitario),
        descuentoPct: n(l.descuento_pct), exento: Boolean(l.exento), nota: l.nota ?? null,
      };
      salida.set(l.compra_id, [...(salida.get(l.compra_id) ?? []), fila]);
    }
  }
  return salida;
}

/** El resumen que se muestra en pantalla, armado con la compra ya calculada y sus líneas. */
export function resumenDeCompra(c: CompraVista, lineas: LineaOc[], tasaIva: number): ResumenCompra {
  return {
    id: c.id, codigo: c.codigo, titulo: c.descripcion, paso: c.paso, anulada: Boolean(c.estadoOverride), ocNumero: c.ocNumero, proyecto: c.proyectoNombre,
    solicitante: c.solicitanteNombre?.trim() || (c.solicitante ? c.solicitante.split("@")[0] : "—"),
    proveedor: c.proveedorNombre ? { nombre: c.proveedorNombre, rut: null } : null, atencion: c.atencion, proveedorCorreo: c.proveedorCorreo,
    moneda: c.moneda, tipoCambio: c.tipoCambio, tasaIva, lineas, fechaRequerida: c.fechaRequerida, entregaLugar: c.entregaLugar, entregaPlazo: c.entregaPlazo,
    formaPago: c.formaPago, condicionPagoDias: c.condicionPagoDias, observaciones: c.observacionesOc,
    enviadaPor: c.enviadaAprobacionPor, enviadaEn: c.enviadaAprobacionEn, aprobadoPor: c.aprobadoPor, fechaAprobacion: c.fechaAprobacion, visadoPor: c.visadoPor, fechaVisado: c.fechaVisado,
    devuelta: c.devueltaMotivo ? { motivo: c.devueltaMotivo, por: c.devueltaPor, en: c.devueltaEn } : null, motivoAnulacion: c.estadoOverride ? c.motivo : null,
  };
}
