"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { borrarArchivos } from "@/lib/archivos/almacen";
import {
  RUTA_FIN,
  auditar,
  cargarVista,
  conciliarConMovimiento,
  contextoFin,
  exigirDeEmpresa,
  fechaValida,
  montoDe,
  periodoCerrado,
  proyectoGeneral,
  registrarEvento,
  revienta,
  siguienteNumero,
} from "@/lib/fin/datos";
import { peso, sumarDias } from "@/lib/fin/reglas";
import { aPesos, esMoneda, netoLineaOc, totalesOc, type LineaOc, type Moneda } from "@/lib/fin/oc-modelo";
import { lineasDeCompra, tasaIvaDe } from "@/lib/fin/oc-datos";
import { asignacionesDeEmpresa, candidatosDeFlujo, exigirAlgunRol, exigirRol } from "@/lib/fin/flujos";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "Ocurrió un error inesperado." };
}
const refrescar = () => revalidatePath(RUTA_FIN, "layout");
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const ahora = () => new Date().toISOString();
const ids = (lista: string[]) => lista.filter((x) => uuid(x)).slice(0, 200);

// ---------- Solicitud ----------------------------------------------------------------

/** Formulario corto: proyecto (o General), proveedor, qué se compra, neto, fecha requerida. */
export async function crearCompraAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const descripcion = texto(fd, "descripcion", 300);
    const neto = montoDe(fd.get("netoCotizado"));
    if (!descripcion) return { ok: false, error: "Escribe qué se compra." };
    if (neto === null || neto <= 0) return { ok: false, error: "Indica el monto neto cotizado." };
    const proyectoId = uuid(fd.get("proyectoId")) ?? (await proyectoGeneral(ctx.empresa.id));
    if (proyectoId) await exigirDeEmpresa("fin_proyectos", proyectoId, ctx.empresa.id);
    const codigo = await siguienteNumero(ctx.empresa.id, "compra", "C", 4);
    const prioridad = String(fd.get("prioridad") ?? "normal");
    const { data, error } = await supabaseAdmin
      .from("fin_compras")
      .insert({
        empresa_id: ctx.empresa.id, codigo, proyecto_id: proyectoId, proveedor_id: uuid(fd.get("proveedorId")), descripcion, neto_cotizado: neto,
        fecha_requerida: fechaValida(fd.get("fechaRequerida")), solicitante: ctx.usuario.correo, prioridad: ["baja", "normal", "alta"].includes(prioridad) ? prioridad : "normal",
        comentario: texto(fd, "comentario", 1000), creado_por: ctx.usuario.correo,
      })
      .select("id")
      .single();
    revienta("crear la solicitud", error);
    await auditar(ctx, "fin_compras", data!.id, "crear", `Solicitud ${codigo} por ${neto}`);
    await registrarEvento(ctx, "compra_solicitada", "compra", data!.id, { neto });
    refrescar();
    return { ok: true, id: data!.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function editarCompraAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const antes = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    const neto = montoDe(fd.get("netoCotizado"));
    const motivo = texto(fd, "motivo", 300);
    if (antes.fecha_visado && neto !== null && Number(antes.neto_cotizado) !== neto && !motivo) return { ok: false, error: "Cambiar el monto de una compra visada pide un motivo." };
    const fila = {
      descripcion: texto(fd, "descripcion", 300) ?? antes.descripcion, neto_cotizado: neto, proveedor_id: uuid(fd.get("proveedorId")),
      proyecto_id: uuid(fd.get("proyectoId")) ?? antes.proyecto_id, fecha_requerida: fechaValida(fd.get("fechaRequerida")), comentario: texto(fd, "comentario", 1000),
      actualizado_en: ahora(),
    };
    const { error } = await supabaseAdmin.from("fin_compras").update(fila).eq("id", id);
    revienta("guardar la compra", error);
    await auditar(ctx, "fin_compras", id, "editar", `Compra ${antes.codigo}`, { antes, despues: fila, motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Aprobar, visar (genera la OC), rechazar ---------------------------------------

export async function aprobarComprasAction(lista: string[]): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const xs = ids(lista);
    if (xs.length === 0) return { ok: false, error: "Elige qué aprobar." };
    const { data: previas, error: e0 } = await supabaseAdmin.from("fin_compras").select("codigo, solicitante, formato_oc, enviada_aprobacion_en").eq("empresa_id", ctx.empresa.id).in("id", xs);
    revienta("leer las compras", e0);
    const sinEnviar = (previas ?? []).find((c) => c.formato_oc && !c.enviada_aprobacion_en);
    if (sinEnviar) return { ok: false, error: `${sinEnviar.codigo} todavía no se envió a aprobación: su autor debe enviarla.` };
    for (const c of previas ?? []) await exigirRol(ctx, "compras_aprobador", { solicitante: c.solicitante, accion: "aprobar" });
    const { data, error } = await supabaseAdmin
      .from("fin_compras")
      .update({ aprobado_por: ctx.usuario.nombre || ctx.usuario.correo, fecha_aprobacion: ctx.hoy, actualizado_en: ahora() })
      .eq("empresa_id", ctx.empresa.id)
      .in("id", xs)
      .is("estado_override", null)
      .is("aprobado_por", null)
      // Una solicitud con formato de OC solo se aprueba una vez enviada a aprobación.
      .or("formato_oc.eq.false,enviada_aprobacion_en.not.is.null")
      .select("id, codigo");
    revienta("aprobar", error);
    for (const c of data ?? []) await auditar(ctx, "fin_compras", c.id, "aprobar", `Compra ${c.codigo} aprobada`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Visar = Finanzas dice «hay plata». Al visar nace la OC al proveedor con su número. */
export async function visarComprasAction(lista: string[]): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const xs = ids(lista);
    const { data: filas, error } = await supabaseAdmin.from("fin_compras").select("*").eq("empresa_id", ctx.empresa.id).in("id", xs).is("estado_override", null);
    revienta("leer las compras", error);
    const listas = (filas ?? []).filter((c) => !c.fecha_visado && (c.aprobado_por || c.fecha_aprobacion));
    if (listas.length === 0) return { ok: false, error: "No hay compras aprobadas sin visar en la selección." };
    for (const c of listas) await exigirRol(ctx, "compras_visador", { solicitante: c.solicitante, accion: "visar" });
    for (const c of listas) {
      const oc = c.oc_numero ?? (await siguienteNumero(ctx.empresa.id, "oc", "OC"));
      const { error: e2 } = await supabaseAdmin
        .from("fin_compras")
        .update({ visado_por: ctx.usuario.nombre || ctx.usuario.correo, fecha_visado: ctx.hoy, oc_numero: oc, oc_fecha: c.oc_fecha ?? ctx.hoy, actualizado_en: ahora() })
        .eq("id", c.id);
      revienta("visar", e2);
      await auditar(ctx, "fin_compras", c.id, "visar", `Compra ${c.codigo} visada: OC ${oc}`);
      await registrarEvento(ctx, "compra_visada", "compra", c.id, { oc, neto: Number(c.neto_cotizado) });
    }
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function rechazarCompraAction(id: string, motivo: string, anular = false): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!motivo.trim()) return { ok: false, error: "Escribe el motivo." };
    await exigirAlgunRol(ctx, ["compras_aprobador", "compras_visador"], "rechazar");
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    const { error } = await supabaseAdmin.from("fin_compras").update({ estado_override: anular ? "anulada" : "rechazada", motivo: motivo.slice(0, 300), actualizado_en: ahora() }).eq("id", id);
    revienta("rechazar", error);
    await auditar(ctx, "fin_compras", id, anular ? "anular" : "rechazar", `Compra ${c.codigo}`, { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function marcarOcEnviadaAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_visador", { accion: "marcar la OC enviada" });
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    if (!c.oc_numero) return { ok: false, error: "La compra todavía no tiene OC: visa primero." };
    const { error } = await supabaseAdmin.from("fin_compras").update({ oc_enviada_fecha: ctx.hoy, actualizado_en: ahora() }).eq("id", id);
    revienta("marcar enviada", error);
    await auditar(ctx, "fin_compras", id, "oc_enviada", `OC ${c.oc_numero} enviada al proveedor`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Recepción conforme: Sí / Parcial / No, con observación. */
export async function recepcionAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_recepcion", { accion: "recepción" });
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    const resultado = String(fd.get("resultado") ?? "");
    if (!["si", "parcial", "no"].includes(resultado)) return { ok: false, error: "Elige Sí, Parcial o No." };
    const { error } = await supabaseAdmin
      .from("fin_compras")
      .update({ recepcion: resultado, recepcion_fecha: fechaValida(fd.get("fecha")) ?? ctx.hoy, recepcion_por: ctx.usuario.correo, recepcion_obs: texto(fd, "observacion", 500), actualizado_en: ahora() })
      .eq("id", id);
    revienta("registrar la recepción", error);
    await auditar(ctx, "fin_compras", id, "recepcion", `Recepción ${resultado} de ${c.codigo}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** La diferencia factura vs OC aprobada con motivo: deja de detener el pago. */
export async function aprobarDiferenciaAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!motivo.trim()) return { ok: false, error: "Escribe por qué se acepta la diferencia." };
    await exigirRol(ctx, "compras_recepcion", { accion: "aceptar la diferencia" });
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    const { error } = await supabaseAdmin.from("fin_compras").update({ diferencia_aprobada: true, actualizado_en: ahora() }).eq("id", id);
    revienta("aprobar la diferencia", error);
    await auditar(ctx, "fin_compras", id, "diferencia", `Diferencia con la OC aceptada en ${c.codigo}`, { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Factura del proveedor ---------------------------------------------------------

/**
 * Carga manual de una factura recibida. Ligada a una compra (OC) o, si llegó sin OC, crea su fila
 * de compra con «Factura sin OC: regularizar» para que pase por aprobación y visado.
 */
export async function registrarFacturaCompraAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const vista = await cargarVista();
    const folio = texto(fd, "folio", 20);
    const fecha = fechaValida(fd.get("fechaEmision"));
    if (!folio || !fecha) return { ok: false, error: "Folio y fecha de emisión son obligatorios." };
    const cerrado = await periodoCerrado(ctx.empresa.id, fecha);
    if (cerrado) return { ok: false, error: cerrado };
    const tipo = [33, 34, 46].includes(Number(fd.get("tipoDte"))) ? Number(fd.get("tipoDte")) : 33;
    let compraId = uuid(fd.get("compraId"));
    const compra = compraId ? vista.compras.find((c) => c.id === compraId) : null;
    if (compraId && !compra) return { ok: false, error: "Esa compra no existe." };
    const proveedorId = compra?.proveedorId ?? uuid(fd.get("proveedorId"));
    if (!proveedorId) return { ok: false, error: "Indica el proveedor." };
    const neto = montoDe(fd.get("neto")) ?? 0;
    const exento = montoDe(fd.get("exento")) ?? 0;
    const iva = montoDe(fd.get("iva")) ?? (tipo === 34 ? 0 : peso(neto * vista.p.tasaIva));
    const total = montoDe(fd.get("total")) ?? neto + exento + iva;
    const prov = vista.contrapartes.find((c) => c.id === proveedorId);
    const condicion = vista.perfiles.get(proveedorId)?.condicionCompraDias ?? prov?.plazoPagoDias ?? vista.p.plazoPagoProveedorDias;

    if (!compraId) {
      const codigo = await siguienteNumero(ctx.empresa.id, "compra", "C", 4);
      const { data, error } = await supabaseAdmin
        .from("fin_compras")
        .insert({
          empresa_id: ctx.empresa.id, codigo, proyecto_id: uuid(fd.get("proyectoId")) ?? (await proyectoGeneral(ctx.empresa.id)), proveedor_id: proveedorId,
          descripcion: texto(fd, "descripcion", 300) ?? `Factura ${folio} sin OC`, neto_cotizado: neto + exento, comentario: "Llegó factura sin OC", creado_por: ctx.usuario.correo,
        })
        .select("id")
        .single();
      revienta("crear la compra de la factura", error);
      compraId = data!.id;
    }
    const { data: doc, error } = await supabaseAdmin
      .from("fin_documentos")
      .insert({
        empresa_id: ctx.empresa.id, direccion: "recibido", tipo_dte: tipo, folio, fecha_emision: fecha, fecha_recepcion: fechaValida(fd.get("fechaRecepcion")) ?? ctx.hoy,
        contraparte_id: proveedorId, rut_contraparte: prov?.rut ?? "", razon_social: prov?.nombre ?? null, neto, exento, iva, total,
        fecha_vencimiento: fechaValida(fd.get("fechaVencimiento")) ?? sumarDias(fecha, condicion), referencias: texto(fd, "referencias", 500), origen: "manual",
        creado_por: ctx.usuario.correo,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return { ok: false, error: `La factura ${folio} de este proveedor ya está registrada.` };
    revienta("registrar la factura", error);
    const { error: e2 } = await supabaseAdmin.from("fin_documento_compras").insert({ documento_id: doc!.id, compra_id: compraId, monto: total });
    revienta("ligar la factura a la compra", e2);
    await auditar(ctx, "fin_documentos", doc!.id, "crear", `Factura proveedor ${folio} por ${total}${compra ? ` (${compra.codigo})` : " sin OC"}`);
    await registrarEvento(ctx, "factura_compra_registrada", "documento", doc!.id, { folio, total, compraId });
    refrescar();
    return { ok: true, id: doc!.id };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Pagos -------------------------------------------------------------------------

/** Programa el pago del saldo de las facturas de las compras elegidas para una fecha. */
export async function programarPagosAction(compraIds: string[], fecha: string, cuentaId: string | null): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_pagador", { accion: "programar pagos" });
    const vista = await cargarVista();
    if (!fechaValida(fecha)) return { ok: false, error: "Elige la fecha de pago." };
    const compras = vista.compras.filter((c) => ids(compraIds).includes(c.id));
    let creados = 0;
    for (const c of compras) {
      const docs = vista.documentos.filter((d) => c.documentoIds.includes(d.id) && d.tipoDte !== 61 && d.saldo > 0);
      const yaProgramados = new Set(vista.pagos.filter((p) => p.estado === "programado").flatMap((p) => p.aplicaciones.map((a) => a.documentoId)));
      for (const d of docs.filter((x) => !yaProgramados.has(x.id))) {
        const numero = await siguienteNumero(ctx.empresa.id, "pago", "PAG");
        const { data, error } = await supabaseAdmin
          .from("fin_pagos")
          .insert({ empresa_id: ctx.empresa.id, numero, proveedor_id: d.contraparteId, fecha_programada: fecha, monto: d.saldo, cuenta_id: uuid(cuentaId), creado_por: ctx.usuario.correo })
          .select("id")
          .single();
        revienta("programar el pago", error);
        await supabaseAdmin.from("fin_pago_aplicaciones").insert({ pago_id: data!.id, documento_id: d.id, monto: d.saldo });
        await auditar(ctx, "fin_pagos", data!.id, "programar", `Pago ${numero} de la factura ${d.folio} para el ${fecha}`);
        creados++;
      }
    }
    if (creados === 0) return { ok: false, error: "No hay facturas con saldo por programar en la selección." };
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Marca un pago como hecho (fecha real). Si viene de un cargo del banco, lo concilia. */
export async function registrarPagoAction(pagoId: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_pagador", { accion: "registrar el pago" });
    const p = await exigirDeEmpresa("fin_pagos", pagoId, ctx.empresa.id);
    if (p.estado !== "programado") return { ok: false, error: "Ese pago ya no está programado." };
    // Si su factura ya se pagó por otro lado, marcarlo la pagaría dos veces.
    const vistaAntes = await cargarVista();
    const deEste = vistaAntes.pagos.find((x) => x.id === pagoId);
    if (deEste && deEste.aplicaciones.length > 0 && deEste.aplicaciones.every((a) => (vistaAntes.documentos.find((d) => d.id === a.documentoId)?.saldo ?? 0) <= 0))
      return { ok: false, error: `La factura de ${p.numero} ya está pagada con otro pago: anula ${p.numero}.` };
    const fecha = fechaValida(fd.get("fecha")) ?? ctx.hoy;
    const cerrado = await periodoCerrado(ctx.empresa.id, fecha);
    if (cerrado) return { ok: false, error: cerrado };
    const movimientoId = uuid(fd.get("movimientoId"));
    const { error } = await supabaseAdmin
      .from("fin_pagos")
      .update({ estado: "pagado", fecha_pago: fecha, cuenta_id: uuid(fd.get("cuentaId")) ?? p.cuenta_id, movimiento_id: movimientoId, referencia: texto(fd, "referencia", 200) ?? p.referencia })
      .eq("id", pagoId);
    revienta("registrar el pago", error);
    if (movimientoId) {
      const vista = await cargarVista();
      await conciliarConMovimiento(ctx.empresa.id, movimientoId, "pago", pagoId, Number(p.monto), vista.categorias.find((c) => c.nombre === "Pago proveedor")?.id ?? null);
    }
    await auditar(ctx, "fin_pagos", pagoId, "pagar", `Pago ${p.numero} hecho el ${fecha}`);
    await registrarEvento(ctx, "pago_registrado", "pago", pagoId, { monto: Number(p.monto) });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Pagar de una vez el saldo de las facturas de una compra (sin programar antes). */
export async function pagarCompraAction(compraId: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_pagador", { accion: "pagar" });
    const vista = await cargarVista();
    const c = vista.compras.find((x) => x.id === compraId);
    if (!c) return { ok: false, error: "Esa compra no existe." };
    const docs = vista.documentos.filter((d) => c.documentoIds.includes(d.id) && d.tipoDte !== 61 && d.saldo > 0);
    if (docs.length === 0) return { ok: false, error: "No hay saldo por pagar." };
    const fecha = fechaValida(fd.get("fecha")) ?? ctx.hoy;
    const cerrado = await periodoCerrado(ctx.empresa.id, fecha);
    if (cerrado) return { ok: false, error: cerrado };
    for (const d of docs) {
      // Si la factura ya tenía un pago programado, ese es el que se paga (si no, quedarían dos pagos para la misma factura).
      const programado = vista.pagos.find((x) => x.estado === "programado" && x.aplicaciones.length === 1 && x.aplicaciones[0].documentoId === d.id);
      if (programado) {
        const { error } = await supabaseAdmin
          .from("fin_pagos")
          .update({
            estado: "pagado", fecha_pago: fecha, monto: d.saldo, cuenta_id: uuid(fd.get("cuentaId")) ?? programado.cuentaId,
            medio: String(fd.get("medio") ?? "transferencia").slice(0, 30), referencia: texto(fd, "referencia", 200) ?? programado.referencia,
          })
          .eq("id", programado.id)
          .eq("empresa_id", ctx.empresa.id);
        revienta("registrar el pago", error);
        await supabaseAdmin.from("fin_pago_aplicaciones").update({ monto: d.saldo }).eq("pago_id", programado.id).eq("documento_id", d.id);
        await auditar(ctx, "fin_pagos", programado.id, "pagar", `Pago ${programado.numero} de la factura ${d.folio} hecho el ${fecha}`);
        continue;
      }
      const numero = await siguienteNumero(ctx.empresa.id, "pago", "PAG");
      const { data, error } = await supabaseAdmin
        .from("fin_pagos")
        .insert({
          empresa_id: ctx.empresa.id, numero, proveedor_id: d.contraparteId, fecha_programada: fecha, fecha_pago: fecha, monto: d.saldo, estado: "pagado",
          cuenta_id: uuid(fd.get("cuentaId")), medio: String(fd.get("medio") ?? "transferencia").slice(0, 30), referencia: texto(fd, "referencia", 200), creado_por: ctx.usuario.correo,
        })
        .select("id")
        .single();
      revienta("registrar el pago", error);
      await supabaseAdmin.from("fin_pago_aplicaciones").insert({ pago_id: data!.id, documento_id: d.id, monto: d.saldo });
      await auditar(ctx, "fin_pagos", data!.id, "pagar", `Pago ${numero} de la factura ${d.folio}`);
    }
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularPagoAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_pagador", { accion: "anular el pago" });
    if (!motivo.trim()) return { ok: false, error: "Escribe el motivo." };
    const p = await exigirDeEmpresa("fin_pagos", id, ctx.empresa.id);
    const cerrado = await periodoCerrado(ctx.empresa.id, p.estado === "pagado" ? String(p.fecha_pago ?? "") : null);
    if (cerrado) return { ok: false, error: cerrado };
    const { error } = await supabaseAdmin.from("fin_pagos").update({ estado: "anulado" }).eq("id", id);
    revienta("anular el pago", error);
    await supabaseAdmin.from("fin_conciliaciones").delete().eq("entidad_tipo", "pago").eq("entidad_id", id);
    await auditar(ctx, "fin_pagos", id, "anular", `Pago ${p.numero} anulado`, { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Eliminar una solicitud (solo el administrador global) ---------------------------

/**
 * Elimina una solicitud de compra, por ejemplo una de prueba, junto con sus facturas cargadas a mano y
 * sus pagos aún programados. No se borra nada real: si la factura vino del SII, si hay un pago ya hecho o
 * ligado al banco, o si el período está cerrado, se rechaza. Queda en la auditoría con una copia.
 */
export async function eliminarCompraAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    // Solo el rol «admin» del Core, y se exige acá: ocultar el botón no protege nada.
    if (ctx.usuario.rol !== "admin") return { ok: false, error: "Solo el administrador del sistema puede eliminar." };
    const razon = motivo.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!razon) return { ok: false, error: "Escribe el motivo de la eliminación." };
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);

    const { data: lig, error: e1 } = await supabaseAdmin.from("fin_documento_compras").select("documento_id").eq("compra_id", id);
    revienta("revisar las facturas de la compra", e1);
    const docIds = (lig ?? []).map((x) => x.documento_id as string);

    // Facturas que solo pertenecen a esta compra (si sirven a otra, solo se desligan).
    let docsPropios: { id: string; folio: string; origen: string; fecha_emision: string }[] = [];
    if (docIds.length > 0) {
      const [{ data: docs, error: e2 }, { data: otras, error: e3 }] = await Promise.all([
        supabaseAdmin.from("fin_documentos").select("id, folio, origen, fecha_emision").eq("empresa_id", ctx.empresa.id).in("id", docIds),
        supabaseAdmin.from("fin_documento_compras").select("documento_id").in("documento_id", docIds).neq("compra_id", id),
      ]);
      revienta("leer las facturas", e2);
      revienta("revisar las facturas compartidas", e3);
      const compartidas = new Set((otras ?? []).map((x) => x.documento_id as string));
      docsPropios = ((docs ?? []) as typeof docsPropios).filter((d) => !compartidas.has(d.id));
    }
    const noManual = docsPropios.find((d) => d.origen !== "manual");
    if (noManual) return { ok: false, error: `La factura ${noManual.folio} vino del SII, no se cargó a mano: no se elimina desde aquí.` };
    for (const d of docsPropios) {
      const cerrado = await periodoCerrado(ctx.empresa.id, d.fecha_emision);
      if (cerrado) return { ok: false, error: cerrado };
    }
    const propios = docsPropios.map((d) => d.id);

    let pagoIds: string[] = [];
    if (propios.length > 0) {
      const { data: aplic, error: e4 } = await supabaseAdmin.from("fin_pago_aplicaciones").select("pago_id").in("documento_id", propios);
      revienta("revisar los pagos", e4);
      pagoIds = [...new Set((aplic ?? []).map((x) => x.pago_id as string))];
      if (pagoIds.length > 0) {
        const { data: pagos, error: e5 } = await supabaseAdmin.from("fin_pagos").select("id, numero, estado, movimiento_id").in("id", pagoIds);
        revienta("leer los pagos", e5);
        const real = (pagos ?? []).find((p) => p.estado === "pagado" || p.movimiento_id);
        if (real) return { ok: false, error: `El pago ${real.numero} ya se hizo o está ligado al banco. Anúlalo primero en la pestaña Pagos y vuelve a intentar.` };
      }
      const [{ data: notas, error: e6 }, { data: cobros, error: e7 }, { data: cesiones, error: e8 }] = await Promise.all([
        supabaseAdmin.from("fin_documentos").select("folio").in("documento_referenciado_id", propios).limit(1),
        supabaseAdmin.from("fin_cobro_aplicaciones").select("documento_id").in("documento_id", propios).limit(1),
        supabaseAdmin.from("fin_cesiones").select("documento_id").in("documento_id", propios).limit(1),
      ]);
      revienta("revisar las notas de la factura", e6);
      revienta("revisar los cobros", e7);
      revienta("revisar las cesiones", e8);
      if ((notas ?? []).length > 0 || (cobros ?? []).length > 0 || (cesiones ?? []).length > 0) return { ok: false, error: "Alguna de sus facturas tiene notas, cobros o cesiones asociadas: no se elimina." };
    }

    // Respaldos (cotización del proveedor, PDF de la factura) y comentarios se van con ella.
    const entidades = [id, ...propios];
    const { data: adjuntos } = await supabaseAdmin.from("fin_adjuntos").select("ruta").eq("empresa_id", ctx.empresa.id).in("entidad_id", entidades).in("entidad_tipo", ["compra", "documento"]);
    await borrarArchivos("finanzas", (adjuntos ?? []).map((a) => a.ruta as string));
    await supabaseAdmin.from("fin_adjuntos").delete().eq("empresa_id", ctx.empresa.id).in("entidad_id", entidades).in("entidad_tipo", ["compra", "documento"]);
    await supabaseAdmin.from("fin_actividades").delete().eq("empresa_id", ctx.empresa.id).in("entidad_id", entidades).in("entidad_tipo", ["compra", "documento"]);

    if (pagoIds.length > 0) {
      const { error } = await supabaseAdmin.from("fin_pagos").delete().in("id", pagoIds).eq("empresa_id", ctx.empresa.id);
      revienta("eliminar sus pagos programados", error);
    }
    const { error: e9 } = await supabaseAdmin.from("fin_documento_compras").delete().eq("compra_id", id);
    revienta("desligar sus facturas", e9);
    if (propios.length > 0) {
      const { error } = await supabaseAdmin.from("fin_documentos").delete().in("id", propios).eq("empresa_id", ctx.empresa.id);
      revienta("eliminar sus facturas", error);
    }
    const { error } = await supabaseAdmin.from("fin_compras").delete().eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("eliminar la compra", error);
    await auditar(ctx, "fin_compras", id, "eliminar", `Solicitud ${c.codigo} «${c.descripcion}» eliminada${docsPropios.length ? ` con ${docsPropios.length} factura(s)` : ""}${pagoIds.length ? ` y ${pagoIds.length} pago(s) programado(s)` : ""}`, { antes: { compra: c, facturas: docsPropios, pagos: pagoIds }, motivo: razon });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Solicitud con formato de OC ---------------------------------------------------

interface DatosSolicitud {
  titulo: string;
  proveedorId: string | null;
  atencion: string | null;
  proveedorCorreo: string | null;
  proyectoId: string | null;
  solicitanteTipo: "yo" | "usuario" | "otro";
  solicitanteUsuarioId: string | null;
  solicitanteOtro: string | null;
  moneda: Moneda;
  tipoCambio: number;
  lineas: LineaOc[];
  fechaRequerida: string | null;
  entregaLugar: string | null;
  entregaPlazo: string | null;
  formaPago: string | null;
  condicionPagoDias: number | null;
  observaciones: string | null;
  condiciones: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const corto = (v: unknown, max: number): string | null => {
  const t = String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
  return t || null;
};
const una = (v: unknown, max: number): string | null => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};
const num = (v: unknown, min: number, max: number, defecto = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : defecto;
};

/** Lo que llega del navegador no se cree: se limpia y se acota todo. */
function leerSolicitud(json: string): DatosSolicitud | string {
  let r: any;
  try {
    r = JSON.parse(json);
  } catch {
    return "La solicitud llegó dañada. Vuelve a intentarlo.";
  }
  const titulo = una(r?.titulo, 300);
  if (!titulo) return "Escribe un título breve para la solicitud.";
  const moneda: Moneda = esMoneda(r?.moneda) ? r.moneda : "CLP";
  const tipoSolicitante = ["yo", "usuario", "otro"].includes(r?.solicitanteTipo) ? r.solicitanteTipo : "yo";
  const lineas: LineaOc[] = (Array.isArray(r?.lineas) ? r.lineas : [])
    .slice(0, 200)
    .map((l: any): LineaOc => ({
      productoId: uuid(l?.productoId), descripcion: corto(l?.descripcion, 500) ?? "", cantidad: num(l?.cantidad, 0, 1e9, 1), unidad: una(l?.unidad, 20),
      precioUnitario: num(l?.precioUnitario, 0, 1e12), descuentoPct: num(l?.descuentoPct, 0, 1), exento: Boolean(l?.exento), nota: corto(l?.nota, 1000),
    }))
    .filter((l: LineaOc) => l.descripcion);
  const cond = r?.condicionPagoDias === null || r?.condicionPagoDias === undefined || r?.condicionPagoDias === "" ? null : Math.round(num(r.condicionPagoDias, 0, 365));
  return {
    titulo, proveedorId: uuid(r?.proveedorId), atencion: una(r?.atencion, 120), proveedorCorreo: una(r?.proveedorCorreo, 160), proyectoId: uuid(r?.proyectoId),
    solicitanteTipo: tipoSolicitante, solicitanteUsuarioId: uuid(r?.solicitanteUsuarioId), solicitanteOtro: una(r?.solicitanteOtro, 120),
    moneda, tipoCambio: moneda === "CLP" ? 1 : num(r?.tipoCambio, 0, 1e9), lineas, fechaRequerida: fechaValida(typeof r?.fechaRequerida === "string" ? r.fechaRequerida : null),
    entregaLugar: una(r?.entregaLugar, 300), entregaPlazo: una(r?.entregaPlazo, 120), formaPago: una(r?.formaPago, 200), condicionPagoDias: cond,
    observaciones: corto(r?.observaciones, 2000), condiciones: corto(r?.condiciones, 3000),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Lo que falta para que la solicitud pueda salir a aprobación (guardar borrador no lo exige). */
function faltaParaEnviar(d: Pick<DatosSolicitud, "proveedorId" | "lineas" | "moneda" | "tipoCambio">, total: number): string | null {
  if (!d.proveedorId) return "Elige el proveedor antes de enviar a aprobación.";
  if (d.lineas.length === 0) return "Agrega al menos un ítem con descripción.";
  if (d.lineas.some((l) => !(l.cantidad > 0))) return "Cada ítem necesita una cantidad mayor que cero.";
  if (!(total > 0)) return "El total de la solicitud no puede ser cero: revisa los precios.";
  if (d.moneda !== "CLP" && !(d.tipoCambio > 0)) return `Indica el valor de ${d.moneda} en pesos.`;
  return null;
}

const esCreadorOAdmin = (ctx: { usuario: { rol: string; correo: string } }, c: { creado_por?: string | null; solicitante?: string | null }) => {
  const yo = ctx.usuario.correo.toLowerCase();
  return ctx.usuario.rol === "admin" || String(c.creado_por ?? "").toLowerCase() === yo || String(c.solicitante ?? "").toLowerCase() === yo;
};

/**
 * Crea o edita una solicitud con formato de OC (un borrador). Con `enviar`, además la manda a aprobación.
 * Solo se edita mientras es borrador o está devuelta, y solo por su autor, el solicitante o el administrador.
 */
export async function guardarSolicitudAction(id: string | null, json: string, enviar: boolean): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const d = leerSolicitud(json);
    if (typeof d === "string") return { ok: false, error: d };
    const tasa = await tasaIvaDe(ctx.empresa.id);
    const t = totalesOc(d.lineas, tasa, d.moneda);
    if (enviar) {
      const falta = faltaParaEnviar(d, t.total);
      if (falta) return { ok: false, error: falta };
    }

    let previa: Record<string, unknown> | null = null;
    if (id) {
      previa = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
      if (!previa.formato_oc) return { ok: false, error: "Esta compra es anterior al formato de OC: se edita desde su tabla." };
      if (previa.estado_override) return { ok: false, error: "Está anulada: un administrador debe reactivarla antes de editarla." };
      if (previa.enviada_aprobacion_en) return { ok: false, error: "Ya está en aprobación: no se puede editar. Si hace falta, el aprobador la devuelve." };
      if (!esCreadorOAdmin(ctx, previa)) return { ok: false, error: "Solo su autor puede editar esta solicitud." };
    }

    // Quién solicita: uno mismo, otra persona del Core, o alguien externo (solo el nombre).
    let solicitante: string | null = ctx.usuario.correo;
    let solicitanteNombre = ctx.usuario.nombre?.trim() || ctx.usuario.correo.split("@")[0];
    if (d.solicitanteTipo === "usuario") {
      const persona = (await candidatosDeFlujo()).find((p) => p.id === d.solicitanteUsuarioId);
      if (!persona) return { ok: false, error: "Elige quién solicita la compra." };
      solicitante = persona.correo;
      solicitanteNombre = persona.nombre;
    } else if (d.solicitanteTipo === "otro") {
      if (!d.solicitanteOtro) return { ok: false, error: "Escribe el nombre de quien solicita." };
      solicitante = null;
      solicitanteNombre = d.solicitanteOtro;
    }

    const proyectoId = d.proyectoId ?? (await proyectoGeneral(ctx.empresa.id));
    if (d.proyectoId) await exigirDeEmpresa("fin_proyectos", d.proyectoId, ctx.empresa.id);
    if (d.proveedorId) {
      const { data: prov, error: ep } = await supabaseAdmin.from("finanzas_contactos").select("id").eq("id", d.proveedorId).maybeSingle();
      revienta("leer el proveedor", ep);
      if (!prov) return { ok: false, error: "Ese proveedor no existe." };
    }

    // El flujo de caja lee `neto_cotizado` como NETO EN PESOS y le suma el IVA: se deja de modo que neto × (1 + IVA) = total en pesos.
    const totalPesos = aPesos(t.total, d.moneda, d.tipoCambio);
    const fila = {
      proyecto_id: proyectoId, proveedor_id: d.proveedorId, descripcion: d.titulo, neto_cotizado: Math.round(totalPesos / (1 + tasa)), fecha_requerida: d.fechaRequerida,
      solicitante, solicitante_tipo: d.solicitanteTipo, solicitante_nombre: solicitanteNombre, moneda: d.moneda, tipo_cambio: d.moneda === "CLP" ? 1 : d.tipoCambio,
      neto_moneda: t.neto + t.exento, atencion: d.atencion, proveedor_correo: d.proveedorCorreo, entrega_lugar: d.entregaLugar, entrega_plazo: d.entregaPlazo,
      forma_pago: d.formaPago, condicion_pago_dias: d.condicionPagoDias, observaciones_oc: d.observaciones, condiciones_oc: d.condiciones, actualizado_en: ahora(),
      ...(enviar ? { enviada_aprobacion_en: ahora(), enviada_aprobacion_por: ctx.usuario.correo, devuelta_motivo: null, devuelta_por: null, devuelta_en: null } : {}),
    };

    let compraId = id;
    let codigo = String(previa?.codigo ?? "");
    if (!compraId) {
      codigo = await siguienteNumero(ctx.empresa.id, "compra", "C", 4);
      const { data, error } = await supabaseAdmin.from("fin_compras").insert({ ...fila, empresa_id: ctx.empresa.id, codigo, formato_oc: true, creado_por: ctx.usuario.correo }).select("id").single();
      revienta("crear la solicitud", error);
      compraId = data!.id as string;
    } else {
      const { error } = await supabaseAdmin.from("fin_compras").update(fila).eq("id", compraId).eq("empresa_id", ctx.empresa.id);
      revienta("guardar la solicitud", error);
    }

    const { error: ed } = await supabaseAdmin.from("fin_compra_lineas").delete().eq("compra_id", compraId);
    revienta("actualizar los ítems", ed);
    if (d.lineas.length > 0) {
      const { error: ei } = await supabaseAdmin.from("fin_compra_lineas").insert(
        d.lineas.map((l, i) => ({
          compra_id: compraId, orden: i, producto_id: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, precio_unitario: l.precioUnitario,
          descuento_pct: l.descuentoPct, exento: l.exento, nota: l.nota, neto_linea: netoLineaOc(l, d.moneda),
        })),
      );
      revienta("guardar los ítems", ei);
    }

    await auditar(ctx, "fin_compras", compraId, id ? "editar" : "crear", id ? `Solicitud ${codigo} editada` : `Solicitud ${codigo} creada: «${d.titulo}»`);
    if (enviar) {
      await auditar(ctx, "fin_compras", compraId, "enviar_aprobacion", `Solicitud ${codigo} enviada a aprobación`);
      await registrarEvento(ctx, "compra_solicitada", "compra", compraId, { total: totalPesos });
    }
    refrescar();
    return { ok: true, id: compraId };
  } catch (e) {
    return fallo(e);
  }
}

/** Manda a aprobación un borrador (o una solicitud devuelta, ya corregida). */
export async function enviarAAprobacionAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    if (!c.formato_oc) return { ok: false, error: "Esta compra es anterior al formato de OC." };
    if (c.estado_override) return { ok: false, error: "Está anulada." };
    if (c.enviada_aprobacion_en) return { ok: false, error: "Ya está en aprobación." };
    if (!esCreadorOAdmin(ctx, c)) return { ok: false, error: "Solo su autor puede enviarla a aprobación." };
    const lineas = await lineasDeCompra(id);
    const moneda: Moneda = esMoneda(c.moneda) ? c.moneda : "CLP";
    const total = totalesOc(lineas, await tasaIvaDe(ctx.empresa.id), moneda).total;
    const falta = faltaParaEnviar({ proveedorId: (c.proveedor_id as string | null) ?? null, lineas, moneda, tipoCambio: Number(c.tipo_cambio) || 0 }, total);
    if (falta) return { ok: false, error: falta };
    const { error } = await supabaseAdmin
      .from("fin_compras")
      .update({ enviada_aprobacion_en: ahora(), enviada_aprobacion_por: ctx.usuario.correo, devuelta_motivo: null, devuelta_por: null, devuelta_en: null, actualizado_en: ahora() })
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id);
    revienta("enviar a aprobación", error);
    await auditar(ctx, "fin_compras", id, "enviar_aprobacion", `Solicitud ${c.codigo} enviada a aprobación`);
    await registrarEvento(ctx, "compra_solicitada", "compra", id, {});
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * El aprobador (o quien visa) devuelve la solicitud a quien la creó, con el motivo, para que la corrija y la reenvíe
 * (o la anule). Vuelve a ser editable y pierde la aprobación y el visado que tuviera; el N° de OC, si ya se asignó, se conserva.
 */
export async function devolverCompraAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const razon = motivo.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!razon) return { ok: false, error: "Escribe el motivo de la devolución." };
    await exigirAlgunRol(ctx, ["compras_aprobador", "compras_visador"], "devolver");
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    if (!c.formato_oc) return { ok: false, error: "Esta compra es anterior al formato de OC: se rechaza." };
    if (c.estado_override) return { ok: false, error: "Está anulada." };
    if (!c.enviada_aprobacion_en) return { ok: false, error: "Todavía no está en aprobación." };
    if (c.oc_enviada_en || c.oc_enviada_fecha) return { ok: false, error: "La OC ya se envió al proveedor: no se puede devolver." };
    const { error } = await supabaseAdmin
      .from("fin_compras")
      .update({
        enviada_aprobacion_en: null, enviada_aprobacion_por: null, aprobado_por: null, fecha_aprobacion: null, visado_por: null, fecha_visado: null,
        devuelta_motivo: razon, devuelta_por: ctx.usuario.nombre?.trim() || ctx.usuario.correo, devuelta_en: ahora(), actualizado_en: ahora(),
      })
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id);
    revienta("devolver la solicitud", error);
    await auditar(ctx, "fin_compras", id, "devolver", `Solicitud ${c.codigo} devuelta a quien la creó`, { motivo: razon });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Anular no borra: la solicitud queda en el registro y un administrador puede reactivarla. */
export async function anularCompraAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const razon = motivo.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!razon) return { ok: false, error: "Escribe el motivo." };
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    if (c.estado_override) return { ok: false, error: "Ya está anulada." };
    // Quien puede: el administrador, su autor o solicitante, o quien tenga asignado aprobar o visar.
    const mapa = await asignacionesDeEmpresa(ctx.empresa.id);
    const delFlujo = (["compras_aprobador", "compras_visador"] as const).some((r) => (mapa.get(r) ?? []).includes(ctx.usuario.id));
    if (!esCreadorOAdmin(ctx, c) && !delFlujo) return { ok: false, error: "Solo su autor, quien aprueba o visa, o un administrador puede anularla." };
    const { data: facturas, error: ef } = await supabaseAdmin.from("fin_documento_compras").select("documento_id").eq("compra_id", id).limit(1);
    revienta("revisar sus facturas", ef);
    if ((facturas ?? []).length > 0) return { ok: false, error: "Ya tiene facturas registradas: no se puede anular." };
    const { error } = await supabaseAdmin
      .from("fin_compras")
      .update({ estado_override: "anulada", motivo: razon, anulada_por: ctx.usuario.nombre?.trim() || ctx.usuario.correo, anulada_en: ahora(), actualizado_en: ahora() })
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id);
    revienta("anular la solicitud", error);
    await auditar(ctx, "fin_compras", id, "anular", `Solicitud ${c.codigo} anulada`, { motivo: razon });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Solo el administrador global: devuelve a la vida una solicitud anulada (queda en el historial). */
export async function reactivarCompraAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (ctx.usuario.rol !== "admin") return { ok: false, error: "Solo el administrador del sistema puede reactivarla." };
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    if (!c.estado_override) return { ok: false, error: "No está anulada." };
    const { error } = await supabaseAdmin
      .from("fin_compras")
      .update({ estado_override: null, motivo: null, anulada_por: null, anulada_en: null, actualizado_en: ahora() })
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id);
    revienta("reactivar la solicitud", error);
    await auditar(ctx, "fin_compras", id, "reactivar", `Solicitud ${c.codigo} reactivada`, { motivo: c.motivo as string | null });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** El proveedor acepta o rechaza la OC. (La pantalla completa de recepción llega en la siguiente entrega.) */
export async function responderOcAction(id: string, respuesta: "aceptada" | "rechazada", observacion: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_recepcion", { accion: "registrar la respuesta del proveedor" });
    if (respuesta !== "aceptada" && respuesta !== "rechazada") return { ok: false, error: "Elige aceptada o rechazada." };
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    if (!c.formato_oc) return { ok: false, error: "Esta compra es anterior al formato de OC." };
    if (!c.oc_enviada_en && !c.oc_enviada_fecha) return { ok: false, error: "La OC todavía no se marcó como enviada al proveedor." };
    const { error } = await supabaseAdmin
      .from("fin_compras")
      .update({ oc_respuesta: respuesta, oc_respuesta_fecha: ctx.hoy, oc_respuesta_por: ctx.usuario.nombre?.trim() || ctx.usuario.correo, oc_respuesta_obs: una(observacion, 500), actualizado_en: ahora() })
      .eq("id", id)
      .eq("empresa_id", ctx.empresa.id);
    revienta("registrar la respuesta", error);
    await auditar(ctx, "fin_compras", id, "respuesta_proveedor", `El proveedor ${respuesta === "aceptada" ? "aceptó" : "rechazó"} la OC ${c.oc_numero ?? c.codigo}`, { motivo: una(observacion, 500) });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
