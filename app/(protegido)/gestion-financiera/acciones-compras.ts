"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  RUTA_FIN,
  auditar,
  cargarVista,
  conciliarConMovimiento,
  contextoFin,
  exigirContacto,
  exigirDeEmpresa,
  fechaValida,
  montoDe,
  periodoCerrado,
  proyectoGeneral,
  registrarEvento,
  revienta,
  saldoActualDocumento,
  siguienteNumero,
} from "@/lib/fin/datos";
import { peso, sumarDias } from "@/lib/fin/reglas";
import { exigirRol, exigirRolOAdminFin } from "@/lib/fin/flujos";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "Ocurrió un error inesperado." };
}
const refrescar = () => revalidatePath(RUTA_FIN, "layout");
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const ahora = () => new Date().toISOString();
const ids = (lista: string[]) => lista.filter((x) => uuid(x)).slice(0, 200);

/** Facturas ligadas a la compra y pagos no anulados de esas facturas (para no rechazar ni editar lo que ya avanzó). */
async function avanceDeCompra(compraId: string): Promise<{ facturas: number; pagos: number }> {
  const { data: docs, error } = await supabaseAdmin.from("fin_documento_compras").select("documento_id").eq("compra_id", compraId);
  revienta("leer las facturas de la compra", error);
  const docIds = (docs ?? []).map((d) => d.documento_id as string);
  if (docIds.length === 0) return { facturas: 0, pagos: 0 };
  const { data: pagos, error: e2 } = await supabaseAdmin.from("fin_pago_aplicaciones").select("pago_id, fin_pagos!inner(estado)").in("documento_id", docIds).neq("fin_pagos.estado", "anulado");
  revienta("leer los pagos de la compra", e2);
  return { facturas: docIds.length, pagos: (pagos ?? []).length };
}

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
    const proveedorId = uuid(fd.get("proveedorId"));
    if (proveedorId) await exigirContacto(proveedorId);
    const codigo = await siguienteNumero(ctx.empresa.id, "compra", "C", 4);
    const prioridad = String(fd.get("prioridad") ?? "normal");
    const { data, error } = await supabaseAdmin
      .from("fin_compras")
      .insert({
        empresa_id: ctx.empresa.id, codigo, proyecto_id: proyectoId, proveedor_id: proveedorId, descripcion, neto_cotizado: neto,
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
    if (antes.estado_override) return { ok: false, error: `La compra ${antes.codigo} está ${antes.estado_override}: no se edita.` };
    const vista = await cargarVista();
    if (vista.compras.find((c) => c.id === id)?.paso === "Pagada") return { ok: false, error: `La compra ${antes.codigo} ya está pagada: no se edita.` };
    // Un campo que no viene (o viene vacío) conserva lo que tenía: no se borra el neto ni el proveedor sin querer.
    const neto = montoDe(fd.get("netoCotizado"));
    if (neto !== null && neto <= 0) return { ok: false, error: "El monto neto debe ser mayor que cero." };
    const motivo = texto(fd, "motivo", 300);
    if (antes.fecha_visado && neto !== null && Number(antes.neto_cotizado) !== neto && !motivo) return { ok: false, error: "Cambiar el monto de una compra visada pide un motivo." };
    const proveedorId = uuid(fd.get("proveedorId"));
    if (proveedorId) await exigirContacto(proveedorId);
    const proyectoId = uuid(fd.get("proyectoId"));
    if (proyectoId) await exigirDeEmpresa("fin_proyectos", proyectoId, ctx.empresa.id);
    const fila = {
      descripcion: texto(fd, "descripcion", 300) ?? antes.descripcion, neto_cotizado: neto ?? antes.neto_cotizado, proveedor_id: proveedorId ?? antes.proveedor_id,
      proyecto_id: proyectoId ?? antes.proyecto_id, fecha_requerida: fd.has("fechaRequerida") ? fechaValida(fd.get("fechaRequerida")) : antes.fecha_requerida,
      comentario: fd.has("comentario") ? texto(fd, "comentario", 1000) : antes.comentario,
      actualizado_en: ahora(),
    };
    const { error } = await supabaseAdmin.from("fin_compras").update(fila).eq("id", id).eq("empresa_id", ctx.empresa.id);
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
    const { data: previas, error: e0 } = await supabaseAdmin.from("fin_compras").select("solicitante").eq("empresa_id", ctx.empresa.id).in("id", xs);
    revienta("leer las compras", e0);
    for (const c of previas ?? []) await exigirRolOAdminFin(ctx, ["compras_aprobador"], { solicitante: c.solicitante, accion: "aprobar" });
    const { data, error } = await supabaseAdmin
      .from("fin_compras")
      .update({ aprobado_por: ctx.usuario.nombre || ctx.usuario.correo, fecha_aprobacion: ctx.hoy, actualizado_en: ahora() })
      .eq("empresa_id", ctx.empresa.id)
      .in("id", xs)
      .is("estado_override", null)
      .is("aprobado_por", null)
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
    for (const c of listas) await exigirRolOAdminFin(ctx, ["compras_visador"], { solicitante: c.solicitante, accion: "visar" });
    for (const c of listas) {
      const oc = c.oc_numero ?? (await siguienteNumero(ctx.empresa.id, "oc", "OC"));
      const { error: e2 } = await supabaseAdmin
        .from("fin_compras")
        .update({ visado_por: ctx.usuario.nombre || ctx.usuario.correo, fecha_visado: ctx.hoy, oc_numero: oc, oc_fecha: c.oc_fecha ?? ctx.hoy, actualizado_en: ahora() })
        .eq("id", c.id)
        .eq("empresa_id", ctx.empresa.id);
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
    await exigirRolOAdminFin(ctx, ["compras_aprobador", "compras_visador"], { accion: "rechazar" });
    const c = await exigirDeEmpresa("fin_compras", id, ctx.empresa.id);
    if (c.estado_override) return { ok: false, error: `La compra ${c.codigo} ya está ${c.estado_override}.` };
    const avance = await avanceDeCompra(id);
    if (avance.facturas > 0 || avance.pagos > 0) return { ok: false, error: `La compra ${c.codigo} ya tiene facturas o pagos: anula primero esos documentos.` };
    const { error } = await supabaseAdmin.from("fin_compras").update({ estado_override: anular ? "anulada" : "rechazada", motivo: motivo.slice(0, 300), actualizado_en: ahora() }).eq("id", id).eq("empresa_id", ctx.empresa.id);
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
    await exigirContacto(proveedorId);
    const neto = montoDe(fd.get("neto")) ?? 0;
    const exento = montoDe(fd.get("exento")) ?? 0;
    const iva = montoDe(fd.get("iva")) ?? (tipo === 34 ? 0 : peso(neto * vista.p.tasaIva));
    const total = montoDe(fd.get("total")) ?? neto + exento + iva;
    if (neto < 0 || exento < 0 || iva < 0 || total <= 0) return { ok: false, error: "Neto, exento e IVA no pueden ser negativos y el total debe ser mayor que cero." };
    const proyectoFactura = uuid(fd.get("proyectoId"));
    if (proyectoFactura) await exigirDeEmpresa("fin_proyectos", proyectoFactura, ctx.empresa.id);
    const prov = vista.contrapartes.find((c) => c.id === proveedorId);
    const condicion = vista.perfiles.get(proveedorId)?.condicionCompraDias ?? prov?.plazoPagoDias ?? vista.p.plazoPagoProveedorDias;

    if (!compraId) {
      const codigo = await siguienteNumero(ctx.empresa.id, "compra", "C", 4);
      const { data, error } = await supabaseAdmin
        .from("fin_compras")
        .insert({
          empresa_id: ctx.empresa.id, codigo, proyecto_id: proyectoFactura ?? (await proyectoGeneral(ctx.empresa.id)), proveedor_id: proveedorId,
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
    const cuenta = uuid(cuentaId);
    if (cuenta) await exigirDeEmpresa("fin_cuentas", cuenta, ctx.empresa.id);
    const compras = vista.compras.filter((c) => ids(compraIds).includes(c.id));
    let creados = 0;
    for (const c of compras) {
      const docs = vista.documentos.filter((d) => c.documentoIds.includes(d.id) && d.tipoDte !== 61 && d.saldo > 0);
      const yaProgramados = new Set(vista.pagos.filter((p) => p.estado === "programado").flatMap((p) => p.aplicaciones.map((a) => a.documentoId)));
      for (const d of docs.filter((x) => !yaProgramados.has(x.id))) {
        // Saldo releído justo antes: la vista pudo quedar vieja (doble clic, otro usuario).
        const { saldo } = await saldoActualDocumento(ctx.empresa.id, d.id);
        if (saldo <= 0) continue;
        const numero = await siguienteNumero(ctx.empresa.id, "pago", "PAG");
        const { data, error } = await supabaseAdmin
          .from("fin_pagos")
          .insert({ empresa_id: ctx.empresa.id, numero, proveedor_id: d.contraparteId, fecha_programada: fecha, monto: saldo, cuenta_id: cuenta, creado_por: ctx.usuario.correo })
          .select("id")
          .single();
        revienta("programar el pago", error);
        const { error: eA } = await supabaseAdmin.from("fin_pago_aplicaciones").insert({ pago_id: data!.id, documento_id: d.id, monto: saldo });
        if (eA) {
          // Sin aplicación el pago quedaría huérfano: se anula y se avisa.
          await supabaseAdmin.from("fin_pagos").update({ estado: "anulado" }).eq("id", data!.id);
          revienta(`aplicar el pago a la factura ${d.folio}`, eA);
        }
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
    for (const a of deEste?.aplicaciones ?? []) {
      const { saldo } = await saldoActualDocumento(ctx.empresa.id, a.documentoId);
      if (a.monto > saldo) return { ok: false, error: `El pago ${p.numero} (${a.monto}) es mayor que el saldo actual de su factura (${Math.max(saldo, 0)}).` };
    }
    const fecha = fechaValida(fd.get("fecha")) ?? ctx.hoy;
    const cerrado = await periodoCerrado(ctx.empresa.id, fecha);
    if (cerrado) return { ok: false, error: cerrado };
    const movimientoId = uuid(fd.get("movimientoId"));
    const cuentaId = uuid(fd.get("cuentaId"));
    if (cuentaId) await exigirDeEmpresa("fin_cuentas", cuentaId, ctx.empresa.id);
    if (movimientoId) await exigirDeEmpresa("fin_movimientos", movimientoId, ctx.empresa.id);
    // Condicional: un segundo clic no lo vuelve a marcar.
    const { data: marcado, error } = await supabaseAdmin
      .from("fin_pagos")
      .update({ estado: "pagado", fecha_pago: fecha, cuenta_id: cuentaId ?? p.cuenta_id, movimiento_id: movimientoId, referencia: texto(fd, "referencia", 200) ?? p.referencia })
      .eq("id", pagoId)
      .eq("empresa_id", ctx.empresa.id)
      .eq("estado", "programado")
      .select("id");
    revienta("registrar el pago", error);
    if (!marcado?.length) return { ok: false, error: "Ese pago ya no está programado." };
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
    const cuentaId = uuid(fd.get("cuentaId"));
    if (cuentaId) await exigirDeEmpresa("fin_cuentas", cuentaId, ctx.empresa.id);
    let pagados = 0;
    for (const d of docs) {
      // Saldo releído en la base justo antes de pagar: la vista pudo quedar vieja (doble clic, otro usuario).
      const { saldo } = await saldoActualDocumento(ctx.empresa.id, d.id);
      if (saldo <= 0) continue;
      // Si la factura ya tenía un pago programado, ese es el que se paga (si no, quedarían dos pagos para la misma factura).
      const programado = vista.pagos.find((x) => x.estado === "programado" && x.aplicaciones.length === 1 && x.aplicaciones[0].documentoId === d.id);
      if (programado) {
        const { data: marcado, error } = await supabaseAdmin
          .from("fin_pagos")
          .update({
            estado: "pagado", fecha_pago: fecha, monto: saldo, cuenta_id: cuentaId ?? programado.cuentaId,
            medio: String(fd.get("medio") ?? "transferencia").slice(0, 30), referencia: texto(fd, "referencia", 200) ?? programado.referencia,
          })
          .eq("id", programado.id)
          .eq("empresa_id", ctx.empresa.id)
          .eq("estado", "programado")
          .select("id");
        revienta("registrar el pago", error);
        if (!marcado?.length) continue; // otro clic ya lo pagó
        const { error: eA } = await supabaseAdmin.from("fin_pago_aplicaciones").update({ monto: saldo }).eq("pago_id", programado.id).eq("documento_id", d.id);
        revienta(`ajustar el pago de la factura ${d.folio}`, eA);
        pagados++;
        await auditar(ctx, "fin_pagos", programado.id, "pagar", `Pago ${programado.numero} de la factura ${d.folio} hecho el ${fecha}`);
        continue;
      }
      const numero = await siguienteNumero(ctx.empresa.id, "pago", "PAG");
      const { data, error } = await supabaseAdmin
        .from("fin_pagos")
        .insert({
          empresa_id: ctx.empresa.id, numero, proveedor_id: d.contraparteId, fecha_programada: fecha, fecha_pago: fecha, monto: saldo, estado: "pagado",
          cuenta_id: cuentaId, medio: String(fd.get("medio") ?? "transferencia").slice(0, 30), referencia: texto(fd, "referencia", 200), creado_por: ctx.usuario.correo,
        })
        .select("id")
        .single();
      revienta("registrar el pago", error);
      const { error: eA } = await supabaseAdmin.from("fin_pago_aplicaciones").insert({ pago_id: data!.id, documento_id: d.id, monto: saldo });
      if (eA) {
        // Sin aplicación el pago quedaría suelto (y la factura seguiría «por pagar»): se anula y se avisa.
        await supabaseAdmin.from("fin_pagos").update({ estado: "anulado" }).eq("id", data!.id);
        revienta(`aplicar el pago a la factura ${d.folio}`, eA);
      }
      await auditar(ctx, "fin_pagos", data!.id, "pagar", `Pago ${numero} de la factura ${d.folio}`);
      pagados++;
    }
    if (pagados === 0) return { ok: false, error: "No hay saldo por pagar (otro pago se registró recién)." };
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
    if (p.estado === "anulado") return { ok: false, error: `El pago ${p.numero} ya está anulado.` };
    const cerrado = await periodoCerrado(ctx.empresa.id, p.estado === "pagado" ? String(p.fecha_pago ?? "") : null);
    if (cerrado) return { ok: false, error: cerrado };
    const { data: anulado, error } = await supabaseAdmin.from("fin_pagos").update({ estado: "anulado" }).eq("id", id).eq("empresa_id", ctx.empresa.id).neq("estado", "anulado").select("id");
    revienta("anular el pago", error);
    if (!anulado?.length) return { ok: false, error: `El pago ${p.numero} ya está anulado.` };
    const { error: eC } = await supabaseAdmin.from("fin_conciliaciones").delete().eq("empresa_id", ctx.empresa.id).eq("entidad_tipo", "pago").eq("entidad_id", id);
    revienta("deshacer la conciliación del pago", eC);
    await auditar(ctx, "fin_pagos", id, "anular", `Pago ${p.numero} anulado`, { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
