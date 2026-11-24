"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, auditar, cargarVista, contextoFin, fechaValida, revienta, type ContextoFin } from "@/lib/fin/datos";
import { exigirRol } from "@/lib/fin/flujos";
import { esAccionRecibido, type CesionDte } from "@/lib/fin/dte/modelo";
import {
  actualizarEstado, ceder, ligarGuiaAHito, verificarEnvio, configuracionDte, descartarBorrador, emitir, guardarBorrador, leerDocumento, probarConexion, resolverEnvioIncierto,
  responderRecibido, sincronizarRecibidos, type OrigenEmision,
} from "@/lib/fin/dte/servicio";
import { comunaOficial, LARGO } from "@/lib/contactos-modelo";
import { normalizarRut, rutEsValido } from "@/lib/contratos/rut";

// Facturación electrónica: Server Actions. Cada una vuelve a exigir el permiso (se pueden llamar sin pasar por la
// pantalla) y deja la lógica en lib/fin/dte/servicio.ts.
//   · Emitir, guardar, descartar y consultar: rol «Factura» (ventas_facturador).
//   · Aceptar o reclamar recibidos: rol «Recibe conforme» (compras_recepcion).
//   · Ceder: rol «Maneja el factoring» (tesoreria_factoring).
//   · Configuración: solo el administrador del Core.

export type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string };

const RUTA_DTE = "/finanzas/facturacion";
const fallo = (e: unknown): Resultado => ({ ok: false, error: e instanceof Error ? e.message.replace(/^\[[^\]]+\]\s*/, "") : "Ocurrió un error inesperado." });
const refrescar = () => {
  revalidatePath(RUTA_DTE, "layout");
  revalidatePath("/finanzas/ventas", "layout");
  revalidatePath("/finanzas/compras", "layout");
  revalidatePath(RUTA_FIN, "layout");
};
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;

function leerOrigen(origenJson: string | null): OrigenEmision {
  if (!origenJson) return {};
  try {
    const o = JSON.parse(origenJson) as OrigenEmision;
    return {
      hitoIds: Array.isArray(o.hitoIds) ? o.hitoIds.filter((x) => uuid(x)).slice(0, 60) : [],
      documentoReferenciadoId: uuid(o.documentoReferenciadoId) ?? null,
    };
  } catch {
    return {};
  }
}

async function guardarComun(ctx: ContextoFin, id: string | null, json: string, clienteId: string | null, origenJson: string | null): Promise<string> {
  const doc = leerDocumento(json);
  if (typeof doc === "string") throw new Error(doc);
  const cfg = await configuracionDte(ctx.empresa.id);
  const cid = uuid(clienteId);
  if (cid) {
    // El receptor sale de Contactos: se vuelve a leer para que nadie mande otro RUT con el id de un cliente.
    const { data: c } = await supabaseAdmin.from("finanzas_contactos").select("rut, razon_social").eq("id", cid).maybeSingle();
    if (!c) throw new Error("Ese cliente no existe.");
    if ((c.rut ?? "") !== doc.receptor.rut) throw new Error("El RUT del receptor no calza con el contacto elegido: vuelve a elegirlo.");
  }
  return guardarBorrador(ctx, id, doc, cid, leerOrigen(origenJson), cfg.ambiente, cfg.tasaIva);
}

/** Guarda un borrador (nuevo si id es null). No sale nada al SII. */
export async function guardarBorradorDteAction(id: string | null, origenJson: string | null, json: string, clienteId: string | null): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "preparar documentos tributarios" });
    const nuevoId = await guardarComun(ctx, uuid(id), json, clienteId, origenJson);
    refrescar();
    return { ok: true, id: nuevoId, mensaje: "Borrador guardado. No se ha enviado nada al SII." };
  } catch (e) {
    return fallo(e);
  }
}

/** Guarda y emite en un paso (el botón «Emitir» del editor). */
export async function emitirDteAction(id: string | null, origenJson: string | null, json: string, clienteId: string | null): Promise<Resultado> {
  let emisionId: string | null = null;
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "emitir documentos tributarios" });
    emisionId = await guardarComun(ctx, uuid(id), json, clienteId, origenJson);
    const em = await emitir(ctx, emisionId);
    refrescar();
    return { ok: true, id: em.id, mensaje: em.error ? em.error : `Emitido con folio ${em.folio}.` };
  } catch (e) {
    refrescar();
    // Si alcanzó a guardarse, se abre su ficha (ahí se ve el error y se corrige, o se verifica un envío en duda).
    // Quedarse en «nuevo» haría que otro clic creara un segundo documento: con un envío en duda, eso podría duplicarlo.
    const r = fallo(e);
    return emisionId && !r.ok ? { ok: true, id: emisionId, mensaje: `No se emitió: ${r.error}` } : r;
  }
}

/** Reintenta o emite un borrador ya guardado (desde su ficha). */
export async function emitirBorradorAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "emitir documentos tributarios" });
    const em = await emitir(ctx, id);
    refrescar();
    return { ok: true, id: em.id, mensaje: em.error ?? `Emitido con folio ${em.folio}.` };
  } catch (e) {
    refrescar();
    return fallo(e);
  }
}

export async function descartarBorradorAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "descartar borradores" });
    if (!motivo.trim()) return { ok: false, error: "Escribe el motivo." };
    await descartarBorrador(ctx, id, motivo);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Un envío que quedó en duda: «sí salió con este folio» o «no salió» (folio vacío). */
export async function resolverEnvioAction(id: string, folio: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "resolver envíos" });
    const f = folio.replace(/\D/g, "").slice(0, 12) || null;
    await resolverEnvioIncierto(ctx, id, f);
    refrescar();
    return { ok: true, mensaje: f ? `Registrado con folio ${f}.` : "Queda para reintentar." };
  } catch (e) {
    return fallo(e);
  }
}

/** Liga una guía emitida suelta al hito de la venta o el arriendo que despachó. */
export async function ligarGuiaAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "ligar guías a hitos" });
    const emisionId = uuid(fd.get("emisionId"));
    const hitoId = uuid(fd.get("hitoId"));
    if (!emisionId || !hitoId) return { ok: false, error: "Elige el hito." };
    await ligarGuiaAHito(ctx, emisionId, hitoId);
    refrescar();
    return { ok: true, mensaje: "Guía ligada al hito: su factura la referenciará." };
  } catch (e) {
    return fallo(e);
  }
}

/** Busca en SimpleFactura si un envío en duda salió. Si encuentra exactamente uno, lo registra con ese folio. */
export async function verificarEnvioAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "resolver envíos" });
    const folios = await verificarEnvio(ctx, id);
    if (folios.length === 1) {
      await resolverEnvioIncierto(ctx, id, folios[0]);
      refrescar();
      return { ok: true, mensaje: `Sí salió: folio ${folios[0]}. Quedó registrado.` };
    }
    if (folios.length === 0) return { ok: true, mensaje: "SimpleFactura no tiene un documento igual (mismo tipo, cliente, fecha y total). Si estás seguro de que no salió, márcalo «No salió» para reintentar." };
    return { ok: true, mensaje: `Hay ${folios.length} documentos iguales (folios ${folios.join(", ")}): revisa en SimpleFactura cuál es y regístralo a mano.` };
  } catch (e) {
    return fallo(e);
  }
}

export async function consultarEstadoDteAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "ventas_facturador", { accion: "consultar el estado en el SII" });
    const est = await actualizarEstado(ctx, id);
    refrescar();
    return { ok: true, mensaje: `Estado en el SII: ${est}.` };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Recibidos ----------

export async function sincronizarRecibidosAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_recepcion", { accion: "traer documentos recibidos" });
    const hasta = fechaValida(fd.get("hasta")) ?? ctx.hoy;
    const desde = fechaValida(fd.get("desde")) ?? new Date(Date.parse(`${hasta}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    if (desde > hasta) return { ok: false, error: "La fecha «desde» es posterior a «hasta»." };
    const r = await sincronizarRecibidos(ctx, desde, hasta);
    refrescar();
    return { ok: true, mensaje: `${r.nuevos} documento(s) nuevo(s), ${r.actualizados} actualizado(s).` };
  } catch (e) {
    return fallo(e);
  }
}

export async function responderRecibidoAction(id: string, accion: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_recepcion", { accion: "aceptar o reclamar en el SII" });
    if (!esAccionRecibido(accion)) return { ok: false, error: "Acción inválida." };
    const esReclamo = ["RCD", "RFP", "RFT"].includes(accion);
    if (esReclamo && !motivo.trim()) return { ok: false, error: "Un reclamo necesita el motivo." };
    await responderRecibido(ctx, id, accion, motivo.trim() || null);
    refrescar();
    return { ok: true, mensaje: esReclamo ? "Reclamo enviado al SII." : "Respuesta enviada al SII." };
  } catch (e) {
    return fallo(e);
  }
}

/** Liga un recibido a una compra (la registra como factura del proveedor) o lo descarta de la bandeja. */
export async function registrarRecibidoAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_recepcion", { accion: "registrar facturas recibidas" });
    const id = uuid(fd.get("recibidoId"));
    if (!id) return { ok: false, error: "Documento inválido." };
    const { data: r } = await supabaseAdmin.from("fin_dte_recibidos").select("*").eq("id", id).eq("empresa_id", ctx.empresa.id).maybeSingle();
    if (!r) return { ok: false, error: "Ese documento no existe o es de otra empresa." };
    if (r.documento_id) return { ok: false, error: "Ya está registrado en Compras." };
    if (r.ambiente !== "produccion") return { ok: false, error: "Los documentos de prueba no se registran en Compras." };
    // Se reutiliza el registro manual de Compras (mismas reglas: compra, OC, vencimiento, periodo cerrado).
    const { registrarFacturaCompraAction } = await import("./acciones-compras");
    let proveedorId: string | null = r.contraparte_id;
    if (!proveedorId) {
      const { data: c } = await supabaseAdmin.from("finanzas_contactos").select("id").eq("rut", r.rut_emisor).maybeSingle();
      proveedorId = c?.id ?? null;
    }
    if (!proveedorId) return { ok: false, error: `El proveedor ${r.razon_social ?? r.rut_emisor} no está en Contactos: créalo primero (RUT ${r.rut_emisor}).` };
    const f = new FormData();
    f.set("folio", r.folio);
    f.set("fechaEmision", r.fecha_emision);
    f.set("tipoDte", String(r.tipo_dte));
    f.set("neto", String(r.neto));
    f.set("exento", String(r.exento));
    f.set("iva", String(r.iva));
    f.set("total", String(r.total));
    f.set("fechaRecepcion", String(r.fecha_recepcion ?? r.fecha_emision).slice(0, 10));
    f.set("proveedorId", proveedorId);
    const compraId = uuid(fd.get("compraId"));
    if (compraId) f.set("compraId", compraId);
    const proyectoId = uuid(fd.get("proyectoId"));
    if (proyectoId) f.set("proyectoId", proyectoId);
    const desc = texto(fd, "descripcion", 300);
    if (desc) f.set("descripcion", desc);
    const res = await registrarFacturaCompraAction(f);
    if (!res.ok) return res;
    await supabaseAdmin.from("fin_dte_recibidos").update({ documento_id: res.id, contraparte_id: proveedorId }).eq("id", id);
    await supabaseAdmin.from("fin_documentos").update({ origen: "api_dte", acuse: r.accion, acuse_en: r.accion_en }).eq("id", res.id!);
    refrescar();
    return { ok: true, id: res.id, mensaje: compraId ? "Registrada y ligada a la compra." : "Registrada como factura sin OC: regularízala en Compras." };
  } catch (e) {
    return fallo(e);
  }
}

export async function descartarRecibidoAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "compras_recepcion", { accion: "ordenar la bandeja de recibidos" });
    const { error } = await supabaseAdmin.from("fin_dte_recibidos").update({ descartado: true, accion_motivo: motivo.slice(0, 300) || null }).eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("descartar", error);
    await auditar(ctx, "fin_dte_recibidos", id, "descartar", null, { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Cesión ----------

/**
 * Cede electrónicamente una factura al factor elegido. SimpleFactura cede el TOTAL; el factor se registra solo en
 * SimpleFactura si falta, y la persona autorizada sale de Configuración.
 */
export async function cederFacturaAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    await exigirRol(ctx, "tesoreria_factoring", { accion: "ceder facturas" });
    const cfg = await configuracionDte(ctx.empresa.id);
    if (!cfg.personaAutorizada) return { ok: false, error: "Falta la persona autorizada a ceder (RUT, nombre y correo): el administrador la configura en Facturación › Configuración." };
    const documentoId = uuid(fd.get("documentoId"));
    const emisionId = uuid(fd.get("emisionId"));
    const factorId = uuid(fd.get("factorId"));
    let folio = "";
    let total = 0;
    let venc: string | null = null;
    let deudorId: string | null = null;
    if (documentoId) {
      const v = await cargarVista();
      const d = v.documentos.find((x) => x.id === documentoId);
      if (!d || d.direccion !== "emitido" || d.tipoDte !== 33) return { ok: false, error: "Elige una factura electrónica (33) emitida." };
      if (d.estado !== "vigente") return { ok: false, error: "La factura está anulada." };
      if (d.cedido) return { ok: false, error: "La factura ya está cedida en una operación de factoring." };
      folio = d.folio;
      total = d.total;
      venc = d.fechaVencimiento;
      deudorId = d.contraparteId;
    } else if (emisionId) {
      const { data: em } = await supabaseAdmin.from("fin_dte_emisiones").select("*").eq("id", emisionId).eq("empresa_id", ctx.empresa.id).eq("estado", "emitido").maybeSingle();
      if (!em || em.tipo_dte !== 33) return { ok: false, error: "Elige una factura electrónica (33) emitida." };
      folio = em.folio;
      total = Number(em.total);
      venc = em.documento?.fechaVencimiento ?? null;
      deudorId = em.contraparte_id;
    } else return { ok: false, error: "Elige la factura." };

    let factor: { rut: string | null; nombre: string; direccion: string | null; correo: string | null } | null = null;
    if (factorId) {
      const { data: f } = await supabaseAdmin.from("fin_factores").select("nombre, rut, direccion, correo").eq("id", factorId).eq("empresa_id", ctx.empresa.id).maybeSingle();
      if (!f) return { ok: false, error: "Ese factor no existe." };
      factor = f;
    }
    // Correo del deudor: el que se escriba, si no el de cobranza del perfil, el DTE o el general del cliente.
    let correoDeudor = texto(fd, "correoDeudor", 80);
    if (!correoDeudor && deudorId) {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabaseAdmin.from("finanzas_contactos").select("correo_dte, correo").eq("id", deudorId).maybeSingle(),
        supabaseAdmin.from("fin_perfiles").select("correo_cobranza").eq("empresa_id", ctx.empresa.id).eq("contacto_id", deudorId).maybeSingle(),
      ]);
      correoDeudor = p?.correo_cobranza ?? c?.correo_dte ?? c?.correo ?? null;
    }
    const rutCes = normalizarRut(texto(fd, "cesionarioRut", 12) ?? factor?.rut ?? "");
    const cesion: CesionDte = {
      tipoDte: 33,
      folio,
      montoCesion: total,
      cesionarioRut: rutCes,
      cesionarioRazonSocial: texto(fd, "cesionarioNombre", 100) ?? factor?.nombre ?? "",
      cesionarioDireccion: texto(fd, "cesionarioDireccion", 70) ?? factor?.direccion ?? "",
      cesionarioCorreo: texto(fd, "cesionarioCorreo", 80) ?? factor?.correo ?? "",
      personaAutorizada: cfg.personaAutorizada,
      correoDeudor: correoDeudor ?? "",
      otrasCondiciones: texto(fd, "otrasCondiciones", 200),
    };
    // Si el factor no tenía sus datos del AEC, quedan guardados para la próxima.
    if (factorId && factor && (!factor.rut || !factor.direccion || !factor.correo) && rutEsValido(rutCes)) {
      await supabaseAdmin.from("fin_factores").update({ rut: factor.rut ?? rutCes, direccion: factor.direccion ?? cesion.cesionarioDireccion, correo: factor.correo ?? cesion.cesionarioCorreo }).eq("id", factorId);
    }
    let cesionFilaId: string | null = null;
    if (documentoId) {
      const { data: fila } = await supabaseAdmin.from("fin_cesiones").select("id").eq("documento_id", documentoId).maybeSingle();
      cesionFilaId = fila?.id ?? null;
    }
    const r = await ceder(ctx, { documentoId, emisionId, factorId, cesion, total, vencimiento: venc, cesionFilaId });
    refrescar();
    return { ok: true, id: r.id, mensaje: `Cesión de la factura ${folio} enviada al SII a nombre de ${cesion.cesionarioRazonSocial}.${cfg.ambiente === "produccion" && !cesionFilaId ? " Registra ahora la operación en Tesorería › Factoring (anticipo y costo)." : ""}` };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Configuración (solo admin del Core) ----------

export async function guardarConfigDteAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (ctx.usuario.rol !== "admin") return { ok: false, error: "Solo el administrador del Core cambia la configuración de facturación." };
    const comuna = texto(fd, "comuna", LARGO.comuna);
    if (comuna && !comunaOficial(comuna)) return { ok: false, error: `«${comuna}» no es una comuna de Chile.` };
    const acteco = String(fd.get("acteco") ?? "").replace(/\D/g, "");
    if (acteco && acteco.length !== 6) return { ok: false, error: "El código de actividad económica tiene 6 dígitos (ver en el SII)." };
    const rut = texto(fd, "rut", 12);
    if (rut && !rutEsValido(rut)) return { ok: false, error: "El RUT de la empresa no es válido." };
    const giro = texto(fd, "giro", 80);
    const { error } = await supabaseAdmin
      .from("empresas")
      .update({
        ...(rut ? { rut: normalizarRut(rut) } : {}),
        ...(giro ? { giro } : {}),
        direccion: texto(fd, "direccion", 70),
        comuna: comunaOficial(comuna) ?? comuna,
        ciudad: texto(fd, "ciudad", 20),
        acteco: acteco ? Number(acteco) : null,
        correo_dte: texto(fd, "correoDte", 80),
      })
      .eq("id", ctx.empresa.id);
    revienta("guardar los datos de la empresa", error);
    const { data: par } = await supabaseAdmin.from("fin_parametros").select("flags").eq("empresa_id", ctx.empresa.id).maybeSingle();
    const flags = { ...((par?.flags as Record<string, unknown>) ?? {}) };
    flags.dte_proveedor = "simplefactura";
    flags.dte_activo = fd.get("activo") === "on";
    flags.dte_sucursal = texto(fd, "sucursal", 60) ?? "Casa Matriz";
    const rutCesion = texto(fd, "cesionRut", 12);
    if (rutCesion && !rutEsValido(rutCesion)) return { ok: false, error: "El RUT de la persona autorizada a ceder no es válido." };
    flags.dte_cesion_rut = rutCesion ? normalizarRut(rutCesion) : null;
    flags.dte_cesion_nombre = texto(fd, "cesionNombre", 80);
    flags.dte_cesion_correo = texto(fd, "cesionCorreo", 80);
    flags.dte_razon_social = texto(fd, "razonSocial", 100);
    const { error: e2 } = await supabaseAdmin.from("fin_parametros").upsert({ empresa_id: ctx.empresa.id, flags, actualizado_por: ctx.usuario.correo, actualizado_en: new Date().toISOString() }, { onConflict: "empresa_id" });
    revienta("guardar la configuración", e2);
    await auditar(ctx, "fin_parametros", null, "config_dte", `Facturación electrónica ${flags.dte_activo ? "encendida" : "apagada"}`);
    refrescar();
    return { ok: true, mensaje: "Configuración guardada." };
  } catch (e) {
    return fallo(e);
  }
}

export async function probarConexionDteAction(): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (ctx.usuario.rol !== "admin") return { ok: false, error: "Solo el administrador del Core." };
    const r = await probarConexion(ctx.empresa.id);
    return r.ok ? { ok: true, mensaje: r.detalle } : { ok: false, error: r.detalle };
  } catch (e) {
    return fallo(e);
  }
}
