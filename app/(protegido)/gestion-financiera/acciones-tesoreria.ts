"use server";

import { revalidatePath } from "next/cache";
import { enlaceTemporal } from "@/lib/archivos/almacen";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  RUTA_FIN,
  auditar,
  cargarVista,
  conciliarConMovimiento,
  contextoFin,
  contextoFinApi,
  contextoLeadsApi,
  entradaContable,
  exigirDeEmpresa,
  fechaValida,
  montoDe,
  periodoCerrado,
  registrarEvento,
  revienta,
  siguienteNumero,
} from "@/lib/fin/datos";
import { finDeMes, huellaMovimiento } from "@/lib/fin/reglas";
import { generarAsientos } from "@/lib/fin/contabilidad";
import { exigirRol } from "@/lib/fin/flujos";

export type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "Ocurrió un error inesperado." };
}
const refrescar = () => revalidatePath(RUTA_FIN, "layout");
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const ahora = () => new Date().toISOString();

// ---------- Movimientos del banco ------------------------------------------------------

export async function crearMovimientoAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const cuentaId = uuid(fd.get("cuentaId"));
    const fecha = fechaValida(fd.get("fecha"));
    const glosa = texto(fd, "glosa", 200);
    const monto = montoDe(fd.get("monto"));
    if (!cuentaId || !fecha || !glosa || monto === null || monto === 0) return { ok: false, error: "Cuenta, fecha, glosa y monto (+ abono / − cargo) son obligatorios." };
    await exigirDeEmpresa("fin_cuentas", cuentaId, ctx.empresa.id);
    const doc = texto(fd, "numeroDocumento", 40);
    const { data, error } = await supabaseAdmin
      .from("fin_movimientos")
      .insert({ empresa_id: ctx.empresa.id, cuenta_id: cuentaId, fecha, glosa, monto, numero_documento: doc, huella: huellaMovimiento(cuentaId, fecha, monto, glosa, doc), creado_por: ctx.usuario.correo })
      .select("id")
      .single();
    if (error?.code === "23505") return { ok: false, error: "Ese movimiento ya está cargado." };
    revienta("crear el movimiento", error);
    await auditar(ctx, "fin_movimientos", data!.id, "crear", `${glosa}: ${monto}`);
    refrescar();
    return { ok: true, id: data!.id };
  } catch (e) {
    return fallo(e);
  }
}

/** Categorizar, ligar a proyecto, asignar a quién preguntar y marcar el respaldo. */
export async function categorizarMovimientoAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "tesoreria_conciliador", { accion: "categorizar el movimiento" });
    const vista = await cargarVista();
    await exigirDeEmpresa("fin_movimientos", id, ctx.empresa.id);
    const categoriaId = uuid(fd.get("categoriaId"));
    const categoria = categoriaId ? vista.categorias.find((c) => c.id === categoriaId) : null;
    if (categoriaId && !categoria) return { ok: false, error: "Categoría inválida." };
    const proyectoId = uuid(fd.get("proyectoId"));
    if (categoria?.requiereProyecto && !proyectoId) return { ok: false, error: `«${categoria.nombre}» pide el proyecto.` };
    const fila = {
      categoria_id: categoriaId, proyecto_id: proyectoId, responsable: texto(fd, "responsable", 120), tiene_respaldo: fd.get("tieneRespaldo") === "on",
      documento_ref: texto(fd, "documentoRef", 120), rendicion_ref: texto(fd, "rendicionRef", 120), comentario: texto(fd, "comentario", 500), actualizado_en: ahora(),
    };
    const { error } = await supabaseAdmin.from("fin_movimientos").update(fila).eq("id", id);
    revienta("guardar el movimiento", error);
    await auditar(ctx, "fin_movimientos", id, "categorizar", `${categoria?.nombre ?? "Sin categoría"}${fila.tiene_respaldo ? " · con respaldo" : ""}${fila.responsable ? ` · preguntar a ${fila.responsable}` : ""}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Aceptar de un clic la categoría que sugieren las reglas (uno o muchos). */
export async function aceptarSugerenciasAction(movimientoIds: string[]): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "tesoreria_conciliador", { accion: "aceptar sugerencias" });
    const vista = await cargarVista();
    const elegidos = vista.movimientos.filter((m) => movimientoIds.includes(m.id) && m.sugerencia && !m.categoriaId);
    for (const m of elegidos) {
      const cat = vista.categorias.find((c) => c.id === m.sugerencia!.categoriaId);
      const { error } = await supabaseAdmin
        .from("fin_movimientos")
        .update({ categoria_id: m.sugerencia!.categoriaId, proyecto_id: m.proyectoId ?? m.sugerencia!.proyectoId, regla_id: m.sugerencia!.reglaId, tiene_respaldo: m.tieneRespaldo || !cat?.requiereProyecto, actualizado_en: ahora() })
        .eq("id", m.id)
        .eq("empresa_id", ctx.empresa.id);
      revienta("aplicar la regla", error);
    }
    // Cuántas veces se aplicó cada regla (para saber cuáles sirven).
    const porRegla = new Map<string, number>();
    for (const m of elegidos) porRegla.set(m.sugerencia!.reglaId, (porRegla.get(m.sugerencia!.reglaId) ?? 0) + 1);
    for (const [reglaId, veces] of porRegla) {
      const { data } = await supabaseAdmin.from("fin_reglas").select("veces_aplicada").eq("id", reglaId).single();
      await supabaseAdmin.from("fin_reglas").update({ veces_aplicada: Number(data?.veces_aplicada ?? 0) + veces }).eq("id", reglaId);
    }
    await auditar(ctx, "fin_movimientos", null, "reglas", `${elegidos.length} movimiento(s) categorizados por regla`);
    refrescar();
    return { ok: true, mensaje: `${elegidos.length} categorizado(s)` };
  } catch (e) {
    return fallo(e);
  }
}

/** «Guardar como regla» desde un movimiento ya categorizado: el próximo mes se asigna solo. */
export async function reglaDesdeMovimientoAction(id: string, patron: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const m = await exigirDeEmpresa("fin_movimientos", id, ctx.empresa.id);
    if (!m.categoria_id) return { ok: false, error: "Primero dale una categoría al movimiento." };
    const p = patron.replace(/\s+/g, " ").trim().slice(0, 80);
    if (p.length < 3) return { ok: false, error: "El texto a reconocer es muy corto." };
    if (!String(m.glosa).toLowerCase().includes(p.toLowerCase())) return { ok: false, error: "Ese texto no aparece en la glosa del movimiento." };
    const { error } = await supabaseAdmin.from("fin_reglas").insert({
      empresa_id: ctx.empresa.id, cuenta_id: m.cuenta_id, patron: p, categoria_id: m.categoria_id, proyecto_id: m.proyecto_id, prioridad: 100, creado_por: ctx.usuario.correo,
    });
    revienta("guardar la regla", error);
    await supabaseAdmin.from("fin_movimientos").update({ regla_id: null }).eq("id", id);
    await auditar(ctx, "fin_reglas", null, "crear", `Regla «${p}» desde el movimiento ${m.glosa}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Ligar un movimiento a un pago programado o a un traspaso entre cuentas propias. */
export async function conciliarMovimientoAction(id: string, tipo: "cobro" | "pago" | "traspaso" | "otro", entidadId: string | null): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "tesoreria_conciliador", { accion: "conciliar el movimiento" });
    const vista = await cargarVista();
    const m = vista.movimientos.find((x) => x.id === id);
    if (!m) return { ok: false, error: "Ese movimiento no existe." };
    if (tipo === "cobro") {
      // Un cobro registrado a mano en Ventas y que después llega en la cartola: se liga, no se duplica.
      const c = vista.cobros.find((x) => x.id === entidadId);
      if (!c || c.estado === "anulado") return { ok: false, error: "Ese cobro no existe." };
      if (c.movimientoId) return { ok: false, error: `El cobro ${c.numero} ya está ligado a otro movimiento del banco.` };
      if (m.monto <= 0) return { ok: false, error: "Un cobro se liga a un abono, no a un cargo." };
      const { error } = await supabaseAdmin.from("fin_cobros").update({ movimiento_id: id, cuenta_id: m.cuentaId }).eq("id", c.id).eq("empresa_id", ctx.empresa.id);
      revienta("ligar el cobro", error);
      await conciliarConMovimiento(ctx.empresa.id, id, "cobro", c.id, Math.abs(m.monto), vista.categorias.find((x) => x.nombre === "Cobro cliente")?.id ?? null);
    } else if (tipo === "pago") {
      const p = vista.pagos.find((x) => x.id === entidadId);
      if (!p) return { ok: false, error: "Ese pago no existe." };
      if (p.movimientoId) return { ok: false, error: `El pago ${p.numero} ya está ligado a otro movimiento del banco.` };
      // Un programado cuya factura ya se pagó por otro lado: marcarlo pagado la pagaría dos veces.
      if (p.estado === "programado" && p.aplicaciones.length > 0 && p.aplicaciones.every((a) => (vista.documentos.find((d) => d.id === a.documentoId)?.saldo ?? 0) <= 0))
        return { ok: false, error: `La factura de ${p.numero} ya está pagada con otro pago: anula ${p.numero} y liga el cargo al pago que sí se hizo.` };
      if (p.estado === "programado") {
        const { error } = await supabaseAdmin.from("fin_pagos").update({ estado: "pagado", fecha_pago: m.fecha, cuenta_id: m.cuentaId, movimiento_id: id }).eq("id", p.id);
        revienta("marcar el pago", error);
      } else {
        // Pago ya registrado como hecho: solo se liga al cargo del banco.
        const { error } = await supabaseAdmin.from("fin_pagos").update({ movimiento_id: id, cuenta_id: m.cuentaId }).eq("id", p.id).eq("empresa_id", ctx.empresa.id);
        revienta("ligar el pago", error);
      }
      await conciliarConMovimiento(ctx.empresa.id, id, "pago", p.id, Math.abs(m.monto), vista.categorias.find((c) => c.nombre === "Pago proveedor")?.id ?? null);
    } else if (tipo === "traspaso") {
      const otro = vista.movimientos.find((x) => x.id === entidadId);
      if (!otro || otro.cuentaId === m.cuentaId || Math.sign(otro.monto) === Math.sign(m.monto)) return { ok: false, error: "Elige el movimiento de la otra cuenta (cargo ↔ abono)." };
      const cat = vista.categorias.find((c) => c.nombre === "Traspaso entre cuentas")?.id ?? null;
      await conciliarConMovimiento(ctx.empresa.id, id, "traspaso", otro.id, Math.abs(m.monto), cat);
      await conciliarConMovimiento(ctx.empresa.id, otro.id, "traspaso", id, Math.abs(otro.monto), cat);
    } else {
      await conciliarConMovimiento(ctx.empresa.id, id, "otro", null, Math.abs(m.monto), null);
    }
    await auditar(ctx, "fin_movimientos", id, "conciliar", `Conciliado con ${tipo}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Factoring -----------------------------------------------------------------

/** Nueva operación: factor, fecha, % anticipo, costo de la liquidación y las facturas cedidas. */
export async function crearOperacionFactoringAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "tesoreria_factoring", { accion: "crear la operación" });
    const vista = await cargarVista();
    const factorId = uuid(fd.get("factorId"));
    const factor = vista.factores.find((f) => f.id === factorId);
    if (!factor) return { ok: false, error: "Elige el factor." };
    const fecha = fechaValida(fd.get("fechaCesion"));
    if (!fecha) return { ok: false, error: "Indica la fecha de cesión." };
    const cerrado = await periodoCerrado(ctx.empresa.id, fecha);
    if (cerrado) return { ok: false, error: cerrado };
    const docIds = fd.getAll("documentoIds").map(String).filter((x) => uuid(x));
    const docs = vista.documentos.filter((d) => docIds.includes(d.id) && d.direccion === "emitido" && d.estado === "vigente" && !d.cedido && d.saldo > 0);
    if (docs.length === 0) return { ok: false, error: "Elige facturas vigentes, no cedidas y con saldo." };
    const pctTexto = String(fd.get("pctAnticipo") ?? "").replace(",", ".").replace("%", "").trim();
    const pct = pctTexto ? (Number(pctTexto) > 1 ? Number(pctTexto) / 100 : Number(pctTexto)) : factor.pctAnticipoDefault;
    const costo = montoDe(fd.get("costoTotal")) ?? 0;
    const numero = texto(fd, "numero", 30) ?? (await siguienteNumero(ctx.empresa.id, "factoring", "FAC-OP", 4));
    const { data, error } = await supabaseAdmin
      .from("fin_operaciones_factoring")
      .insert({
        empresa_id: ctx.empresa.id, numero, factor_id: factor.id, recurso: fd.get("recurso") === "sin" ? "sin" : factor.recursoDefault, fecha_cesion: fecha,
        pct_anticipo: pct, tasa_mora: factor.tasaMoraMensual, costo_total: costo, fecha_anticipo: fechaValida(fd.get("fechaAnticipo")), creado_por: ctx.usuario.correo,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return { ok: false, error: `La operación ${numero} ya existe.` };
    revienta("crear la operación", error);
    const nominalTotal = docs.reduce((s, d) => s + d.saldo, 0) || 1;
    let asignado = 0;
    const filas = docs.map((d, i) => {
      const parte = i === docs.length - 1 ? costo - asignado : Math.round((costo * d.saldo) / nominalTotal);
      asignado += parte;
      return { empresa_id: ctx.empresa.id, operacion_id: data!.id, documento_id: d.id, nominal: d.saldo, costo_asignado: parte };
    });
    const { error: e2 } = await supabaseAdmin.from("fin_cesiones").insert(filas);
    revienta("ceder las facturas", e2);
    const movimientoId = uuid(fd.get("movimientoId"));
    if (movimientoId) await conciliarConMovimiento(ctx.empresa.id, movimientoId, "factoring", data!.id, 0, vista.categorias.find((c) => c.nombre === "Factoring")?.id ?? null);
    await auditar(ctx, "fin_operaciones_factoring", data!.id, "crear", `Operación ${numero} con ${factor.nombre}: ${docs.length} factura(s)`);
    await registrarEvento(ctx, "factoring_cedido", "operacion_factoring", data!.id, { facturas: docs.length });
    refrescar();
    return { ok: true, id: data!.id };
  } catch (e) {
    return fallo(e);
  }
}

const CAMPOS_CESION: Record<string, "fecha" | "monto"> = {
  fecha_pago_cliente: "fecha", factor_confirma_fecha: "fecha", mora_cobrada: "monto", excedente_fecha: "fecha", excedente_monto: "monto",
};

export async function actualizarCesionAction(id: string, campo: string, valor: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "tesoreria_factoring", { accion: "actualizar la cesión" });
    const tipo = CAMPOS_CESION[campo];
    if (!tipo) return { ok: false, error: "Ese campo no se edita así." };
    await exigirDeEmpresa("fin_cesiones", id, ctx.empresa.id);
    const nuevo = tipo === "fecha" ? (/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null) : montoDe(valor);
    const { error } = await supabaseAdmin.from("fin_cesiones").update({ [campo]: nuevo }).eq("id", id);
    revienta("guardar", error);
    await auditar(ctx, "fin_cesiones", id, "editar", `${campo}: ${nuevo ?? "—"}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Contabilidad ---------------------------------------------------------------

/** Contabiliza un mes: guarda los asientos que propone el motor y que no estaban (idempotente). */
export async function contabilizarPeriodoAction(anio: number, mes: number): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const { data: per } = await supabaseAdmin.from("fin_periodos").select("estado").eq("empresa_id", ctx.empresa.id).eq("anio", anio).eq("mes", mes).maybeSingle();
    if (per?.estado === "cerrado") return { ok: false, error: "El período está cerrado." };
    const vista = await cargarVista();
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const propuestos = generarAsientos(entradaContable(vista), desde, finDeMes(desde));
    const { data: existentes } = await supabaseAdmin.from("fin_asientos").select("origen_tipo, origen_id").eq("empresa_id", ctx.empresa.id).neq("estado", "anulado");
    const ya = new Set((existentes ?? []).map((x) => `${x.origen_tipo}|${x.origen_id}`));
    let nuevos = 0;
    for (const a of propuestos.filter((x) => !ya.has(`${x.origenTipo}|${x.origenId}`))) {
      const numero = await siguienteNumero(ctx.empresa.id, "asiento", "AS");
      const { data, error } = await supabaseAdmin
        .from("fin_asientos")
        .insert({ empresa_id: ctx.empresa.id, numero, fecha: a.fecha, glosa: a.glosa.slice(0, 300), origen_tipo: a.origenTipo, origen_id: a.origenId, creado_por: ctx.usuario.correo })
        .select("id")
        .single();
      revienta("guardar el asiento", error);
      const { error: e2 } = await supabaseAdmin
        .from("fin_asiento_lineas")
        .insert(a.lineas.map((l) => ({ asiento_id: data!.id, cuenta_codigo: l.cuenta, debe: l.debe, haber: l.haber, proyecto_id: l.proyectoId ?? null, glosa: l.glosa ?? null })));
      revienta("guardar las líneas", e2);
      nuevos++;
    }
    await auditar(ctx, "fin_asientos", null, "contabilizar", `${desde.slice(0, 7)}: ${nuevos} asiento(s) nuevos`);
    refrescar();
    return { ok: true, mensaje: `${nuevos} asiento(s) contabilizado(s)` };
  } catch (e) {
    return fallo(e);
  }
}

export async function cerrarPeriodoAction(anio: number, mes: number, cerrar: boolean, motivo?: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!cerrar && !motivo?.trim()) return { ok: false, error: "Reabrir un período pide un motivo." };
    const { error } = await supabaseAdmin.from("fin_periodos").upsert({
      empresa_id: ctx.empresa.id, anio, mes, estado: cerrar ? "cerrado" : "abierto", cerrado_por: ctx.usuario.correo, cerrado_en: ahora(), motivo: motivo ?? null,
    });
    revienta(cerrar ? "cerrar el período" : "reabrir el período", error);
    await auditar(ctx, "fin_periodos", null, cerrar ? "cerrar" : "reabrir", `${anio}-${String(mes).padStart(2, "0")}`, { motivo: motivo ?? null });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Adjuntos --------------------------------------------------------------------

export async function enlaceAdjuntoAction(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    // Finanzas ve todos sus respaldos; quien solo tiene Leads, únicamente los de cotizaciones.
    const ctxFin = await contextoFinApi();
    const ctx = ctxFin ?? (await contextoLeadsApi());
    if (!ctx) return { ok: false, error: "No autorizado." };
    const a = await exigirDeEmpresa("fin_adjuntos", id, ctx.empresa.id);
    if (!ctxFin && a.entidad_tipo !== "cotizacion") return { ok: false, error: "No autorizado." };
    const url = await enlaceTemporal("finanzas", String(a.ruta), { segundos: 60, descarga: String(a.nombre) });
    if (!url) return { ok: false, error: "No se pudo abrir el archivo." };
    return { ok: true, url };
  } catch (e) {
    const r = fallo(e);
    return { ok: false, error: r.ok ? "" : r.error };
  }
}
