"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoRendidor } from "@/lib/rendidor/permisos";
import { contextoDeEmpresa } from "@/lib/empresas";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listarPersonas, obtenerRendicion } from "@/lib/rendidor/datos";
import {
  auditar,
  aprobacion,
  avisar,
  correosConRol,
  crearFondo,
  enlaceFondo,
  guardarParametros,
  leerParametros,
  marcarConciliado,
  obtenerFondo,
  ponerRol,
  registrarMovimiento,
  rolesDe,
  tieneVencidos,
  transicion,
} from "@/lib/rendidor/fondos";
import { esReferenciaSharePoint } from "@/lib/archivos/almacen";
import { esFactura } from "@/lib/rendidor/mis-gastos-modelo";
import { facturasCandidatas, type FacturaCandidata } from "@/lib/rendidor/proveedores";
import { ROLES_FONDOS, pesos, type Fondo, type RolFondos } from "@/lib/rendidor/fondos-modelo";

// -----------------------------------------------------------------------------
//  Las acciones de Fondos por rendir. Cada una valida en el servidor: rol, estado de origen y
//  que nadie apruebe, transfiera ni confirme lo propio (separación de funciones).
// -----------------------------------------------------------------------------

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };
const fallo = (e: unknown): Resultado => ({ ok: false, error: e instanceof Error ? e.message : "Ocurrió un error inesperado." });

async function ctx() {
  const { usuario, rol } = await exigirAccesoRendidor();
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  if (!activa) throw new Error("No tienes una empresa activa.");
  const roles = await rolesDe(usuario, rol === "admin", activa.id);
  const yo = usuario.correo.toLowerCase();
  return { usuario, yo, empresaId: activa.id, roles, tiene: (r: RolFondos) => roles.includes(r) };
}

async function fondoDeEmpresa(id: string, empresaId: string): Promise<Fondo> {
  const f = await obtenerFondo(id);
  if (!f || f.empresaId !== empresaId) throw new Error("No encontramos ese fondo.");
  return f;
}

/** La referencia del comprobante que subió Tesorería: de SharePoint, o de la carpeta de ESTE fondo en el bucket. */
function comprobanteValido(ruta: string | undefined, fondoId: string): string | null {
  if (!ruta) return null;
  if (esReferenciaSharePoint(ruta) || ruta.startsWith(`fondos/${fondoId}/`)) return ruta.slice(0, 300);
  throw new Error("El comprobante no es válido: súbelo de nuevo.");
}

const monto = (v: FormDataEntryValue | null) => {
  const x = Math.round(Number(String(v ?? "").replace(/[$.\s]/g, "").replace(",", ".")));
  return Number.isFinite(x) && x > 0 ? x : null;
};
const texto = (v: FormDataEntryValue | null, max = 500) => String(v ?? "").trim().slice(0, max) || null;
const fecha = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const sumarDias = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const listo = (id?: string) => {
  revalidatePath("/rendir-gastos", "layout");
  return { ok: true as const, id };
};
const noPropio = (f: Fondo, yo: string, que: string) => {
  if (f.rendidorCorreo === yo) throw new Error(`No puedes ${que} un fondo propio: tiene que hacerlo otra persona.`);
};

// ---------- Fase 1: del fondo solicitado al fondo activo ---------------------------------

export async function solicitarFondoAction(fd: FormData): Promise<Resultado> {
  try {
    const c = await ctx();
    const m = monto(fd.get("monto"));
    const motivo = texto(fd.get("motivo"), 1000);
    if (!m) return { ok: false, error: "Indica el monto que necesitas." };
    if (!motivo) return { ok: false, error: "Cuenta para qué es el fondo." };
    const p = await leerParametros(c.empresaId);
    if (p.bloquearConVencidos && (await tieneVencidos(c.empresaId, c.yo))) {
      return { ok: false, error: "Tienes un fondo vencido sin rendir: regularízalo antes de pedir otro." };
    }
    const f = await crearFondo({
      empresa_id: c.empresaId,
      rendidor_correo: c.yo,
      rendidor_nombre: c.usuario.nombre,
      origen: "solicitud",
      motivo,
      centro_costo: texto(fd.get("centroCosto"), 120),
      fecha_estimada: fecha(fd.get("fechaEstimada")),
      monto_solicitado: m,
      estado: "en_validacion",
      solicitado_por: c.yo,
    });
    await auditar("fondo", f.id, null, "en_validacion", c.yo, "Solicitud");
    await avisar(await correosConRol(c.empresaId, "validador"), c.yo, `Solicitud de fondo por validar: ${pesos(m)}`, `${f.rendidorNombre} · ${motivo}`, enlaceFondo(f.id), "solicitud", "alerta");
    return listo(f.id);
  } catch (e) {
    return fallo(e);
  }
}

export async function validarFondoAction(id: string, decision: "aprueba" | "rechaza", comentario?: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("validador")) return { ok: false, error: "Solo un validador puede resolver solicitudes." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    noPropio(f, c.yo, "validar");
    const nota = (comentario ?? "").trim().slice(0, 1000);
    if (decision === "rechaza") {
      if (!nota) return { ok: false, error: "Escribe el motivo del rechazo." };
      if (!(await transicion(f, ["en_validacion"], "rechazado", c.yo, { motivo_rechazo: nota }, nota))) return { ok: false, error: "La solicitud cambió mientras tanto." };
      await aprobacion("fondo", id, c.yo, "rechaza", nota);
      await avisar([f.rendidorCorreo], c.yo, `Rechazaron tu solicitud de fondo ${f.codigo}`, nota, enlaceFondo(id), "solicitud-rechazada", "alerta");
      return listo(id);
    }
    // Basta un validador (regla «cualquiera»).
    if (!(await transicion(f, ["en_validacion"], "validado", c.yo, {}, nota || null))) return { ok: false, error: "La solicitud cambió mientras tanto." };
    await aprobacion("fondo", id, c.yo, "aprueba", nota || null);
    await avisar(await correosConRol(c.empresaId, "asignador"), c.yo, `Fondo validado, por asignar: ${f.codigo}`, `${f.rendidorNombre} · ${pesos(f.montoSolicitado ?? 0)}`, enlaceFondo(id), "validado", "alerta");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Asignar: un fondo ya validado (fondoId) o uno directo (sin solicitud). Queda «por transferir»:
 * se avisa a quien rinde y a Tesorería.
 */
export async function asignarFondoAction(fd: FormData): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("asignador")) return { ok: false, error: "Solo un asignador puede asignar fondos." };
    const p = await leerParametros(c.empresaId);
    const m = monto(fd.get("monto"));
    if (!m) return { ok: false, error: "Indica el monto autorizado." };
    const esFijo = fd.get("esFijo") === "si";
    const plazo = Math.max(1, Math.min(365, Number(fd.get("plazoDias")) || p.plazoRendicionDias));
    const hoy = hoyEnSantiago().iso;
    const datos = {
      monto_autorizado: m,
      es_fijo: esFijo,
      monto_fijo: esFijo ? m : null,
      monto_por_transferir: m,
      asignado_por: c.yo,
      asignado_en: new Date().toISOString(),
      vence_en: sumarDias(hoy, plazo),
    };

    let f: Fondo;
    const fondoId = texto(fd.get("fondoId"), 60);
    if (fondoId) {
      f = await fondoDeEmpresa(fondoId, c.empresaId);
      noPropio(f, c.yo, "asignar");
      if (!(await transicion(f, ["validado"], "por_transferir", c.yo, datos, `Asignado ${pesos(m)}`))) return { ok: false, error: "El fondo cambió mientras tanto." };
    } else {
      const correo = String(fd.get("rendidorCorreo") ?? "").trim().toLowerCase();
      const persona = (await listarPersonas()).find((x) => x.correo === correo);
      if (!persona) return { ok: false, error: "Elige a quién se le asigna el fondo." };
      if (persona.correo === c.yo) return { ok: false, error: "No puedes asignarte un fondo a ti: tiene que hacerlo otra persona." };
      const motivo = texto(fd.get("motivo"), 1000);
      if (!motivo) return { ok: false, error: "Cuenta para qué es el fondo." };
      if (p.bloquearConVencidos && (await tieneVencidos(c.empresaId, correo))) return { ok: false, error: `${persona.nombre} tiene un fondo vencido sin rendir.` };
      const base = {
        empresa_id: c.empresaId,
        rendidor_correo: correo,
        rendidor_nombre: persona.nombre,
        origen: "directa",
        motivo,
        centro_costo: texto(fd.get("centroCosto"), 120),
        monto_solicitado: m,
        solicitado_por: c.yo,
      };
      // Sobre el umbral, la asignación directa también pasa por validación.
      if (p.umbralValidacionDirecta !== null && m > p.umbralValidacionDirecta) {
        f = await crearFondo({ ...base, estado: "en_validacion" });
        await auditar("fondo", f.id, null, "en_validacion", c.yo, "Asignación directa sobre el umbral");
        await avisar(await correosConRol(c.empresaId, "validador"), c.yo, `Fondo directo por validar: ${pesos(m)}`, `${persona.nombre} · ${motivo}`, enlaceFondo(f.id), "solicitud", "alerta");
        return listo(f.id);
      }
      f = await crearFondo({ ...base, ...datos, estado: "por_transferir" });
      await auditar("fondo", f.id, null, "por_transferir", c.yo, `Asignación directa ${pesos(m)}`);
    }
    await avisar([f.rendidorCorreo], c.yo, `Te asignaron un fondo: ${f.codigo} por ${pesos(m)}`, "Queda activo cuando Tesorería transfiera el dinero.", enlaceFondo(f.id), "asignado");
    await avisar(await correosConRol(c.empresaId, "tesoreria"), c.yo, `Fondo por transferir: ${pesos(m)}`, `${f.rendidorNombre} · ${f.codigo}`, enlaceFondo(f.id), "por-transferir", "alerta");
    return listo(f.id);
  } catch (e) {
    return fallo(e);
  }
}

/** Tesorería transfiere y marca el dinero disponible: el fondo queda ACTIVO. */
export async function transferirFondoAction(id: string, referencia: string, comprobante?: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("tesoreria")) return { ok: false, error: "Solo Tesorería transfiere fondos." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    noPropio(f, c.yo, "transferir");
    const ref = referencia.trim().slice(0, 120);
    if (!ref) return { ok: false, error: "Indica la referencia de la transferencia (N° de operación)." };
    const comp = comprobanteValido(comprobante, f.id);
    const m = f.montoPorTransferir ?? 0;
    const reposicion = f.ciclo > 1;
    const p = await leerParametros(c.empresaId);
    const hoy = hoyEnSantiago().iso;
    if (!(await transicion(f, ["por_transferir"], "activo", c.yo, { activado_en: new Date().toISOString(), monto_por_transferir: null, vence_en: sumarDias(hoy, p.plazoRendicionDias) }, `Ref. ${ref}`))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    if (m > 0) await registrarMovimiento(f, reposicion ? "REPOSICION" : "TRANSFERENCIA_FONDO", m, c.yo, { referenciaBanco: ref, comprobante: comp });
    await avisar([f.rendidorCorreo], c.yo, `Tu fondo ${f.codigo} está activo`, reposicion ? `Se repuso con ${pesos(m)}.` : `Ya puedes rendir: ${pesos(m)}.`, enlaceFondo(id), "activo");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

export async function anularFondoAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("asignador") && !c.tiene("administrador")) return { ok: false, error: "Solo un asignador o administración puede anular un fondo." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    const m = motivo.trim().slice(0, 1000);
    if (!m) return { ok: false, error: "Escribe el motivo de la anulación." };
    // Una reposición sin transferir vuelve a «cerrado con saldo»; lo demás se anula.
    const hacia = f.estado === "por_transferir" && f.ciclo > 1 ? "cerrado_con_saldo" : "anulado";
    if (!(await transicion(f, ["en_validacion", "validado", "por_transferir"], hacia, c.yo, { motivo_anulacion: m, monto_por_transferir: null }, m))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    await avisar([f.rendidorCorreo], c.yo, `Se anuló el fondo ${f.codigo}`, m, enlaceFondo(id), "anulado", "alerta");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Fase 3: saldo a favor, devolución y reposición -----------------------------

async function informesAbiertos(fondoId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("rendiciones")
    .select("id", { count: "exact", head: true })
    .eq("fondo_id", fondoId)
    .in("estado", ["borrador", "enviada", "rechazada", "aprobada", "reembolso_pendiente"]);
  return count ?? 0;
}

/** Quien rinde informa que devolvió el saldo; Tesorería lo confirma después. */
export async function informarDevolucionAction(id: string, referencia: string): Promise<Resultado> {
  try {
    const c = await ctx();
    const f = await fondoDeEmpresa(id, c.empresaId);
    if (f.rendidorCorreo !== c.yo) return { ok: false, error: "Solo quien rinde informa la devolución." };
    if (f.saldo <= 0) return { ok: false, error: "El fondo no tiene saldo a favor." };
    if (await informesAbiertos(id)) return { ok: false, error: "Tienes informes abiertos en este fondo: ciérralos antes de devolver el saldo." };
    const ref = referencia.trim().slice(0, 120);
    if (!ref) return { ok: false, error: "Indica la referencia de la transferencia con que devolviste." };
    if (!(await transicion(f, ["activo"], "devolucion_pendiente", c.yo, { devolucion_monto: f.saldo, devolucion_referencia: ref, devolucion_informada_en: new Date().toISOString() }, `Devuelve ${pesos(f.saldo)} · ref. ${ref}`))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    await avisar(await correosConRol(c.empresaId, "tesoreria"), c.yo, `Devolución por confirmar: ${pesos(f.saldo)}`, `${f.rendidorNombre} · ${f.codigo} · ref. ${ref}`, enlaceFondo(id), "devolucion", "alerta");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

export async function confirmarDevolucionAction(id: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("tesoreria")) return { ok: false, error: "Solo Tesorería confirma devoluciones." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    noPropio(f, c.yo, "confirmar la devolución de");
    const m = f.devolucionMonto ?? f.saldo;
    if (!(await transicion(f, ["devolucion_pendiente"], "cerrado", c.yo, { cerrado_en: new Date().toISOString() }, `Devolución confirmada ${pesos(m)}`))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    await registrarMovimiento(f, "DEVOLUCION_SALDO", m, c.yo, { referenciaBanco: f.devolucionReferencia });
    await avisar([f.rendidorCorreo], c.yo, `Se confirmó tu devolución: ${f.codigo} cerrado`, undefined, enlaceFondo(id), "devolucion-confirmada");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

/** Fondo fijo: el saldo queda a favor y el fondo se cierra hasta la reposición. */
export async function dejarSaldoAFavorAction(id: string): Promise<Resultado> {
  try {
    const c = await ctx();
    const f = await fondoDeEmpresa(id, c.empresaId);
    if (f.rendidorCorreo !== c.yo && !c.tiene("asignador")) return { ok: false, error: "No puedes hacer esto con este fondo." };
    if (!f.esFijo) return { ok: false, error: "Solo un fondo fijo puede quedar con saldo a favor." };
    if (f.saldo <= 0) return { ok: false, error: "El fondo no tiene saldo a favor." };
    if (await informesAbiertos(id)) return { ok: false, error: "Hay informes abiertos en este fondo: ciérralos primero." };
    if (!(await transicion(f, ["activo"], "cerrado_con_saldo", c.yo, { cerrado_en: new Date().toISOString() }, `Saldo a favor ${pesos(f.saldo)}`))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    await avisar(await correosConRol(c.empresaId, "asignador"), c.yo, `Fondo fijo por reponer: ${f.codigo}`, `${f.rendidorNombre} · saldo a favor ${pesos(f.saldo)}`, enlaceFondo(id), "por-reponer", "alerta");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

/** Reposición de un fondo fijo: Tesorería transferirá SOLO la diferencia hasta el monto fijo. */
export async function reponerFondoAction(id: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("asignador")) return { ok: false, error: "Solo un asignador crea reposiciones." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    noPropio(f, c.yo, "reponer");
    const diferencia = Math.max(0, (f.montoFijo ?? f.montoAutorizado ?? 0) - f.saldo);
    const hacia = diferencia > 0 ? "por_transferir" : "activo";
    if (!(await transicion(f, ["cerrado_con_saldo"], hacia, c.yo, { monto_por_transferir: diferencia || null, ciclo: f.ciclo + 1, cerrado_en: null, asignado_por: c.yo, asignado_en: new Date().toISOString() }, `Reposición ${pesos(diferencia)}`))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    if (diferencia > 0) {
      await avisar(await correosConRol(c.empresaId, "tesoreria"), c.yo, `Reposición por transferir: ${pesos(diferencia)}`, `${f.rendidorNombre} · ${f.codigo} (solo la diferencia)`, enlaceFondo(id), "reposicion", "alerta");
    }
    await avisar([f.rendidorCorreo], c.yo, `Se repone tu fondo ${f.codigo}`, diferencia > 0 ? `Tesorería transferirá ${pesos(diferencia)}.` : "Ya estaba completo: queda activo.", enlaceFondo(id), "reposicion");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

/** Tesorería paga el exceso de un informe: el fondo vuelve a cero y se cierra. */
export async function pagarReembolsoAction(informeId: string, referencia: string, comprobante?: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("tesoreria")) return { ok: false, error: "Solo Tesorería paga reembolsos." };
    const r = await obtenerRendicion(informeId);
    if (!r?.fondoId || r.estado !== "reembolso_pendiente") return { ok: false, error: "Ese informe no tiene un reembolso pendiente." };
    const f = await fondoDeEmpresa(r.fondoId, c.empresaId);
    noPropio(f, c.yo, "reembolsar");
    const ref = referencia.trim().slice(0, 120);
    if (!ref) return { ok: false, error: "Indica la referencia de la transferencia." };
    const comp = comprobanteValido(comprobante, f.id);
    const exceso = -f.saldo;
    if (exceso <= 0) return { ok: false, error: "El fondo ya no tiene exceso por reembolsar." };
    const { data, error } = await supabaseAdmin
      .from("rendiciones")
      .update({ estado: "cerrada", cerrada_en: new Date().toISOString(), pagada_por: c.yo, pagada_en: new Date().toISOString(), nota_pago: `Reembolso ref. ${ref}` })
      .eq("id", informeId)
      .eq("estado", "reembolso_pendiente")
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "El informe cambió mientras tanto." };
    await registrarMovimiento(f, "REEMBOLSO", exceso, c.yo, { informeId, referenciaBanco: ref, comprobante: comp });
    await auditar("informe", informeId, "reembolso_pendiente", "reembolsada", c.yo, `Ref. ${ref}`);
    await auditar("informe", informeId, "reembolsada", "cerrada", c.yo);
    await transicion(f, ["activo"], "cerrado", c.yo, { cerrado_en: new Date().toISOString() }, "Reembolsado");
    await avisar([f.rendidorCorreo], c.yo, `Te reembolsaron ${pesos(exceso)}`, `${r.tituloRendicion} · ref. ${ref}`, `/rendir-gastos/${informeId}`, "reembolsado");
    return listo(informeId);
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Libro: conciliación y ajustes -------------------------------------------------

export async function conciliarAction(movimientoId: string, conciliado: boolean): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("tesoreria") && !c.tiene("administrador")) return { ok: false, error: "Solo Tesorería o administración concilian." };
    await marcarConciliado(c.empresaId, movimientoId, conciliado);
    return listo();
  } catch (e) {
    return fallo(e);
  }
}

export async function ajusteAction(fondoId: string, fd: FormData): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("administrador")) return { ok: false, error: "Solo administración registra ajustes." };
    const f = await fondoDeEmpresa(fondoId, c.empresaId);
    const m = monto(fd.get("monto"));
    const motivo = texto(fd.get("motivo"), 1000);
    if (!m || !motivo) return { ok: false, error: "Indica el monto y el motivo del ajuste." };
    const signo = fd.get("signo") === "-" ? -1 : 1;
    await registrarMovimiento(f, "AJUSTE", m, c.yo, { signo, motivo });
    await auditar("fondo", f.id, f.estado, f.estado, c.yo, `Ajuste ${signo > 0 ? "+" : "−"}${pesos(m)}: ${motivo}`);
    return listo(fondoId);
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Configuración ------------------------------------------------------------------

export async function ponerRolAction(correo: string, rol: string, activo: boolean): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("administrador")) return { ok: false, error: "Solo administración reparte los roles." };
    if (!ROLES_FONDOS.some((r) => r.rol === rol)) return { ok: false, error: "Ese rol no existe." };
    if (!(await listarPersonas()).some((p) => p.correo === correo.toLowerCase())) return { ok: false, error: "Esa persona no es un usuario activo." };
    await ponerRol(c.empresaId, correo, rol as RolFondos, activo);
    return listo();
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarParametrosAction(fd: FormData): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("administrador")) return { ok: false, error: "Solo administración cambia los parámetros." };
    const pct = Number(String(fd.get("umbral") ?? "90").replace(",", "."));
    const umbralDirecta = monto(fd.get("umbralDirecta"));
    await guardarParametros(c.empresaId, {
      umbralAvisoLimite: Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct / 100 : 0.9,
      plazoRendicionDias: Math.max(1, Math.min(365, Number(fd.get("plazo")) || 30)),
      maxInformesAbiertos: Math.max(1, Math.min(10, Number(fd.get("maxInformes")) || 1)),
      bloquearConVencidos: fd.get("bloquear") === "si",
      umbralValidacionDirecta: umbralDirecta,
    });
    return listo();
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Administración cierra un fondo activo con un ajuste que deja el saldo en cero (con motivo).
 * Para regularizar fondos que no se van a rendir (p. ej. pruebas o errores de asignación).
 */
export async function cerrarConAjusteAction(id: string, motivo: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("administrador")) return { ok: false, error: "Solo administración cierra fondos con ajuste." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    if (f.estado !== "activo") return { ok: false, error: "Solo se cierra con ajuste un fondo activo." };
    if (await informesAbiertos(id)) return { ok: false, error: "El fondo tiene informes abiertos: ciérralos o bórralos primero." };
    const m = motivo.trim().slice(0, 1000);
    if (!m) return { ok: false, error: "Escribe el motivo del ajuste." };
    if (f.saldo !== 0) await registrarMovimiento(f, "AJUSTE", Math.abs(f.saldo), c.yo, { signo: f.saldo > 0 ? -1 : 1, motivo: m });
    if (!(await transicion(f, ["activo"], "cerrado", c.yo, { cerrado_en: new Date().toISOString() }, `Cierre con ajuste ${pesos(-f.saldo)}: ${m}`))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Conciliación de gastos validados ---------------------------------------------

const INFORME_VALIDADO = ["aprobada", "pagada", "cargada_odoo", "reembolso_pendiente", "reembolsada", "cerrada"];

/** Las facturas recibidas que podrían ser la de este gasto (para conciliarlo). */
export async function facturasCandidatasAction(informeId: string, gastoId: string): Promise<{ ok: true; facturas: FacturaCandidata[] } | { ok: false; error: string }> {
  try {
    const c = await ctx();
    if (!c.tiene("tesoreria") && !c.tiene("administrador")) return { ok: false, error: "Solo Tesorería o administración concilian." };
    const r = await obtenerRendicion(informeId);
    const g = r?.gastos.find((x) => x.id === gastoId);
    if (!r || !g) return { ok: false, error: "No encontramos ese gasto." };
    return { ok: true, facturas: await facturasCandidatas(r.empresaId ?? c.empresaId, g.rutProveedor, g.numeroDocumento) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ocurrió un error inesperado." };
  }
}

/**
 * Concilia un gasto de un informe aprobado. Una factura exige ligarla a la factura recibida (o,
 * si no está registrada en Finanzas, dejar escrito por qué); el resto, un clic. `deshacer` lo
 * devuelve a «por conciliar».
 */
export async function conciliarGastoAction(informeId: string, gastoId: string, datos: { documentoId?: string | null; nota?: string; deshacer?: boolean }): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("tesoreria") && !c.tiene("administrador")) return { ok: false, error: "Solo Tesorería o administración concilian." };
    const r = await obtenerRendicion(informeId);
    const g = r?.gastos.find((x) => x.id === gastoId);
    if (!r || !g) return { ok: false, error: "No encontramos ese gasto." };
    if (!INFORME_VALIDADO.includes(r.estado) || (g.revision?.estado ?? "cargada") !== "aceptada") return { ok: false, error: "Solo se concilian gastos validados de un informe aprobado." };
    if (r.rindeCorreo?.toLowerCase() === c.yo && !c.tiene("administrador")) return { ok: false, error: "No puedes conciliar tus propios gastos: tiene que hacerlo otra persona." };

    let conciliacion: NonNullable<typeof g.conciliacion> | null = null;
    if (!datos.deshacer) {
      const nota = (datos.nota ?? "").trim().slice(0, 500) || null;
      let documentoRef: string | null = null;
      if (datos.documentoId) {
        const { data } = await supabaseAdmin.from("fin_documentos").select("folio, razon_social").eq("id", datos.documentoId).eq("direccion", "recibido").maybeSingle();
        if (!data) return { ok: false, error: "No encontramos esa factura." };
        documentoRef = `Factura ${data.folio}${data.razon_social ? ` · ${data.razon_social}` : ""}`;
      } else if (esFactura(g.tipoDocumento) && !nota) {
        return { ok: false, error: "Una factura se concilia con la factura recibida: elígela, o escribe por qué no está en Finanzas." };
      }
      conciliacion = { por: c.yo, en: new Date().toISOString(), documentoId: datos.documentoId ?? null, documentoRef, nota };
    }
    const gastos = r.gastos.map((x) => (x.id === gastoId ? { ...x, conciliacion } : x));
    const { error } = await supabaseAdmin.from("rendiciones").update({ gastos, actualizado_en: new Date().toISOString() }).eq("id", informeId);
    if (error) throw new Error(error.message);
    await auditar("informe", informeId, r.estado, r.estado, c.yo, `${datos.deshacer ? "Deshizo la conciliación" : "Concilió"}: ${g.proveedor || "gasto"}`);
    return listo();
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Saldo a favor: cargar el fondo que ya tiene, o pedir que lo devuelva ----------------

/**
 * En vez de crear otro fondo a quien ya tiene saldo a favor, se le carga el nuevo monto a ESTE: Tesorería
 * transfiere solo la diferencia y el fondo vuelve a empezar su plazo. `montoTotal` es lo que debe quedar disponible.
 */
export async function cargarFondoAction(id: string, montoTotal: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("asignador")) return { ok: false, error: "Solo un asignador carga fondos." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    noPropio(f, c.yo, "cargar");
    if (f.estado !== "activo") return { ok: false, error: "Solo se carga un fondo activo." };
    if (await informesAbiertos(id)) return { ok: false, error: "Tiene informes abiertos: espera a que se cierren para cargarlo." };
    const total = monto(montoTotal);
    if (!total) return { ok: false, error: "Indica cuánto debe quedar disponible en el fondo." };
    const diferencia = total - f.saldo;
    if (diferencia <= 0) return { ok: false, error: `El fondo ya tiene ${pesos(f.saldo)}: indica un monto mayor.` };
    if (!(await transicion(f, ["activo"], "por_transferir", c.yo, { monto_por_transferir: diferencia, monto_autorizado: total, ciclo: f.ciclo + 1, asignado_por: c.yo, asignado_en: new Date().toISOString() }, `Carga al fondo existente: total ${pesos(total)}, a transferir ${pesos(diferencia)} (saldo a favor ${pesos(f.saldo)})`))) {
      return { ok: false, error: "El fondo cambió mientras tanto." };
    }
    await avisar(await correosConRol(c.empresaId, "tesoreria"), c.yo, `Carga por transferir: ${pesos(diferencia)}`, `${f.rendidorNombre} · ${f.codigo} (solo la diferencia; ya tenía ${pesos(f.saldo)})`, enlaceFondo(id), "reposicion", "alerta");
    await avisar([f.rendidorCorreo], c.yo, `Te cargaron tu fondo ${f.codigo}`, `Quedará con ${pesos(total)}: Tesorería transfiere ${pesos(diferencia)}, el resto es tu saldo a favor.`, enlaceFondo(id), "reposicion");
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}

/** Quien asigna le pide a la persona que devuelva su saldo a favor (le llega el aviso con el enlace al fondo). */
export async function pedirDevolucionAction(id: string): Promise<Resultado> {
  try {
    const c = await ctx();
    if (!c.tiene("asignador")) return { ok: false, error: "Solo un asignador pide devoluciones." };
    const f = await fondoDeEmpresa(id, c.empresaId);
    if (f.estado !== "activo" || f.saldo <= 0) return { ok: false, error: "El fondo no tiene saldo a favor." };
    await avisar([f.rendidorCorreo], c.yo, `Te piden devolver tu saldo a favor: ${pesos(f.saldo)}`, `${f.codigo} · devuélvelo a la empresa y registra la referencia de la transferencia desde el fondo.`, enlaceFondo(id), "pedir-devolucion", "alerta");
    await auditar("fondo", id, f.estado, f.estado, c.yo, `Pidió devolver el saldo a favor de ${pesos(f.saldo)}`);
    return listo(id);
  } catch (e) {
    return fallo(e);
  }
}
