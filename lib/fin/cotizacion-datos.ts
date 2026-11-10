import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import { cargarVistaDe, exigirDeEmpresa, lineasDeCotizacion, revienta, type ContextoFin } from "./datos";
import { logoComoDataUri, perfilDeEmpresa, type PerfilEmpresa } from "./empresa-perfil";
import type { DatosDocumento } from "./cotizacion-documento";
import { correosValidos } from "../ofertas/emision";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CotizacionParaDocumento {
  documento: DatosDocumento;
  perfil: PerfilEmpresa;
  /** Correos con los que se llena el «Para» al enviar: el de atención, el de la persona principal, el del cliente. */
  correosSugeridos: string[];
  estado: string;
  clienteId: string | null;
  oportunidadId: string | null;
  enviadaA: string | null;
  enviadaEn: string | null;
}

/**
 * Todo lo que el PDF y el correo necesitan de una cotización, siempre de la empresa activa
 * (exigirDeEmpresa devuelve «no existe» si el id es de otra).
 */
export async function cotizacionParaDocumento(ctx: ContextoFin, id: string): Promise<CotizacionParaDocumento> {
  const c = (await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id)) as any;
  const [lineas, perfil, vista] = await Promise.all([lineasDeCotizacion(id), perfilDeEmpresa(ctx.empresa.id), cargarVistaDe(ctx)]);

  let cliente: DatosDocumento["cliente"] = null;
  const sugeridos: string[] = [];
  if (c.cliente_id) {
    const { data: f, error } = await supabaseAdmin.from("finanzas_contactos").select("razon_social, rut, giro, direccion, comuna, ciudad, correo, correo_dte, telefono").eq("id", c.cliente_id).maybeSingle();
    revienta("leer el cliente", error);
    if (f) {
      const lugar = [f.direccion, f.comuna, f.ciudad].filter(Boolean).join(", ");
      cliente = { nombre: f.razon_social, rut: f.rut ?? null, giro: f.giro ?? null, direccion: lugar || null, telefono: f.telefono ?? null, correo: f.correo ?? null };
      const { data: personas } = await supabaseAdmin.from("finanzas_contacto_personas").select("nombre, correo, principal").eq("contacto_id", c.cliente_id).order("principal", { ascending: false });
      sugeridos.push(...((personas ?? []).map((p) => p.correo).filter(Boolean) as string[]).slice(0, 2));
      if (f.correo) sugeridos.push(f.correo);
    }
  }
  const correosSugeridos = correosValidos([c.correo_atencion, ...sugeridos].filter(Boolean).join(","));
  const nombreEmisor = ctx.usuario.nombre?.trim() || ctx.usuario.correo.split("@")[0];

  return {
    documento: {
      empresa: { nombre: perfil.nombre, rut: perfil.rut, direccion: perfil.direccion, giro: perfil.giro, telefono: perfil.telefono, correo: perfil.correo, web: perfil.web, datosBancarios: perfil.datosBancarios, pie: perfil.pie },
      logo: await logoComoDataUri(perfil.slug),
      numero: c.numero, version: c.version, titulo: c.titulo, fecha: c.fecha, validezDias: c.validez_dias, tipo: c.tipo, estado: c.estado,
      cliente, atencion: c.atencion ?? null, correoAtencion: c.correo_atencion ?? null, lineas, tasaIva: vista.p.tasaIva,
      descuentoGeneral: (c.descuento_general_tipo === "pct" || c.descuento_general_tipo === "monto") && Number(c.descuento_general_valor) > 0 ? { tipo: c.descuento_general_tipo, valor: Number(c.descuento_general_valor) } : null,
      incluirDatosPago: Boolean(c.incluir_datos_pago),
      condicionPagoDias: c.condicion_pago_dias === null || c.condicion_pago_dias === undefined ? null : Number(c.condicion_pago_dias),
      formaPago: c.forma_pago ?? null, plazoEntrega: c.plazo_entrega ?? null,
      requiereOc: Boolean(c.requiere_oc), requiereEdp: Boolean(c.requiere_edp), requiereHes: Boolean(c.requiere_hes), notas: c.notas ?? null,
      emisor: { nombre: nombreEmisor, correo: ctx.usuario.correo },
    },
    perfil, correosSugeridos, estado: c.estado, clienteId: c.cliente_id ?? null, oportunidadId: c.oportunidad_id ?? null, enviadaA: c.enviada_a ?? null, enviadaEn: c.enviada_en ?? null,
  };
}
