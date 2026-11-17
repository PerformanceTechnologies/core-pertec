import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { reglaQueCalza, type ReglaCategoria } from "./reglas";
import { ErrorEmisso, estadoConexionItau, movimientosItau, saldosItau } from "./emisso";
import {
  HORAS_DATO_VIEJO,
  SISTEMA_ITAU,
  cambiosDeFila,
  cuentasConMovimientos,
  horasDesde,
  nombreCuenta,
  numeroEnmascarado,
  origenDe,
  periodosRecientes,
  requierePersona,
  rutNormalizado,
  saldosVigentes,
  traducirMovimientos,
  type FilaBanco,
} from "./banco-emisso-modelo";

// -----------------------------------------------------------------------------
//  Banco automático: trae lo que Emisso ya leyó de Itaú y lo deja en Tesorería.
//
//  · NO concilia: deja los movimientos «por aclarar» (o categorizados por las reglas, igual que la cartola manual).
//    Ligar un abono a un cobro o un cargo a un pago lo sigue confirmando una persona.
//  · Una fila ya guardada solo se actualiza en glosa, N° y RUT. Fecha y monto no se tocan: podría estar conciliada.
//  · La empresa se resuelve por el RUT de la conexión en Emisso, no por configuración: una clave de otra empresa no
//    puede escribir en ésta.
// -----------------------------------------------------------------------------

const BANCO = "Itaú";
const QUIEN = "Emisso (automático)";

export interface ResultadoSincronizacion {
  ok: boolean;
  empresaId: string | null;
  nuevos: number;
  actualizados: number;
  omitidos: number;
  saldos: number;
  /** Cuándo leyó Emisso el banco por última vez (no cuándo corrió el Core). */
  datosAl: string | null;
  advertencias: string[];
  /** true si el problema lo tiene que resolver una persona (clave rechazada o bloqueada): no se reintenta. */
  requierePersona: boolean;
  mensaje?: string;
}

async function empresaPorRut(rut: string): Promise<string> {
  const buscado = rutNormalizado(rut);
  const { data, error } = await supabaseAdmin.from("empresas").select("id, rut");
  if (error) throw new Error(`No se pudieron leer las empresas: ${error.message}`);
  const e = (data ?? []).find((x: { rut: string | null }) => rutNormalizado(x.rut) === buscado);
  if (!e) throw new Error(`Ninguna empresa del Core tiene el RUT ${rut} de la conexión de Emisso.`);
  return e.id as string;
}

/** La cuenta de Tesorería vinculada a cada número de cuenta del banco; la crea la primera vez. */
async function cuentasVinculadas(empresaId: string, numeros: string[]): Promise<Map<string, string>> {
  const porNumero = new Map<string, string>();
  const origenes = numeros.map((n) => origenDe(SISTEMA_ITAU, n));
  if (!origenes.length) return porNumero;
  const { data, error } = await supabaseAdmin.from("fin_cuentas").select("id, origen_externo").eq("empresa_id", empresaId).in("origen_externo", origenes);
  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`);
  for (const c of data ?? []) porNumero.set(String(c.origen_externo).split(":").pop()!, c.id as string);
  for (const numero of numeros) {
    if (porNumero.has(numero)) continue;
    const base = { empresa_id: empresaId, tipo: "banco", banco: BANCO, numero_enmascarado: numeroEnmascarado(numero), origen_externo: origenDe(SISTEMA_ITAU, numero) };
    let r = await supabaseAdmin.from("fin_cuentas").insert({ ...base, nombre: nombreCuenta(BANCO, numero) }).select("id").single();
    // El nombre corto ya lo usa otra cuenta (unique empresa + nombre): se usa el número completo.
    if (r.error?.code === "23505") r = await supabaseAdmin.from("fin_cuentas").insert({ ...base, nombre: `${BANCO} ${numero}` }).select("id").single();
    if (r.error) throw new Error(`No se pudo crear la cuenta ${BANCO} ${numero}: ${r.error.message}`);
    porNumero.set(numero, r.data.id as string);
  }
  return porNumero;
}

async function reglasDe(empresaId: string): Promise<{ reglas: ReglaCategoria[]; sinProyecto: Set<string> }> {
  const [rR, cR] = await Promise.all([
    supabaseAdmin.from("fin_reglas").select("id, cuenta_id, patron, monto_min, monto_max, categoria_id, proyecto_id, prioridad, activa").eq("empresa_id", empresaId),
    supabaseAdmin.from("fin_categorias").select("id, requiere_proyecto").eq("empresa_id", empresaId),
  ]);
  if (rR.error) throw new Error(`No se pudieron leer las reglas: ${rR.error.message}`);
  if (cR.error) throw new Error(`No se pudieron leer las categorías: ${cR.error.message}`);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  type FilaRegla = { id: string; cuenta_id: string | null; patron: string; monto_min: unknown; monto_max: unknown; categoria_id: string; proyecto_id: string | null; prioridad: number; activa: boolean };
  const reglas: ReglaCategoria[] = ((rR.data ?? []) as FilaRegla[]).map((r) => ({
    id: r.id, cuentaId: r.cuenta_id, patron: r.patron, montoMin: num(r.monto_min), montoMax: num(r.monto_max), categoriaId: r.categoria_id,
    proyectoId: r.proyecto_id, prioridad: r.prioridad, activa: r.activa,
  }));
  return { reglas, sinProyecto: new Set(((cR.data ?? []) as { id: string; requiere_proyecto: boolean }[]).filter((c) => !c.requiere_proyecto).map((c) => c.id)) };
}

type Guardada = { id: string; clave_externa: string; glosa: string; numero_documento: string | null; contraparte_rut: string | null };

async function yaGuardadas(empresaId: string, claves: string[]): Promise<Map<string, Guardada>> {
  const m = new Map<string, Guardada>();
  for (let i = 0; i < claves.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from("fin_movimientos")
      .select("id, clave_externa, glosa, numero_documento, contraparte_rut")
      .eq("empresa_id", empresaId)
      .in("clave_externa", claves.slice(i, i + 200));
    if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
    for (const g of (data ?? []) as Guardada[]) m.set(g.clave_externa, g);
  }
  return m;
}

async function insertarNuevos(empresaId: string, filas: FilaBanco[], cuentas: Map<string, string>): Promise<number> {
  if (!filas.length) return 0;
  const { reglas, sinProyecto } = await reglasDe(empresaId);
  let total = 0;
  // Una importación por cuenta, como la cartola manual: así el resumen diario y Remuneraciones ven «banco actualizado».
  for (const [numero, cuentaId] of cuentas) {
    const deCuenta = filas.filter((f) => f.numeroCuenta === numero);
    if (!deCuenta.length) continue;
    const { data: imp, error: eImp } = await supabaseAdmin
      .from("fin_importaciones")
      .insert({ empresa_id: empresaId, cuenta_id: cuentaId, archivo: `Emisso · ${BANCO} ${numero}`, filas_total: deCuenta.length, importado_por: QUIEN })
      .select("id")
      .single();
    if (eImp) throw new Error(`No se pudo registrar la importación: ${eImp.message}`);
    const filasDb = deCuenta.map((f) => {
      const regla = reglaQueCalza({ glosa: f.glosa, monto: f.monto, cuentaId }, reglas);
      // Igual que la cartola: una regla cuya categoría no pide respaldo deja el movimiento listo de una.
      const directa = regla && sinProyecto.has(regla.categoriaId) ? regla : null;
      return {
        empresa_id: empresaId, cuenta_id: cuentaId, fecha: f.fecha, glosa: f.glosa, monto: f.monto, numero_documento: f.documento,
        // La huella sigue siendo obligatoria y única; con el prefijo no choca con la de una cartola manual.
        huella: `emisso|${f.clave}`, clave_externa: f.clave, contraparte_rut: f.contraparteRut,
        importacion_id: imp!.id, creado_por: QUIEN,
        categoria_id: directa?.categoriaId ?? null, proyecto_id: directa?.proyectoId ?? null, regla_id: directa?.id ?? null, tiene_respaldo: Boolean(directa),
      };
    });
    const { data: ins, error } = await supabaseAdmin.from("fin_movimientos").upsert(filasDb, { onConflict: "empresa_id,huella", ignoreDuplicates: true }).select("id");
    if (error) {
      await supabaseAdmin.from("fin_importaciones").delete().eq("id", imp!.id).eq("empresa_id", empresaId);
      throw new Error(`No se pudieron guardar los movimientos de ${numero}: ${error.message}`);
    }
    const n = ins?.length ?? 0;
    await supabaseAdmin.from("fin_importaciones").update({ filas_nuevas: n, filas_duplicadas: deCuenta.length - n }).eq("id", imp!.id);
    total += n;
  }
  return total;
}

async function guardarSaldos(empresaId: string, cuentas: Map<string, string>): Promise<{ n: number; datosAl: string | null }> {
  const vigentes = saldosVigentes(await saldosItau());
  if (!vigentes.length) return { n: 0, datosAl: null };
  // Una cuenta ya vinculada recibe su saldo aunque este mes no haya tenido movimientos (no se crea ninguna aquí:
  // la línea de crédito, por ejemplo, tiene saldo pero no es una cuenta de Tesorería).
  const faltan = vigentes.filter((s) => s.currency === "CLP" && !cuentas.has(s.numeroCuenta)).map((s) => origenDe(SISTEMA_ITAU, s.numeroCuenta));
  if (faltan.length) {
    const { data } = await supabaseAdmin.from("fin_cuentas").select("id, origen_externo").eq("empresa_id", empresaId).in("origen_externo", faltan);
    for (const c of data ?? []) cuentas.set(String(c.origen_externo).split(":").pop()!, c.id as string);
  }
  const filas = vigentes.map((s) => ({
    empresa_id: empresaId, origen: origenDe(SISTEMA_ITAU, s.numeroCuenta), numero_cuenta: s.numeroCuenta, moneda: s.currency, dia: s.observedDay,
    cuenta_id: s.currency === "CLP" ? cuentas.get(s.numeroCuenta) ?? null : null,
    saldo_total: s.saldoTotal, retenciones: s.retenciones, disponible: s.saldoDisponible, disponible_linea: s.saldoDisponibleLineaCredito, observado_en: s.observedAt,
  }));
  const { error } = await supabaseAdmin.from("fin_saldos_diarios").upsert(filas, { onConflict: "empresa_id,origen,numero_cuenta,moneda,dia" });
  if (error) throw new Error(`No se pudieron guardar los saldos: ${error.message}`);
  // El saldo de la cuenta en Tesorería: de él salen «Caja en bancos» y la caja inicial del flujo.
  for (const s of vigentes) {
    const cuentaId = s.currency === "CLP" ? cuentas.get(s.numeroCuenta) : undefined;
    if (!cuentaId || s.saldoTotal === null) continue;
    const { error: e } = await supabaseAdmin
      .from("fin_cuentas")
      .update({ saldo_banco: Math.round(s.saldoTotal), fecha_saldo: s.observedDay })
      .eq("id", cuentaId)
      .eq("empresa_id", empresaId)
      .or(`fecha_saldo.is.null,fecha_saldo.lte.${s.observedDay}`);
    if (e) throw new Error(`No se pudo actualizar el saldo de ${s.numeroCuenta}: ${e.message}`);
  }
  const datosAl = vigentes.map((s) => s.syncedAt).sort().pop() ?? null;
  return { n: vigentes.length, datosAl };
}

async function registrar(empresaId: string | null, r: ResultadoSincronizacion): Promise<void> {
  if (!empresaId) return;
  const { error } = await supabaseAdmin.from("fin_banco_sincronizaciones").insert({
    empresa_id: empresaId, origen: `emisso:${SISTEMA_ITAU}`, ok: r.ok, nuevos: r.nuevos, actualizados: r.actualizados, omitidos: r.omitidos,
    saldos: r.saldos, datos_al: r.datosAl, mensaje: [r.mensaje, ...r.advertencias].filter(Boolean).join(" · ").slice(0, 1000) || null,
  });
  if (error) console.error("[banco-emisso] no se pudo registrar la corrida:", error.message);
}

/**
 * Una corrida: estado de la conexión → movimientos del mes y el anterior (o todos, con `todo`) → saldos.
 * No lanza: devuelve el resultado con ok=false y el motivo, y lo deja registrado.
 */
export async function sincronizarBancoItau(opciones: { todo?: boolean; ahora?: Date } = {}): Promise<ResultadoSincronizacion> {
  const ahora = opciones.ahora ?? new Date();
  const r: ResultadoSincronizacion = { ok: false, empresaId: null, nuevos: 0, actualizados: 0, omitidos: 0, saldos: 0, datosAl: null, advertencias: [], requierePersona: false };
  try {
    const estado = await estadoConexionItau();
    if (!estado) throw new ErrorEmisso("La conexión de EMISSO_ITAU_CONEXION no aparece en Emisso (¿se borró o la clave no la ve?).", "connection_not_found", 404);
    if (!estado.empresaRut) throw new Error("Emisso no informó el RUT de la empresa de la conexión.");
    r.empresaId = await empresaPorRut(estado.empresaRut);

    // Atenciones = algo que tiene que resolver una persona (clave rechazada, bloqueada, pausa). Se lee igual lo guardado.
    for (const a of estado.atenciones ?? []) {
      const motivo = String(a.codigo ?? a.motivo ?? a.mensaje ?? JSON.stringify(a)).slice(0, 200);
      r.advertencias.push(`Emisso pide atención: ${motivo}`);
      if (requierePersona(motivo)) r.requierePersona = true;
    }
    if (estado.pausa) r.advertencias.push("Emisso tiene pausadas las sincronizaciones automáticas de Itaú.");
    if (estado.credencial && estado.credencial !== "linked") {
      r.advertencias.push(`La credencial de Itaú en Emisso está «${estado.credencial}».`);
      r.requierePersona = true;
    }
    const ultimo = estado.trabajos?.[0];
    if (ultimo && ultimo.estado !== "succeeded") {
      const motivos = (ultimo.outcomes ?? []).map((o) => o.motivo).filter(Boolean).join(", ");
      r.advertencias.push(`La última sincronización de Emisso terminó «${ultimo.estado}»${motivos ? ` (${motivos})` : ""}.`);
      if (requierePersona(motivos)) r.requierePersona = true;
    }

    const movs = opciones.todo ? await movimientosItau() : (await Promise.all(periodosRecientes(ahora).map((p) => movimientosItau(p)))).flat();
    const { filas, omitidos } = traducirMovimientos(SISTEMA_ITAU, movs);
    r.omitidos = omitidos.reduce((s, o) => s + o.cantidad, 0);
    const cuentas = await cuentasVinculadas(r.empresaId, cuentasConMovimientos(filas));

    const guardadas = await yaGuardadas(r.empresaId, filas.map((f) => f.clave));
    r.nuevos = await insertarNuevos(r.empresaId, filas.filter((f) => !guardadas.has(f.clave)), cuentas);
    for (const f of filas) {
      const g = guardadas.get(f.clave);
      const cambios = g ? cambiosDeFila(g, f) : null;
      if (!g || !cambios) continue;
      const { error } = await supabaseAdmin.from("fin_movimientos").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", g.id).eq("empresa_id", r.empresaId);
      if (error) throw new Error(`No se pudo actualizar un movimiento: ${error.message}`);
      r.actualizados++;
    }

    const s = await guardarSaldos(r.empresaId, cuentas);
    r.saldos = s.n;
    r.datosAl = s.datosAl ?? movs.map((m) => m.syncedAt).sort().pop() ?? null;
    const horas = horasDesde(r.datosAl, ahora);
    if (horas === null) r.advertencias.push("Emisso todavía no tiene datos de Itaú guardados.");
    else if (horas > HORAS_DATO_VIEJO) r.advertencias.push(`Los datos de Itaú tienen ${Math.round(horas)} horas: Emisso dejó de sincronizar.`);
    r.ok = true;
  } catch (e) {
    r.mensaje = e instanceof Error ? e.message : String(e);
    if (e instanceof ErrorEmisso && (requierePersona(e.codigo) || e.status === 428)) r.requierePersona = true;
  }
  await registrar(r.empresaId, r);
  return r;
}
