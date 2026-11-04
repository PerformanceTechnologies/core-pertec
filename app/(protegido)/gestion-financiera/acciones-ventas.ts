"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RUTA_FIN, auditar, cargarVista, conciliarConMovimiento, contextoFin, exigirDeEmpresa, fechaValida, montoDe, registrarEvento, revienta, siguienteNumero } from "@/lib/fin/datos";
import { generarHitos, peso } from "@/lib/fin/reglas";
import { ETAPAS_OPORTUNIDAD, lineaNeta, type LineaCotizacion } from "@/lib/fin/modelo";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "Ocurrió un error inesperado." };
}
const refrescar = () => revalidatePath(RUTA_FIN, "layout");
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
const ahora = () => new Date().toISOString();

// ---------- Oportunidades ------------------------------------------------------------

export async function guardarOportunidadAction(id: string | null, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const nombre = texto(fd, "nombre", 160);
    if (!nombre) return { ok: false, error: "La oportunidad necesita un nombre." };
    const etapa = String(fd.get("etapa") ?? "prospecto");
    const info = ETAPAS_OPORTUNIDAD.find((x) => x.clave === etapa);
    if (!info) return { ok: false, error: "Etapa inválida." };
    const motivo = texto(fd, "motivoPerdida", 300);
    if (etapa === "perdida" && !motivo) return { ok: false, error: "Para marcarla perdida escribe el motivo." };
    const prob = Number(fd.get("probabilidad"));
    const fila = {
      nombre, etapa, cliente_id: uuid(fd.get("clienteId")), proyecto_id: uuid(fd.get("proyectoId")), tipo: ["servicio", "arriendo", "venta"].includes(String(fd.get("tipo"))) ? String(fd.get("tipo")) : "servicio",
      monto_estimado: montoDe(fd.get("montoEstimado")) ?? 0, probabilidad: Number.isFinite(prob) && String(fd.get("probabilidad") ?? "") !== "" ? Math.max(0, Math.min(100, Math.round(prob))) : info.probabilidad,
      fecha_cierre: fechaValida(fd.get("fechaCierre")), responsable: texto(fd, "responsable", 120), origen: texto(fd, "origen", 60), motivo_perdida: motivo,
      descripcion: texto(fd, "descripcion", 2000), actualizado_en: ahora(),
    };
    let opId = id;
    if (id) {
      const antes = await exigirDeEmpresa("fin_oportunidades", id, ctx.empresa.id);
      const { error } = await supabaseAdmin.from("fin_oportunidades").update(fila).eq("id", id);
      revienta("guardar la oportunidad", error);
      await auditar(ctx, "fin_oportunidades", id, "editar", `Oportunidad ${nombre}`, { antes, despues: fila });
    } else {
      const codigo = await siguienteNumero(ctx.empresa.id, "oportunidad", "OPO", 4);
      const { data, error } = await supabaseAdmin.from("fin_oportunidades").insert({ ...fila, empresa_id: ctx.empresa.id, codigo, creado_por: ctx.usuario.correo, orden: Date.now() }).select("id").single();
      revienta("crear la oportunidad", error);
      opId = data!.id;
      await auditar(ctx, "fin_oportunidades", opId, "crear", `Oportunidad ${codigo} ${nombre}`);
    }
    refrescar();
    return { ok: true, id: opId ?? undefined };
  } catch (e) {
    return fallo(e);
  }
}

/** Mover en el Kanban. A «Perdida» pide motivo; la probabilidad se ajusta a la de la etapa. */
export async function moverOportunidadAction(id: string, etapa: string, motivo?: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const info = ETAPAS_OPORTUNIDAD.find((x) => x.clave === etapa);
    if (!info) return { ok: false, error: "Etapa inválida." };
    if (etapa === "perdida" && !motivo?.trim()) return { ok: false, error: "Escribe el motivo de la pérdida." };
    const antes = await exigirDeEmpresa("fin_oportunidades", id, ctx.empresa.id);
    const { error } = await supabaseAdmin
      .from("fin_oportunidades")
      .update({ etapa, probabilidad: info.probabilidad, motivo_perdida: etapa === "perdida" ? motivo!.trim().slice(0, 300) : null, actualizado_en: ahora() })
      .eq("id", id);
    revienta("mover la oportunidad", error);
    await auditar(ctx, "fin_oportunidades", id, "etapa", `De ${antes.etapa} a ${etapa}`, { motivo: motivo ?? null });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Cotizaciones ---------------------------------------------------------------

interface DatosCotizacion {
  titulo: string;
  clienteId: string | null;
  oportunidadId: string | null;
  proyectoId: string | null;
  tipo: string;
  fecha: string;
  validezDias: number;
  condicionPagoDias: number | null;
  requiereOc: boolean;
  requiereEdp: boolean;
  requiereHes: boolean;
  notas: string | null;
  lineas: LineaCotizacion[];
}

function leerCotizacion(json: string): DatosCotizacion | string {
  let d: DatosCotizacion;
  try {
    d = JSON.parse(json);
  } catch {
    return "No se pudo leer la cotización.";
  }
  if (!d.titulo?.trim()) return "La cotización necesita un título.";
  if (!Array.isArray(d.lineas) || d.lineas.length === 0) return "Agrega al menos una línea.";
  if (d.lineas.length > 200) return "Máximo 200 líneas.";
  for (const l of d.lineas) {
    if (!String(l.descripcion ?? "").trim()) return "Cada línea necesita una descripción.";
    if (!(Number(l.cantidad) > 0)) return `La cantidad de «${l.descripcion}» tiene que ser mayor a 0.`;
    if (!(Number(l.precioUnitario) >= 0)) return `El precio de «${l.descripcion}» no es válido.`;
  }
  if (!["servicio", "arriendo", "venta"].includes(d.tipo)) d.tipo = "servicio";
  return d;
}

export async function guardarCotizacionAction(id: string | null, json: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const d = leerCotizacion(json);
    if (typeof d === "string") return { ok: false, error: d };
    const vista = await cargarVista();
    const lineas = d.lineas.map((l, i) => ({ ...l, orden: i, netoLinea: lineaNeta(l) }));
    const neto = lineas.reduce((s, l) => s + l.netoLinea, 0);
    const afecto = lineas.filter((l) => !l.exento).reduce((s, l) => s + l.netoLinea, 0);
    const iva = peso(afecto * vista.p.tasaIva);
    const cabecera = {
      titulo: d.titulo.trim().slice(0, 200), cliente_id: uuid(d.clienteId), oportunidad_id: uuid(d.oportunidadId), proyecto_id: uuid(d.proyectoId), tipo: d.tipo,
      fecha: fechaValida(d.fecha) ?? ctx.hoy, validez_dias: Math.max(1, Math.min(365, Math.round(Number(d.validezDias) || 30))),
      condicion_pago_dias: d.condicionPagoDias === null || d.condicionPagoDias === undefined ? null : Math.round(Number(d.condicionPagoDias)),
      requiere_oc: Boolean(d.requiereOc), requiere_edp: Boolean(d.requiereEdp), requiere_hes: Boolean(d.requiereHes), notas: d.notas?.slice(0, 4000) ?? null,
      neto, iva, total: neto + iva, actualizado_en: ahora(),
    };
    let cotId = id;
    if (id) {
      const antes = await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id);
      if (!["borrador", "enviada"].includes(String(antes.estado))) return { ok: false, error: "Solo se edita una cotización en borrador o enviada. Crea una nueva versión." };
      const { error } = await supabaseAdmin.from("fin_cotizaciones").update(cabecera).eq("id", id);
      revienta("guardar la cotización", error);
      await supabaseAdmin.from("fin_cotizacion_lineas").delete().eq("cotizacion_id", id);
      await auditar(ctx, "fin_cotizaciones", id, "editar", `Cotización ${antes.numero}: total ${cabecera.total}`);
    } else {
      const numero = await siguienteNumero(ctx.empresa.id, "cotizacion", "COT");
      const { data, error } = await supabaseAdmin.from("fin_cotizaciones").insert({ ...cabecera, empresa_id: ctx.empresa.id, numero, creado_por: ctx.usuario.correo }).select("id").single();
      revienta("crear la cotización", error);
      cotId = data!.id;
      await auditar(ctx, "fin_cotizaciones", cotId, "crear", `Cotización ${numero}`);
      if (cabecera.oportunidad_id) {
        await supabaseAdmin.from("fin_oportunidades").update({ etapa: "cotizacion", probabilidad: 50, actualizado_en: ahora() }).eq("id", cabecera.oportunidad_id).eq("empresa_id", ctx.empresa.id).in("etapa", ["prospecto", "calificada"]);
      }
    }
    const { error: e2 } = await supabaseAdmin.from("fin_cotizacion_lineas").insert(
      lineas.map((l) => ({
        cotizacion_id: cotId, orden: l.orden, producto_id: uuid(l.productoId), descripcion: String(l.descripcion).trim().slice(0, 500), cantidad: Number(l.cantidad),
        unidad: l.unidad?.slice(0, 20) ?? null, precio_unitario: Number(l.precioUnitario), descuento_pct: Math.max(0, Math.min(1, Number(l.descuentoPct) || 0)),
        exento: Boolean(l.exento), meses: l.meses ? Math.round(Number(l.meses)) : null, neto_linea: l.netoLinea,
      })),
    );
    revienta("guardar las líneas", e2);
    refrescar();
    return { ok: true, id: cotId ?? undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarEstadoCotizacionAction(id: string, estado: "enviada" | "rechazada" | "anulada" | "borrador", motivo?: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const antes = await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id);
    if (antes.estado === "aceptada") return { ok: false, error: "Una cotización aceptada ya generó sus hitos: anula los hitos si corresponde." };
    if ((estado === "rechazada" || estado === "anulada") && !motivo?.trim()) return { ok: false, error: "Escribe el motivo." };
    const { error } = await supabaseAdmin
      .from("fin_cotizaciones")
      .update({ estado, fecha_envio: estado === "enviada" ? antes.fecha_envio ?? ctx.hoy : antes.fecha_envio, motivo: motivo?.slice(0, 300) ?? null, actualizado_en: ahora() })
      .eq("id", id);
    revienta("cambiar el estado", error);
    if (estado === "rechazada" && antes.oportunidad_id) {
      await supabaseAdmin.from("fin_oportunidades").update({ etapa: "perdida", probabilidad: 0, motivo_perdida: motivo, actualizado_en: ahora() }).eq("id", antes.oportunidad_id as string);
    }
    await auditar(ctx, "fin_cotizaciones", id, "estado", `${antes.estado} → ${estado}`, { motivo: motivo ?? null });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Nueva versión (V2, V3…): clona la cotización y deja la anterior «reemplazada». */
export async function nuevaVersionCotizacionAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const c = await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id);
    if (c.estado === "aceptada") return { ok: false, error: "Ya está aceptada: no se versiona." };
    const { data: ultima } = await supabaseAdmin.from("fin_cotizaciones").select("version").eq("empresa_id", ctx.empresa.id).eq("numero", c.numero as string).order("version", { ascending: false }).limit(1).single();
    const { id: _id, creado_en: _c, ...resto } = c as Record<string, unknown>;
    void _id;
    void _c;
    const { data, error } = await supabaseAdmin
      .from("fin_cotizaciones")
      .insert({ ...resto, version: Number(ultima?.version ?? 1) + 1, padre_id: id, estado: "borrador", fecha: ctx.hoy, fecha_envio: null, fecha_aceptacion: null, creado_por: ctx.usuario.correo, actualizado_en: ahora() })
      .select("id")
      .single();
    revienta("crear la versión", error);
    const { data: lineas } = await supabaseAdmin.from("fin_cotizacion_lineas").select("*").eq("cotizacion_id", id);
    if (lineas?.length) {
      const { error: e2 } = await supabaseAdmin.from("fin_cotizacion_lineas").insert(lineas.map(({ id: _l, ...l }) => (void _l, { ...l, cotizacion_id: data!.id })));
      revienta("copiar las líneas", e2);
    }
    await supabaseAdmin.from("fin_cotizaciones").update({ estado: "reemplazada", actualizado_en: ahora() }).eq("id", id);
    await auditar(ctx, "fin_cotizaciones", data!.id, "version", `Nueva versión de ${c.numero}`);
    refrescar();
    return { ok: true, id: data!.id };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Aceptar: fecha, evidencia (opcional), N° OC del cliente (decide el camino con OC o sin OC) y el
 * generador de hitos. Crea el proyecto si hace falta y los hitos; la oportunidad pasa a Ganada.
 */
export async function aceptarCotizacionAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const c = await exigirDeEmpresa("fin_cotizaciones", id, ctx.empresa.id);
    if (!["borrador", "enviada"].includes(String(c.estado))) return { ok: false, error: "Esta cotización ya no se puede aceptar." };
    const fecha = fechaValida(fd.get("fechaAceptacion"));
    if (!fecha) return { ok: false, error: "Indica la fecha de aceptación." };
    const oc = texto(fd, "ocCliente", 60);
    const neto = Number(c.neto);

    let proyectoId = uuid(fd.get("proyectoId")) ?? (c.proyecto_id as string | null);
    if (!proyectoId) {
      let nombre = texto(fd, "nombreProyecto", 120) ?? String(c.titulo);
      const tipoProyecto = String(fd.get("tipoProyecto") ?? (c.tipo === "arriendo" ? "arriendo" : "contrato"));
      if (tipoProyecto === "spot" && !/^spot\s*-/i.test(nombre)) nombre = `Spot - ${nombre}`;
      const codigo = await siguienteNumero(ctx.empresa.id, "proyecto", "PRY", 4);
      const { data, error } = await supabaseAdmin
        .from("fin_proyectos")
        .insert({ empresa_id: ctx.empresa.id, codigo, nombre, tipo: ["contrato", "spot", "arriendo", "interno"].includes(tipoProyecto) ? tipoProyecto : "contrato", mandante_id: c.cliente_id, creado_por: ctx.usuario.correo })
        .select("id")
        .single();
      revienta("crear el proyecto", error);
      proyectoId = data!.id;
    }

    const modo = String(fd.get("modo") ?? "unica");
    const generados =
      modo === "partes"
        ? generarHitos({ tipo: "partes", partes: Number(fd.get("partes")) || 2 }, neto)
        : modo === "mensual"
          ? generarHitos(
              {
                tipo: "mensual", desde: fechaValida(fd.get("desde")) ?? fecha, hasta: fechaValida(fd.get("hasta")) ?? fecha,
                prefijo: c.tipo === "arriendo" ? "Arriendo" : "EDP", montoMensual: montoDe(fd.get("montoMensual")) ?? undefined,
              },
              neto,
            )
          : generarHitos({ tipo: "unica" }, neto);
    if (generados.length === 0) return { ok: false, error: "El rango de meses no genera ningún hito." };

    const filas = [];
    for (const [i, g] of generados.entries()) {
      filas.push({
        empresa_id: ctx.empresa.id, codigo: await siguienteNumero(ctx.empresa.id, "hito", "V", 4), cotizacion_id: id, cliente_id: c.cliente_id, proyecto_id: proyectoId,
        descripcion: String(c.titulo), tipo: c.tipo, periodo: g.periodo, periodo_desde: g.periodoDesde, periodo_hasta: g.periodoHasta, fecha_aceptacion: fecha,
        neto: g.neto, oc_cliente_numero: oc, oc_cliente_fecha: oc ? fecha : null, estado_trabajo: i === 0 && modo === "mensual" && g.periodoDesde && g.periodoDesde <= ctx.hoy ? "en_curso" : "pendiente",
        requiere_edp: c.requiere_edp, requiere_hes: c.requiere_hes, condicion_pago_dias: c.condicion_pago_dias, orden: i, creado_por: ctx.usuario.correo,
      });
    }
    const { error: eh } = await supabaseAdmin.from("fin_hitos").insert(filas);
    revienta("crear los hitos", eh);
    const { error } = await supabaseAdmin
      .from("fin_cotizaciones")
      .update({ estado: "aceptada", fecha_aceptacion: fecha, oc_cliente_numero: oc, proyecto_id: proyectoId, actualizado_en: ahora() })
      .eq("id", id);
    revienta("aceptar la cotización", error);
    if (c.oportunidad_id) {
      await supabaseAdmin.from("fin_oportunidades").update({ etapa: "ganada", probabilidad: 100, proyecto_id: proyectoId, actualizado_en: ahora() }).eq("id", c.oportunidad_id as string);
    }
    await auditar(ctx, "fin_cotizaciones", id, "aceptar", `Aceptada el ${fecha}: ${filas.length} hito(s)${oc ? `, OC ${oc}` : ", sin OC"}`);
    await registrarEvento(ctx, "cotizacion_aceptada", "cotizacion", id, { hitos: filas.length, neto });
    refrescar();
    return { ok: true, id: proyectoId ?? undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Hitos ---------------------------------------------------------------------

/** Un hito suelto (spot sin cotización estructurada, o agregar/dividir uno). */
export async function guardarHitoAction(id: string | null, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const descripcion = texto(fd, "descripcion", 300);
    const neto = montoDe(fd.get("neto"));
    if (!descripcion) return { ok: false, error: "Describe qué se factura." };
    if (neto === null || neto < 0) return { ok: false, error: "Indica el monto neto." };
    const trabajo = String(fd.get("estadoTrabajo") ?? "");
    const fila = {
      descripcion, neto, cliente_id: uuid(fd.get("clienteId")), proyecto_id: uuid(fd.get("proyectoId")),
      tipo: ["servicio", "arriendo", "venta"].includes(String(fd.get("tipo"))) ? String(fd.get("tipo")) : "servicio",
      periodo: texto(fd, "periodo", 60), fecha_aceptacion: fechaValida(fd.get("fechaAceptacion")), oc_cliente_numero: texto(fd, "ocClienteNumero", 60),
      estado_trabajo: ["pendiente", "en_curso", "terminado"].includes(trabajo) ? trabajo : null, guia_despacho: texto(fd, "guiaDespacho", 40),
      requiere_edp: fd.get("requiereEdp") === "on", edp_fecha_aprobacion: fechaValida(fd.get("edpFechaAprobacion")), requiere_hes: fd.get("requiereHes") === "on",
      hes_numero: texto(fd, "hesNumero", 40), fecha_estimada_pago: fechaValida(fd.get("fechaEstimadaPago")), comentario: texto(fd, "comentario", 1000),
      actualizado_por: ctx.usuario.correo, actualizado_en: ahora(),
    };
    let hitoId = id;
    if (id) {
      const antes = await exigirDeEmpresa("fin_hitos", id, ctx.empresa.id);
      const motivo = texto(fd, "motivo", 300);
      if (Number(antes.neto) !== neto && !motivo) return { ok: false, error: "Cambiar el monto pide un motivo." };
      const { error } = await supabaseAdmin.from("fin_hitos").update(fila).eq("id", id);
      revienta("guardar el hito", error);
      await auditar(ctx, "fin_hitos", id, "editar", `Hito ${antes.codigo}`, { antes, despues: fila, motivo });
    } else {
      const codigo = await siguienteNumero(ctx.empresa.id, "hito", "V", 4);
      const { data, error } = await supabaseAdmin.from("fin_hitos").insert({ ...fila, empresa_id: ctx.empresa.id, codigo, creado_por: ctx.usuario.correo }).select("id").single();
      revienta("crear el hito", error);
      hitoId = data!.id;
      await auditar(ctx, "fin_hitos", hitoId, "crear", `Hito ${codigo}`);
    }
    refrescar();
    return { ok: true, id: hitoId ?? undefined };
  } catch (e) {
    return fallo(e);
  }
}

const CAMPOS_HITO: Record<string, (v: string) => unknown> = {
  estado_trabajo: (v) => (["pendiente", "en_curso", "terminado"].includes(v) ? v : null),
  oc_cliente_numero: (v) => v.trim().slice(0, 60) || null,
  edp_fecha_aprobacion: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null),
  hes_numero: (v) => v.trim().slice(0, 40) || null,
  fecha_estimada_pago: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null),
  guia_despacho: (v) => v.trim().slice(0, 40) || null,
  comentario: (v) => v.trim().slice(0, 1000) || null,
};

/** Edición en línea de un campo MANUAL de la fila; la etapa se recalcula sola al releer. */
export async function actualizarCampoHitoAction(id: string, campo: string, valor: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const limpiar = CAMPOS_HITO[campo];
    if (!limpiar) return { ok: false, error: "Ese campo no se edita así." };
    const antes = await exigirDeEmpresa("fin_hitos", id, ctx.empresa.id);
    const nuevo = limpiar(valor);
    const { error } = await supabaseAdmin.from("fin_hitos").update({ [campo]: nuevo, actualizado_por: ctx.usuario.correo, actualizado_en: ahora() }).eq("id", id);
    revienta("guardar el cambio", error);
    await auditar(ctx, "fin_hitos", id, "editar", `${campo}: ${String(antes[campo] ?? "—")} → ${String(nuevo ?? "—")}`);
    if (campo === "estado_trabajo" && nuevo === "terminado") await registrarEvento(ctx, "hito_terminado", "hito", id);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularHitoAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!motivo.trim()) return { ok: false, error: "Escribe el motivo." };
    await exigirDeEmpresa("fin_hitos", id, ctx.empresa.id);
    const { data: ligados } = await supabaseAdmin.from("fin_documento_hitos").select("documento_id, fin_documentos!inner(estado)").eq("hito_id", id);
    if ((ligados ?? []).some((x: { fin_documentos: { estado: string } | { estado: string }[] }) => [x.fin_documentos].flat().some((d) => d.estado === "vigente"))) {
      return { ok: false, error: "El hito tiene una factura vigente: emite primero la nota de crédito." };
    }
    const { error } = await supabaseAdmin.from("fin_hitos").update({ anulado: true, motivo_anulacion: motivo.slice(0, 300), actualizado_en: ahora() }).eq("id", id);
    revienta("anular el hito", error);
    await auditar(ctx, "fin_hitos", id, "anular", "Hito anulado", { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Documentos tributarios de venta (carga manual) -------------------------------

/**
 * Registrar factura (33 afecta / 34 exenta) desde uno o varios hitos del mismo cliente. Los montos
 * vienen precargados desde los hitos y se pueden ajustar; el neto de cada hito se aplica tal cual.
 */
export async function registrarFacturaVentaAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const vista = await cargarVista();
    const hitoIds = fd.getAll("hitoIds").map(String).filter((x) => uuid(x));
    const hitos = vista.hitos.filter((h) => hitoIds.includes(h.id));
    if (hitos.length === 0) return { ok: false, error: "Elige al menos un hito." };
    if (new Set(hitos.map((h) => h.clienteId)).size > 1) return { ok: false, error: "Una factura es de un solo cliente." };
    if (hitos.some((h) => h.factura)) return { ok: false, error: "Alguno de los hitos ya tiene factura." };
    const tipo = Number(fd.get("tipoDte")) === 34 ? 34 : 33;
    const folio = texto(fd, "folio", 20);
    const fecha = fechaValida(fd.get("fechaEmision"));
    if (!folio || !fecha) return { ok: false, error: "Folio y fecha de emisión son obligatorios." };
    const netoHitos = hitos.reduce((s, h) => s + h.neto, 0);
    const neto = tipo === 34 ? 0 : montoDe(fd.get("neto")) ?? netoHitos;
    const exento = tipo === 34 ? montoDe(fd.get("exento")) ?? netoHitos : montoDe(fd.get("exento")) ?? 0;
    const iva = tipo === 34 ? 0 : montoDe(fd.get("iva")) ?? peso(neto * vista.p.tasaIva);
    const total = neto + exento + iva;
    const clienteId = hitos[0].clienteId;
    const condicion = hitos[0].condicion;
    const rut = clienteId ? vista.contrapartes.find((c) => c.id === clienteId)?.rut ?? "" : "";
    const { data, error } = await supabaseAdmin
      .from("fin_documentos")
      .insert({
        empresa_id: ctx.empresa.id, direccion: "emitido", tipo_dte: tipo, folio, fecha_emision: fecha, contraparte_id: clienteId, rut_contraparte: rut ?? "",
        razon_social: hitos[0].clienteNombre, neto, exento, iva, total, fecha_vencimiento: new Date(Date.parse(`${fecha}T12:00:00Z`) + condicion * 86_400_000).toISOString().slice(0, 10),
        referencias: texto(fd, "referencias", 500), origen: "manual", creado_por: ctx.usuario.correo,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return { ok: false, error: `Ya existe la factura ${folio} para este cliente.` };
    revienta("registrar la factura", error);
    const { error: e2 } = await supabaseAdmin.from("fin_documento_hitos").insert(hitos.map((h) => ({ documento_id: data!.id, hito_id: h.id, neto_aplicado: h.neto })));
    revienta("ligar la factura a sus hitos", e2);
    await auditar(ctx, "fin_documentos", data!.id, "crear", `Factura ${folio} por ${total} (${hitos.map((h) => h.codigo).join(", ")})`);
    await registrarEvento(ctx, "factura_venta_registrada", "documento", data!.id, { folio, total, hitos: hitoIds });
    refrescar();
    return { ok: true, id: data!.id };
  } catch (e) {
    return fallo(e);
  }
}

/** Nota de crédito (61), nota de débito (56) o guía de despacho (52). NC/ND referencian una factura. */
export async function registrarNotaAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const vista = await cargarVista();
    const tipo = Number(fd.get("tipoDte"));
    if (![61, 56, 52].includes(tipo)) return { ok: false, error: "Tipo inválido." };
    const direccion = fd.get("direccion") === "recibido" ? "recibido" : "emitido";
    const folio = texto(fd, "folio", 20);
    const fecha = fechaValida(fd.get("fechaEmision"));
    if (!folio || !fecha) return { ok: false, error: "Folio y fecha son obligatorios." };
    const refId = uuid(fd.get("documentoReferenciadoId"));
    const ref = refId ? vista.documentos.find((d) => d.id === refId) : null;
    if ((tipo === 61 || tipo === 56) && !ref) return { ok: false, error: "La nota tiene que referenciar una factura." };
    const neto = montoDe(fd.get("neto")) ?? 0;
    const exento = montoDe(fd.get("exento")) ?? 0;
    const iva = montoDe(fd.get("iva")) ?? peso(neto * vista.p.tasaIva);
    const total = neto + exento + iva;
    if (tipo === 61 && ref && total > ref.saldo + ref.aplicado) return { ok: false, error: "La nota de crédito no puede ser mayor que la factura." };
    const contraparteId = ref?.contraparteId ?? uuid(fd.get("contraparteId"));
    const { data, error } = await supabaseAdmin
      .from("fin_documentos")
      .insert({
        empresa_id: ctx.empresa.id, direccion: ref?.direccion ?? direccion, tipo_dte: tipo, folio, fecha_emision: fecha, contraparte_id: contraparteId,
        rut_contraparte: ref?.rutContraparte ?? "", razon_social: ref?.razonSocial ?? null, neto, exento, iva, total, documento_referenciado_id: ref?.id ?? null,
        referencias: texto(fd, "referencias", 500), origen: "manual", creado_por: ctx.usuario.correo,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return { ok: false, error: `Ya existe ese folio.` };
    revienta("registrar el documento", error);
    // Una guía de despacho se anota en el hito (arriendos: el primer mes).
    const hitoGuia = uuid(fd.get("hitoId"));
    if (tipo === 52 && hitoGuia) {
      await supabaseAdmin.from("fin_hitos").update({ guia_despacho: folio }).eq("id", hitoGuia).eq("empresa_id", ctx.empresa.id);
      await supabaseAdmin.from("fin_documento_hitos").insert({ documento_id: data!.id, hito_id: hitoGuia, neto_aplicado: 0 });
    }
    // Una NC que anula toda la factura reabre los hitos (con motivo).
    if (tipo === 61 && ref && ref.direccion === "emitido" && total >= ref.total && fd.get("reabrirHitos") === "on") {
      await supabaseAdmin.from("fin_documento_hitos").delete().eq("documento_id", ref.id);
      await supabaseAdmin.from("fin_documentos").update({ estado: "anulado", motivo_anulacion: `Anulada por NC ${folio}` }).eq("id", ref.id);
    }
    const nombre = tipo === 61 ? "Nota de crédito" : tipo === 56 ? "Nota de débito" : "Guía de despacho";
    await auditar(ctx, "fin_documentos", data!.id, "crear", `${nombre} ${folio}${ref ? ` sobre ${ref.folio}` : ""} por ${total}`, { motivo: texto(fd, "motivo", 300) });
    refrescar();
    return { ok: true, id: data!.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularDocumentoAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!motivo.trim()) return { ok: false, error: "Escribe el motivo." };
    const doc = await exigirDeEmpresa("fin_documentos", id, ctx.empresa.id);
    const { count } = await supabaseAdmin.from("fin_cobro_aplicaciones").select("cobro_id", { count: "exact", head: true }).eq("documento_id", id);
    const { count: pagos } = await supabaseAdmin.from("fin_pago_aplicaciones").select("pago_id", { count: "exact", head: true }).eq("documento_id", id);
    if ((count ?? 0) + (pagos ?? 0) > 0) return { ok: false, error: "Tiene cobros o pagos aplicados: anúlalos primero." };
    const { error } = await supabaseAdmin.from("fin_documentos").update({ estado: "anulado", motivo_anulacion: motivo.slice(0, 300) }).eq("id", id);
    revienta("anular el documento", error);
    await supabaseAdmin.from("fin_documento_hitos").delete().eq("documento_id", id);
    await auditar(ctx, "fin_documentos", id, "anular", `Documento ${doc.folio} anulado`, { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Cobros ----------------------------------------------------------------------

/** Un cobro aplicado a una o varias facturas (abonos parciales). Puede venir de un abono del banco. */
export async function registrarCobroAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const vista = await cargarVista();
    const fecha = fechaValida(fd.get("fecha"));
    if (!fecha) return { ok: false, error: "Indica la fecha del cobro." };
    let aplicaciones: { documentoId: string; monto: number }[];
    try {
      aplicaciones = JSON.parse(String(fd.get("aplicaciones") ?? "[]"));
    } catch {
      return { ok: false, error: "No se pudo leer a qué facturas se aplica." };
    }
    aplicaciones = aplicaciones.filter((a) => uuid(a.documentoId) && Number(a.monto) > 0).map((a) => ({ documentoId: a.documentoId, monto: Math.round(Number(a.monto)) }));
    if (aplicaciones.length === 0) return { ok: false, error: "Aplica el cobro a al menos una factura." };
    for (const a of aplicaciones) {
      const d = vista.documentos.find((x) => x.id === a.documentoId);
      if (!d || d.direccion !== "emitido") return { ok: false, error: "Factura inválida." };
      if (a.monto > d.saldo) return { ok: false, error: `A la factura ${d.folio} le quedan ${d.saldo}: no se le puede aplicar más.` };
    }
    const monto = aplicaciones.reduce((s, a) => s + a.monto, 0);
    const primera = vista.documentos.find((x) => x.id === aplicaciones[0].documentoId)!;
    const movimientoId = uuid(fd.get("movimientoId"));
    const numero = await siguienteNumero(ctx.empresa.id, "cobro", "COB");
    const { data, error } = await supabaseAdmin
      .from("fin_cobros")
      .insert({
        empresa_id: ctx.empresa.id, numero, cliente_id: primera.contraparteId, fecha, monto, medio: String(fd.get("medio") ?? "transferencia").slice(0, 30),
        cuenta_id: uuid(fd.get("cuentaId")), movimiento_id: movimientoId, referencia: texto(fd, "referencia", 200), creado_por: ctx.usuario.correo,
      })
      .select("id")
      .single();
    revienta("registrar el cobro", error);
    const { error: e2 } = await supabaseAdmin.from("fin_cobro_aplicaciones").insert(aplicaciones.map((a) => ({ cobro_id: data!.id, documento_id: a.documentoId, monto: a.monto })));
    revienta("aplicar el cobro", e2);
    if (movimientoId) await conciliarConMovimiento(ctx.empresa.id, movimientoId, "cobro", data!.id, monto, vista.categorias.find((c) => c.nombre === "Cobro cliente")?.id ?? null);
    await auditar(ctx, "fin_cobros", data!.id, "crear", `Cobro ${numero} por ${monto}`);
    await registrarEvento(ctx, "cobro_registrado", "cobro", data!.id, { monto });
    refrescar();
    return { ok: true, id: data!.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularCobroAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!motivo.trim()) return { ok: false, error: "Escribe el motivo." };
    const c = await exigirDeEmpresa("fin_cobros", id, ctx.empresa.id);
    const { error } = await supabaseAdmin.from("fin_cobros").update({ estado: "anulado" }).eq("id", id);
    revienta("anular el cobro", error);
    await supabaseAdmin.from("fin_conciliaciones").delete().eq("entidad_tipo", "cobro").eq("entidad_id", id);
    await auditar(ctx, "fin_cobros", id, "anular", `Cobro ${c.numero} anulado`, { motivo });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
