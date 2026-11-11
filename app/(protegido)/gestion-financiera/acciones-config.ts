"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { borrarArchivos } from "@/lib/archivos/almacen";
import { RUTA_FIN, auditar, contextoFin, contextoFinAdmin, exigirContacto, exigirDeEmpresa, fechaValida, montoDe, revienta, siguienteNumero } from "@/lib/fin/datos";
import { CONCEPTOS_MANUALES } from "@/lib/fin/reglas";
import { formatearRut, normalizarRut, rutEsValido } from "@/lib/contratos/rut";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): Resultado {
  return { ok: false, error: e instanceof Error ? e.message.replace(/^\[fin\]\s*/, "") : "Ocurrió un error inesperado." };
}
const refrescar = () => revalidatePath(RUTA_FIN, "layout");
const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
const entero = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").trim();
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? Math.round(x) : null;
};
const pct = (fd: FormData, k: string) => {
  const t = String(fd.get(k) ?? "").replace(",", ".").replace("%", "").trim();
  if (!t) return null;
  const x = Number(t);
  // Los campos se muestran en % (19, 1,2, 90), así que lo escrito siempre es un porcentaje:
  // antes «0,8» se leía como 80 %.
  return Number.isFinite(x) && x >= 0 && x <= 100 ? x / 100 : null;
};

// ---------- Eliminar un proyecto (solo el administrador del sistema) --------------------

/**
 * Elimina un proyecto que quedó vacío (por ejemplo, uno de prueba). No se puede si tiene hitos, compras, movimientos
 * del banco o cotizaciones: eso es historia financiera. Los leads que lo mencionan solo se desvinculan.
 */
export async function eliminarProyectoAction(id: string, motivo: string): Promise<Resultado & { mensaje?: string }> {
  try {
    if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Proyecto inválido." };
    const ctx = await contextoFin();
    // Solo el rol «admin» del Core, y se exige acá: ocultar el botón no protege nada.
    if (ctx.usuario.rol !== "admin") return { ok: false, error: "Solo el administrador del sistema puede eliminar." };
    const razon = motivo.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!razon) return { ok: false, error: "Escribe el motivo de la eliminación." };
    const p = await exigirDeEmpresa("fin_proyectos", id, ctx.empresa.id);
    if (p.es_general) return { ok: false, error: "«General» es el proyecto de los gastos sin proyecto: no se elimina." };
    const cuenta = async (tabla: string) => {
      const { count, error } = await supabaseAdmin.from(tabla).select("id", { count: "exact", head: true }).eq("empresa_id", ctx.empresa.id).eq("proyecto_id", id);
      revienta("revisar el proyecto", error);
      return count ?? 0;
    };
    const [hitos, compras, movimientos, cotizaciones] = await Promise.all([cuenta("fin_hitos"), cuenta("fin_compras"), cuenta("fin_movimientos"), cuenta("fin_cotizaciones")]);
    const usos = [hitos && `${hitos} hito(s)`, compras && `${compras} compra(s)`, movimientos && `${movimientos} movimiento(s) del banco`, cotizaciones && `${cotizaciones} cotización(es)`].filter(Boolean);
    if (usos.length > 0) {
      return { ok: false, error: `El proyecto no está vacío: tiene ${usos.join(", ")}. ${hitos || cotizaciones ? "Si son de prueba, elimina primero la cotización con sus hitos desde Leads. " : ""}Lo que ya tiene compras o movimientos del banco no se elimina.` };
    }
    // Referencias sueltas: los leads solo se desvinculan, y las reglas de categorización dejan de apuntar al proyecto.
    await supabaseAdmin.from("fin_oportunidades").update({ proyecto_id: null }).eq("empresa_id", ctx.empresa.id).eq("proyecto_id", id);
    await supabaseAdmin.from("fin_reglas").update({ proyecto_id: null }).eq("empresa_id", ctx.empresa.id).eq("proyecto_id", id);
    const { data: adjuntos } = await supabaseAdmin.from("fin_adjuntos").select("ruta").eq("empresa_id", ctx.empresa.id).eq("entidad_tipo", "proyecto").eq("entidad_id", id);
    await borrarArchivos("finanzas", (adjuntos ?? []).map((a) => a.ruta as string));
    await supabaseAdmin.from("fin_adjuntos").delete().eq("empresa_id", ctx.empresa.id).eq("entidad_tipo", "proyecto").eq("entidad_id", id);
    await supabaseAdmin.from("fin_actividades").delete().eq("empresa_id", ctx.empresa.id).eq("entidad_tipo", "proyecto").eq("entidad_id", id);
    const { error } = await supabaseAdmin.from("fin_proyectos").delete().eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("eliminar el proyecto", error);
    await auditar(ctx, "fin_proyectos", id, "eliminar", `Proyecto ${p.codigo} «${p.nombre}» eliminado`, { antes: p, motivo: razon });
    refrescar();
    revalidatePath("/leads", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Datos de la empresa (encabezado y pie del PDF de cotización) ----------------

export async function guardarPerfilEmpresaAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const correo = texto(fd, "correo", 120);
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { ok: false, error: "El correo comercial no es válido." };
    // Razón social: obligatoria. El slug (la identidad estable de la empresa) no cambia nunca.
    const nombre = texto(fd, "nombre", 120);
    if (!nombre) return { ok: false, error: "La razón social no puede quedar vacía." };
    // RUT de la empresa: opcional, pero si se escribe tiene que ser válido (sale en el PDF de la cotización).
    const rutEscrito = texto(fd, "rut", 20);
    if (rutEscrito && !rutEsValido(rutEscrito)) return { ok: false, error: "El RUT no es válido. Revisa el dígito verificador (ej.: 76.123.456-7)." };
    const prefijo = (texto(fd, "prefijo", 6) ?? "COT").toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(prefijo)) return { ok: false, error: "El prefijo de las cotizaciones son 2 a 6 letras o números." };
    const largo = (k: string, max: number) => String(fd.get(k) ?? "").replace(/\r/g, "").trim().slice(0, max) || null;
    const fila = {
      nombre,
      rut: rutEscrito ? formatearRut(normalizarRut(rutEscrito)) : null,
      direccion: texto(fd, "direccion", 200), giro: texto(fd, "giro", 200), telefono: texto(fd, "telefono", 60), correo_comercial: correo, web: texto(fd, "web", 120),
      datos_bancarios: largo("datosBancarios", 600), pie_cotizacion: largo("pie", 600), prefijo_cotizacion: prefijo,
    };
    const { error } = await supabaseAdmin.from("empresas").update(fila).eq("id", ctx.empresa.id);
    revienta("guardar los datos de la empresa", error);
    await auditar(ctx, "empresas", ctx.empresa.id, "editar", `Datos de ${ctx.empresa.nombre} para cotizaciones`);
    refrescar();
    revalidatePath("/leads", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Parámetros ------------------------------------------------------------

export async function guardarParametrosAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const fila = {
      empresa_id: ctx.empresa.id,
      tasa_iva: pct(fd, "tasaIva") ?? 0.19,
      tolerancia_factura_oc: montoDe(fd.get("toleranciaFacturaOc")) ?? 1000,
      plazo_pago_proveedor_dias: entero(fd, "plazoPagoProveedorDias") ?? 30,
      plazo_aclarar_dias: entero(fd, "plazoAclararDias") ?? 3,
      minimo_caja: montoDe(fd.get("minimoCaja")) ?? 0,
      tasa_mora_factoring: pct(fd, "tasaMoraFactoring") ?? 0.012,
      plazo_reclamo_factura_dias: entero(fd, "plazoReclamoFacturaDias") ?? 8,
      horizonte_meses: Math.min(12, Math.max(1, entero(fd, "horizonteMeses") ?? 3)),
      condicion_pago_default: entero(fd, "condicionPagoDefault") ?? 30,
      flags: { contabilidad_activa: fd.get("contabilidadActiva") === "on" },
      actualizado_por: ctx.usuario.correo,
      actualizado_en: new Date().toISOString(),
    };
    if (fila.tasa_iva < 0 || fila.tasa_iva > 1) return { ok: false, error: "El IVA va entre 0 y 100 %." };
    const { error } = await supabaseAdmin.from("fin_parametros").upsert(fila, { onConflict: "empresa_id" });
    revienta("guardar los parámetros", error);
    await auditar(ctx, "fin_parametros", null, "editar", "Parámetros financieros", { despues: fila });
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Cuentas, factores, categorías y reglas ------------------------------------

export async function guardarCuentaAction(id: string | null, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const nombre = texto(fd, "nombre", 80);
    const tipo = String(fd.get("tipo") ?? "banco");
    if (!nombre) return { ok: false, error: "La cuenta necesita un nombre." };
    if (!["banco", "tarjeta", "caja"].includes(tipo)) return { ok: false, error: "Tipo de cuenta inválido." };
    const numero = texto(fd, "numero", 30)?.replace(/\D/g, "").slice(-4) ?? null;
    const fila = {
      empresa_id: ctx.empresa.id, nombre, tipo, banco: texto(fd, "banco", 60), numero_enmascarado: numero ? `••${numero}` : null,
      saldo_banco: montoDe(fd.get("saldoBanco")) ?? 0, fecha_saldo: fechaValida(fd.get("fechaSaldo")), activa: fd.get("activa") !== "off",
    };
    if (id) {
      await exigirDeEmpresa("fin_cuentas", id, ctx.empresa.id);
      const cambios: Partial<typeof fila> = { ...fila };
      if (!numero) delete cambios.numero_enmascarado; // número en blanco al editar = se mantiene el guardado
      const { error } = await supabaseAdmin.from("fin_cuentas").update(cambios).eq("id", id).eq("empresa_id", ctx.empresa.id);
      revienta("guardar la cuenta", error);
    } else {
      const { error } = await supabaseAdmin.from("fin_cuentas").insert(fila);
      revienta("crear la cuenta", error);
    }
    await auditar(ctx, "fin_cuentas", id, id ? "editar" : "crear", `Cuenta ${nombre}: saldo ${fila.saldo_banco}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Actualiza solo el saldo según el banco y su fecha (la rutina diaria). */
export async function actualizarSaldoAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    await exigirDeEmpresa("fin_cuentas", id, ctx.empresa.id);
    const saldo = montoDe(fd.get("saldoBanco"));
    if (saldo === null) return { ok: false, error: "Escribe el saldo que dice el banco." };
    const { error } = await supabaseAdmin.from("fin_cuentas").update({ saldo_banco: saldo, fecha_saldo: fechaValida(fd.get("fechaSaldo")) ?? ctx.hoy }).eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("guardar el saldo", error);
    await auditar(ctx, "fin_cuentas", id, "saldo", `Saldo según banco: ${saldo}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarFactorAction(id: string | null, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const nombre = texto(fd, "nombre", 80);
    if (!nombre) return { ok: false, error: "El factor necesita un nombre." };
    const fila = {
      empresa_id: ctx.empresa.id, nombre, recurso_default: fd.get("recurso") === "sin" ? "sin" : "con",
      pct_anticipo_default: pct(fd, "pctAnticipo") ?? 0.9, tasa_mora_mensual: pct(fd, "tasaMora") ?? 0.012, activo: fd.get("activo") !== "off",
    };
    const q = id ? supabaseAdmin.from("fin_factores").update(fila).eq("id", id).eq("empresa_id", ctx.empresa.id) : supabaseAdmin.from("fin_factores").insert(fila);
    const { error } = await q;
    revienta("guardar el factor", error);
    await auditar(ctx, "fin_factores", id, id ? "editar" : "crear", `Factor ${nombre}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarCategoriaAction(id: string | null, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const nombre = texto(fd, "nombre", 60);
    if (!nombre) return { ok: false, error: "La categoría necesita un nombre." };
    const sentido = String(fd.get("sentido") ?? "ambos");
    const fila = {
      empresa_id: ctx.empresa.id, nombre, sentido: ["ingreso", "egreso", "ambos"].includes(sentido) ? sentido : "ambos",
      requiere_proyecto: fd.get("requiereProyecto") === "on", cuenta_contable: texto(fd, "cuentaContable", 20), activa: fd.get("activa") !== "off",
    };
    const q = id ? supabaseAdmin.from("fin_categorias").update(fila).eq("id", id).eq("empresa_id", ctx.empresa.id) : supabaseAdmin.from("fin_categorias").insert({ ...fila, orden: 100 });
    const { error } = await q;
    revienta("guardar la categoría", error);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarReglaAction(id: string | null, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const patron = texto(fd, "patron", 80);
    const categoriaId = String(fd.get("categoriaId") ?? "");
    if (!patron) return { ok: false, error: "Escribe qué texto de la glosa reconoce la regla." };
    if (!categoriaId) return { ok: false, error: "Elige la categoría que asigna." };
    await exigirDeEmpresa("fin_categorias", categoriaId, ctx.empresa.id);
    const cuentaId = String(fd.get("cuentaId") ?? "") || null;
    const proyectoId = String(fd.get("proyectoId") ?? "") || null;
    if (cuentaId) await exigirDeEmpresa("fin_cuentas", cuentaId, ctx.empresa.id);
    if (proyectoId) await exigirDeEmpresa("fin_proyectos", proyectoId, ctx.empresa.id);
    const fila = {
      empresa_id: ctx.empresa.id, patron, categoria_id: categoriaId, cuenta_id: cuentaId,
      proyecto_id: proyectoId, monto_min: montoDe(fd.get("montoMin")), monto_max: montoDe(fd.get("montoMax")),
      prioridad: entero(fd, "prioridad") ?? 100, activa: fd.get("activa") !== "off", creado_por: ctx.usuario.correo,
    };
    const q = id ? supabaseAdmin.from("fin_reglas").update(fila).eq("id", id).eq("empresa_id", ctx.empresa.id) : supabaseAdmin.from("fin_reglas").insert(fila);
    const { error } = await q;
    revienta("guardar la regla", error);
    await auditar(ctx, "fin_reglas", id, id ? "editar" : "crear", `Regla «${patron}»`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarReglaAction(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    await exigirDeEmpresa("fin_reglas", id, ctx.empresa.id);
    const { error } = await supabaseAdmin.from("fin_reglas").update({ activa: false }).eq("id", id).eq("empresa_id", ctx.empresa.id);
    revienta("desactivar la regla", error);
    await auditar(ctx, "fin_reglas", id, "desactivar", "Regla desactivada");
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Perfil financiero de un contacto -----------------------------------------

export async function guardarPerfilAction(contactoId: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const { data: c } = await supabaseAdmin.from("finanzas_contactos").select("id, razon_social").eq("id", contactoId).maybeSingle();
    if (!c) return { ok: false, error: "Ese contacto no existe en Contactos." };
    const fila = {
      empresa_id: ctx.empresa.id, contacto_id: contactoId, condicion_venta_dias: entero(fd, "condicionVentaDias"), condicion_compra_dias: entero(fd, "condicionCompraDias"),
      requiere_oc: fd.get("requiereOc") === "on", requiere_edp: fd.get("requiereEdp") === "on", requiere_hes: fd.get("requiereHes") === "on",
      contacto_cobranza: texto(fd, "contactoCobranza", 120), correo_cobranza: texto(fd, "correoCobranza", 120)?.toLowerCase() ?? null,
      telefono_cobranza: texto(fd, "telefonoCobranza", 40), referencia_exigida: texto(fd, "referenciaExigida", 60), notas: texto(fd, "notas", 1000),
      actualizado_en: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("fin_perfiles").upsert(fila, { onConflict: "empresa_id,contacto_id" });
    revienta("guardar el perfil", error);
    await auditar(ctx, "fin_perfiles", contactoId, "editar", `Perfil financiero de ${c.razon_social}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Proyectos -------------------------------------------------------------

export async function guardarProyectoAction(id: string | null, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    let nombre = texto(fd, "nombre", 120);
    const tipo = String(fd.get("tipo") ?? "contrato");
    if (!nombre) return { ok: false, error: "El proyecto necesita un nombre." };
    if (!["contrato", "spot", "arriendo", "interno"].includes(tipo)) return { ok: false, error: "Tipo inválido." };
    if (tipo === "spot" && !/^spot\s*-/i.test(nombre)) nombre = `Spot - ${nombre}`;
    const fila = {
      nombre, tipo, mandante_id: String(fd.get("mandanteId") ?? "") || null, descripcion: texto(fd, "descripcion", 500), jefe_proyecto: texto(fd, "jefeProyecto", 120),
      fecha_inicio: fechaValida(fd.get("fechaInicio")), fecha_termino: fechaValida(fd.get("fechaTermino")), presupuesto_costos: montoDe(fd.get("presupuestoCostos")),
      estado: fd.get("estado") === "cerrado" ? "cerrado" : "activo", actualizado_en: new Date().toISOString(),
    };
    if (fila.mandante_id) await exigirContacto(fila.mandante_id);
    let proyectoId = id;
    if (id) {
      const antes = await exigirDeEmpresa("fin_proyectos", id, ctx.empresa.id);
      const { error } = await supabaseAdmin.from("fin_proyectos").update(fila).eq("id", id).eq("empresa_id", ctx.empresa.id);
      revienta("guardar el proyecto", error);
      await auditar(ctx, "fin_proyectos", id, "editar", `Proyecto ${nombre}`, { antes, despues: fila });
    } else {
      const codigo = await siguienteNumero(ctx.empresa.id, "proyecto", "PRY", 4);
      const { data, error } = await supabaseAdmin.from("fin_proyectos").insert({ ...fila, empresa_id: ctx.empresa.id, codigo, creado_por: ctx.usuario.correo }).select("id").single();
      revienta("crear el proyecto", error);
      proyectoId = data!.id;
      await auditar(ctx, "fin_proyectos", proyectoId, "crear", `Proyecto ${codigo} ${nombre}`);
    }
    refrescar();
    return { ok: true, id: proyectoId ?? undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Flujo de caja: partidas manuales ----------------------------------------

export async function guardarPartidaAction(fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFinAdmin();
    const mes = fechaValida(fd.get("mes"));
    const concepto = String(fd.get("concepto") ?? "");
    if (!mes) return { ok: false, error: "Mes inválido." };
    if (!CONCEPTOS_MANUALES.some((c) => c.clave === concepto)) return { ok: false, error: "Concepto inválido." };
    const monto = montoDe(fd.get("monto")) ?? 0;
    const repetir = fd.get("repetir") === "on";
    const meses = [mes.slice(0, 7) + "-01"];
    if (repetir) for (let i = 1; i < 12; i++) {
      const d = new Date(`${meses[0]}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + i);
      meses.push(d.toISOString().slice(0, 10));
    }
    const { error } = await supabaseAdmin
      .from("fin_flujo_partidas")
      .upsert(meses.map((m) => ({ empresa_id: ctx.empresa.id, mes: m, concepto, monto, comentario: texto(fd, "comentario", 200) })), { onConflict: "empresa_id,mes,concepto" });
    revienta("guardar la partida", error);
    await auditar(ctx, "fin_flujo_partidas", null, "editar", `${concepto} ${mes.slice(0, 7)}${repetir ? " y 11 meses siguientes" : ""}: ${monto}`);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Rutinas -----------------------------------------------------------------

export async function marcarRutinaAction(tarea: string, periodo: string, hecha: boolean): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    if (!/^[a-z0-9-]{2,60}$/.test(tarea) || !/^[0-9W-]{4,12}$/.test(periodo)) return { ok: false, error: "Tarea inválida." };
    const q = hecha
      ? supabaseAdmin.from("fin_rutinas").upsert({ empresa_id: ctx.empresa.id, tarea, periodo, hecha_por: ctx.usuario.correo, hecha_en: new Date().toISOString() })
      : supabaseAdmin.from("fin_rutinas").delete().eq("empresa_id", ctx.empresa.id).eq("tarea", tarea).eq("periodo", periodo);
    const { error } = await q;
    revienta("marcar la rutina", error);
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Actividades y comentarios (de cualquier registro) ----------------------------

export async function agregarActividadAction(entidadTipo: string, entidadId: string, fd: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoFin();
    const textoActividad = texto(fd, "texto", 2000);
    if (!textoActividad) return { ok: false, error: "Escribe qué pasó." };
    if (!/^[a-z_]{3,30}$/.test(entidadTipo) || !/^[0-9a-f-]{36}$/.test(entidadId)) return { ok: false, error: "Registro inválido." };
    const tipo = String(fd.get("tipo") ?? "nota");
    const { error } = await supabaseAdmin.from("fin_actividades").insert({
      empresa_id: ctx.empresa.id, entidad_tipo: entidadTipo, entidad_id: entidadId, tipo: ["llamada", "reunion", "correo", "nota", "tarea"].includes(tipo) ? tipo : "nota",
      texto: textoActividad, fecha: fechaValida(fd.get("fecha")) ?? ctx.hoy, vencimiento: fechaValida(fd.get("vencimiento")), hecha: fd.get("pendiente") !== "on",
      creado_por: ctx.usuario.correo,
    });
    revienta("guardar la actividad", error);
    // Una promesa de pago del cliente actualiza la fecha estimada del hito (gestión de cobranza).
    const promesa = fechaValida(fd.get("fechaPrometida"));
    if (promesa && entidadTipo === "hito") {
      await exigirDeEmpresa("fin_hitos", entidadId, ctx.empresa.id);
      const { error: eH } = await supabaseAdmin.from("fin_hitos").update({ fecha_estimada_pago: promesa, actualizado_por: ctx.usuario.correo, actualizado_en: new Date().toISOString() }).eq("id", entidadId).eq("empresa_id", ctx.empresa.id);
      revienta("guardar la fecha prometida", eH);
      await auditar(ctx, "fin_hitos", entidadId, "editar", `Fecha estimada de pago (promesa del cliente): ${promesa}`);
    }
    refrescar();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
