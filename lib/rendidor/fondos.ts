import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import { crearNotificacion } from "../buzon";
import { hoyEnSantiago } from "../graph-calendario";
import type { UsuarioConAcceso } from "../tipos";
import {
  PARAMETROS_POR_OMISION,
  SIGNO_MOVIMIENTO,
  CON_BANCO,
  estaVencido,
  pesos,
  type EstadoFondo,
  type Fondo,
  type Movimiento,
  type Parametros,
  type RolFondos,
  type TipoMovimiento,
} from "./fondos-modelo";

// -----------------------------------------------------------------------------
//  Fondos por rendir: datos y la ÚNICA puerta para cambiarles el estado.
//
//  Toda transición pasa por `transicion()`: valida el estado de origen en el mismo UPDATE (si
//  dos personas aprietan a la vez gana la primera), y quien llama registra el movimiento del
//  libro, la auditoría y los avisos. El saldo de un fondo nunca se guarda: es la suma del libro.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function revienta(que: string, error: { message: string } | null): void {
  if (!error) return;
  if (/rg_fondos|rg_movimientos|rg_roles|rg_parametros|rg_auditoria|rg_aprobaciones|fondo_id/.test(error.message)) {
    throw new Error("Faltan las tablas de Fondos en la base: corre el SQL supabase/rendir-gastos/0002_fondos.sql.");
  }
  throw new Error(`No se pudo ${que}: ${error.message}`);
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function aFondo(r: any, libro: { saldo: number; transferido: number; gastado: number }): Fondo {
  return {
    id: r.id,
    empresaId: r.empresa_id,
    codigo: r.codigo,
    rendidorCorreo: r.rendidor_correo,
    rendidorNombre: r.rendidor_nombre || String(r.rendidor_correo).split("@")[0],
    origen: r.origen,
    motivo: r.motivo,
    centroCosto: r.centro_costo,
    fechaEstimada: r.fecha_estimada,
    montoSolicitado: n(r.monto_solicitado),
    montoAutorizado: n(r.monto_autorizado),
    esFijo: !!r.es_fijo,
    montoFijo: n(r.monto_fijo),
    montoPorTransferir: n(r.monto_por_transferir),
    estado: r.estado,
    solicitadoPor: r.solicitado_por,
    asignadoPor: r.asignado_por,
    asignadoEn: r.asignado_en,
    activadoEn: r.activado_en,
    venceEn: r.vence_en,
    cerradoEn: r.cerrado_en,
    motivoRechazo: r.motivo_rechazo,
    motivoAnulacion: r.motivo_anulacion,
    devolucionMonto: n(r.devolucion_monto),
    devolucionReferencia: r.devolucion_referencia,
    ciclo: Number(r.ciclo ?? 1),
    creadoEn: r.creado_en,
    archivadoEn: r.archivado_en ?? null,
    ...libro,
  };
}

const aMovimiento = (r: any): Movimiento => ({
  id: r.id,
  fondoId: r.fondo_id,
  informeId: r.informe_id,
  boletaId: r.boleta_id,
  tipo: r.tipo,
  monto: Number(r.monto),
  signo: Number(r.signo) as 1 | -1,
  saldoResultante: Number(r.saldo_resultante),
  usuario: r.usuario,
  fecha: r.fecha,
  referenciaBanco: r.referencia_banco,
  comprobante: r.comprobante,
  estadoConciliacion: r.estado_conciliacion,
  motivo: r.motivo,
});

// ---------- Roles y parámetros ----------------------------------------------------

/**
 * Los roles de esta persona en el módulo. El admin del Core y el «Administrador de gastos» de
 * siempre tienen todos (así nadie queda bloqueado mientras se reparten los roles); la regla de
 * no aprobar lo propio se aplica igual.
 */
export async function rolesDe(usuario: UsuarioConAcceso, esAdminModulo: boolean, empresaId: string): Promise<RolFondos[]> {
  if (usuario.rol === "admin" || esAdminModulo) return ["validador", "asignador", "tesoreria", "revisor", "administrador"];
  const { data, error } = await supabaseAdmin.from("rg_roles").select("rol").eq("empresa_id", empresaId).eq("correo", usuario.correo.toLowerCase());
  if (error) return [];
  return (data ?? []).map((r) => r.rol as RolFondos);
}

/** A quiénes avisar de una tarea de un rol. Sin nadie con ese rol: a los admin del Core. */
export async function correosConRol(empresaId: string, rol: RolFondos): Promise<string[]> {
  const { data } = await supabaseAdmin.from("rg_roles").select("correo").eq("empresa_id", empresaId).eq("rol", rol);
  const con = (data ?? []).map((r) => String(r.correo).toLowerCase());
  if (con.length) return con;
  const { data: admins } = await supabaseAdmin.from("usuarios").select("correo").eq("activo", true).eq("rol", "admin");
  return (admins ?? []).map((u) => String(u.correo).toLowerCase());
}

export async function listarRoles(empresaId: string): Promise<{ correo: string; rol: RolFondos }[]> {
  const { data, error } = await supabaseAdmin.from("rg_roles").select("correo, rol").eq("empresa_id", empresaId);
  revienta("leer los roles", error);
  return (data ?? []).map((r) => ({ correo: String(r.correo), rol: r.rol as RolFondos }));
}

export async function ponerRol(empresaId: string, correo: string, rol: RolFondos, activo: boolean): Promise<void> {
  const c = correo.toLowerCase();
  const { error } = activo
    ? await supabaseAdmin.from("rg_roles").upsert({ empresa_id: empresaId, correo: c, rol })
    : await supabaseAdmin.from("rg_roles").delete().eq("empresa_id", empresaId).eq("correo", c).eq("rol", rol);
  revienta("guardar el rol", error);
}

export async function leerParametros(empresaId: string): Promise<Parametros> {
  const { data, error } = await supabaseAdmin.from("rg_parametros").select("*").eq("empresa_id", empresaId).maybeSingle();
  if (error || !data) return PARAMETROS_POR_OMISION;
  return {
    umbralAvisoLimite: Number(data.umbral_aviso_limite),
    plazoRendicionDias: Number(data.plazo_rendicion_dias),
    maxInformesAbiertos: Number(data.max_informes_abiertos),
    bloquearConVencidos: !!data.bloquear_con_vencidos,
    umbralValidacionDirecta: n(data.umbral_validacion_directa),
  };
}

export async function guardarParametros(empresaId: string, p: Parametros): Promise<void> {
  const { error } = await supabaseAdmin.from("rg_parametros").upsert({
    empresa_id: empresaId,
    umbral_aviso_limite: p.umbralAvisoLimite,
    plazo_rendicion_dias: p.plazoRendicionDias,
    max_informes_abiertos: p.maxInformesAbiertos,
    bloquear_con_vencidos: p.bloquearConVencidos,
    umbral_validacion_directa: p.umbralValidacionDirecta,
    actualizado_en: new Date().toISOString(),
  });
  revienta("guardar los parámetros", error);
}

// ---------- Libro ------------------------------------------------------------------

async function libroDe(ids: string[]): Promise<Map<string, { saldo: number; transferido: number; gastado: number }>> {
  const m = new Map<string, { saldo: number; transferido: number; gastado: number }>();
  if (!ids.length) return m;
  const { data, error } = await supabaseAdmin.from("rg_movimientos").select("fondo_id, tipo, monto, signo").in("fondo_id", ids);
  revienta("leer el libro", error);
  for (const r of data ?? []) {
    const x = m.get(r.fondo_id) ?? { saldo: 0, transferido: 0, gastado: 0 };
    const v = Number(r.monto) * Number(r.signo);
    x.saldo += v;
    if (r.tipo === "TRANSFERENCIA_FONDO" || r.tipo === "REPOSICION" || r.tipo === "REEMBOLSO") x.transferido += Number(r.monto);
    if (r.tipo === "GASTO") x.gastado += Number(r.monto);
    m.set(r.fondo_id, x);
  }
  return m;
}

export async function saldoDe(fondoId: string): Promise<number> {
  return (await libroDe([fondoId])).get(fondoId)?.saldo ?? 0;
}

/** Agrega un movimiento al libro con el saldo que deja. Nunca se edita ni se borra después. */
export async function registrarMovimiento(
  fondo: Pick<Fondo, "id" | "empresaId">,
  tipo: TipoMovimiento,
  monto: number,
  usuario: string,
  extra: { informeId?: string | null; boletaId?: string | null; signo?: 1 | -1; referenciaBanco?: string | null; comprobante?: string | null; motivo?: string | null } = {},
): Promise<number> {
  const signo = extra.signo ?? (tipo in SIGNO_MOVIMIENTO ? SIGNO_MOVIMIENTO[tipo as keyof typeof SIGNO_MOVIMIENTO] : 1);
  const valor = Math.round(Math.abs(monto));
  const saldo = (await saldoDe(fondo.id)) + signo * valor;
  const { error } = await supabaseAdmin.from("rg_movimientos").insert({
    empresa_id: fondo.empresaId,
    fondo_id: fondo.id,
    informe_id: extra.informeId ?? null,
    boleta_id: extra.boletaId ?? null,
    tipo,
    monto: valor,
    signo,
    saldo_resultante: saldo,
    usuario: usuario.toLowerCase(),
    referencia_banco: extra.referenciaBanco ?? null,
    comprobante: extra.comprobante ?? null,
    estado_conciliacion: CON_BANCO.includes(tipo) ? "pendiente" : "no_aplica",
    motivo: extra.motivo ?? null,
  });
  revienta("registrar el movimiento", error);
  return saldo;
}

export async function movimientosDe(filtro: { fondoId?: string; empresaId?: string; soloPendientes?: boolean }): Promise<Movimiento[]> {
  let q = supabaseAdmin.from("rg_movimientos").select("*").order("fecha", { ascending: false }).limit(500);
  if (filtro.fondoId) q = q.eq("fondo_id", filtro.fondoId);
  if (filtro.empresaId) q = q.eq("empresa_id", filtro.empresaId);
  if (filtro.soloPendientes) q = q.eq("estado_conciliacion", "pendiente");
  const { data, error } = await q;
  revienta("leer el libro", error);
  return (data ?? []).map(aMovimiento);
}

export async function marcarConciliado(empresaId: string, id: string, conciliado: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("rg_movimientos")
    .update({ estado_conciliacion: conciliado ? "conciliado" : "pendiente" })
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .neq("estado_conciliacion", "no_aplica");
  revienta("conciliar el movimiento", error);
}

// ---------- Fondos -------------------------------------------------------------------

export async function listarFondos(empresaId: string, filtro: { rendidor?: string; estados?: EstadoFondo[]; archivados?: "sin" | "con" | "solo" } = {}): Promise<Fondo[]> {
  let q = supabaseAdmin.from("rg_fondos").select("*").eq("empresa_id", empresaId).order("creado_en", { ascending: false }).limit(500);
  if (filtro.rendidor) q = q.eq("rendidor_correo", filtro.rendidor.toLowerCase());
  if (filtro.estados?.length) q = q.in("estado", filtro.estados);
  const { data, error } = await q;
  revienta("leer los fondos", error);
  // El archivado se filtra acá y no en la consulta: sin el SQL de archivar la columna no existe y la consulta fallaría.
  const modo = filtro.archivados ?? "sin";
  const filas = (data ?? []).filter((r) => (modo === "con" ? true : modo === "solo" ? Boolean(r.archivado_en) : !r.archivado_en));
  const libro = await libroDe(filas.map((r) => r.id));
  return filas.map((r) => aFondo(r, libro.get(r.id) ?? { saldo: 0, transferido: 0, gastado: 0 }));
}

/** Los ids de los fondos archivados de la empresa (vacío si todavía no se corrió el SQL de archivar). */
export async function idsFondosArchivados(empresaId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("rg_fondos").select("id").eq("empresa_id", empresaId).not("archivado_en", "is", null);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.id as string));
}

export async function obtenerFondo(id: string): Promise<Fondo | null> {
  const { data, error } = await supabaseAdmin.from("rg_fondos").select("*").eq("id", id).maybeSingle();
  revienta("leer el fondo", error);
  if (!data) return null;
  const libro = await libroDe([id]);
  return aFondo(data, libro.get(id) ?? { saldo: 0, transferido: 0, gastado: 0 });
}

export async function crearFondo(fila: Record<string, unknown>): Promise<Fondo> {
  const { data: num, error: e1 } = await supabaseAdmin.rpc("fin_siguiente_numero", { p_empresa: fila.empresa_id, p_tipo: "rg_fondo" });
  revienta("numerar el fondo", e1);
  const { data, error } = await supabaseAdmin
    .from("rg_fondos")
    .insert({ ...fila, codigo: `FR-${String(num).padStart(4, "0")}` })
    .select("*")
    .single();
  revienta("crear el fondo", error);
  return aFondo(data, { saldo: 0, transferido: 0, gastado: 0 });
}

/**
 * La transición: pasa el fondo a `hacia` SOLO si está en uno de `desde` (en el mismo UPDATE) y
 * deja la auditoría. Devuelve false si el fondo ya había cambiado.
 */
export async function transicion(
  fondo: Pick<Fondo, "id" | "estado">,
  desde: EstadoFondo[],
  hacia: EstadoFondo,
  usuario: string,
  extra: Record<string, unknown> = {},
  comentario?: string | null,
): Promise<boolean> {
  if (!desde.includes(fondo.estado)) throw new Error(`El fondo está «${fondo.estado}»: ese paso no corresponde.`);
  const { data, error } = await supabaseAdmin
    .from("rg_fondos")
    .update({ estado: hacia, ...extra, actualizado_en: new Date().toISOString() })
    .eq("id", fondo.id)
    .in("estado", desde)
    .select("id");
  revienta("cambiar el estado del fondo", error);
  if (!data?.length) return false;
  await auditar("fondo", fondo.id, fondo.estado, hacia, usuario, comentario);
  return true;
}

export async function auditar(entidad: "fondo" | "informe", id: string, desde: string | null, hacia: string, usuario: string, comentario?: string | null) {
  const { error } = await supabaseAdmin.from("rg_auditoria").insert({ entidad, entidad_id: id, desde, hacia, usuario: usuario.toLowerCase(), comentario: comentario ?? null });
  if (error) console.error("[fondos] auditoría:", error.message);
}

export async function aprobacion(entidad: "fondo" | "informe", id: string, aprobador: string, decision: "aprueba" | "rechaza" | "observa", comentario?: string | null) {
  const { error } = await supabaseAdmin.from("rg_aprobaciones").insert({ entidad, entidad_id: id, aprobador: aprobador.toLowerCase(), decision, comentario: comentario ?? null });
  if (error) console.error("[fondos] aprobación:", error.message);
}

export async function historialDe(entidad: "fondo" | "informe", id: string) {
  const { data } = await supabaseAdmin.from("rg_auditoria").select("desde, hacia, usuario, comentario, fecha").eq("entidad", entidad).eq("entidad_id", id).order("fecha", { ascending: false });
  return (data ?? []) as { desde: string | null; hacia: string; usuario: string; comentario: string | null; fecha: string }[];
}

/** ¿Tiene esta persona un fondo activo vencido? (bloquea pedir o recibir otro) */
export async function tieneVencidos(empresaId: string, correo: string): Promise<boolean> {
  const hoy = hoyEnSantiago().iso;
  const fs = await listarFondos(empresaId, { rendidor: correo, estados: ["activo"] });
  return fs.some((f) => estaVencido(f, hoy));
}

// ---------- Avisos -----------------------------------------------------------------

/** Aviso a la campana. Si el buzón falla, el paso igual quedó hecho. */
export async function avisar(para: string[], actor: string, titulo: string, cuerpo: string | undefined, enlace: string, tipo: string, severidad: "info" | "alerta" = "info") {
  const marca = Date.now();
  await Promise.all(
    [...new Set(para.map((c) => c.toLowerCase()))]
      .filter((c) => c && c !== actor.toLowerCase())
      .map((destinatario) =>
        crearNotificacion({ modulo: "rendir-gastos", tipo, titulo, cuerpo, enlace, severidad, clave: `fondo:${tipo}:${enlace}:${destinatario}:${marca}`, destinatario }).catch(() => false),
      ),
  );
}

export const enlaceFondo = (id: string) => `/rendir-gastos/fondos/${id}`;
export { pesos };

/**
 * Fondos ACTIVOS que quedaron con saldo a favor: ya se cerró al menos un informe y no hay otro abierto.
 * Son los que quien asigna puede cargar con el nuevo monto (en vez de crear otro fondo) o pedir devolver.
 */
export async function fondosConSaldoAFavor(empresaId: string): Promise<Fondo[]> {
  const activos = (await listarFondos(empresaId, { estados: ["activo"] })).filter((f) => f.saldo > 0);
  if (!activos.length) return [];
  const { data } = await supabaseAdmin.from("rendiciones").select("fondo_id, estado").in("fondo_id", activos.map((f) => f.id));
  const cerrado = new Set<string>();
  const abierto = new Set<string>();
  for (const r of data ?? []) {
    const id = r.fondo_id as string;
    if (r.estado === "cerrada") cerrado.add(id);
    if (["borrador", "enviada", "rechazada", "aprobada", "reembolso_pendiente"].includes(r.estado as string)) abierto.add(id);
  }
  return activos.filter((f) => cerrado.has(f.id) && !abierto.has(f.id));
}
