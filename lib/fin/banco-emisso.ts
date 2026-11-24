import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ReglaCategoria } from "./reglas";
import { aplicableSola, sugerirClasificacion, type CategoriaLista } from "./clasificacion";
import { ErrorEmisso, estadoConexionItau, movimientosItau, nominasItau, saldosItau } from "./emisso";
import { ligarNominas, type NominaBanco } from "./nominas-modelo";
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
  traducirNominas,
  type FilaBanco,
  type FilaNomina,
} from "./banco-emisso-modelo";

// -----------------------------------------------------------------------------
//  Banco automático: trae lo que Emisso ya leyó de Itaú y lo deja en Tesorería.
//
//  · NO concilia: deja los movimientos «por aclarar» (o categorizados por las reglas, igual que la cartola manual).
//    Ligar un abono a un cobro o un cargo a un pago lo sigue confirmando una persona.
//  · Una fila ya guardada solo se actualiza en glosa, N° y RUT. Fecha y monto no se tocan: podría estar conciliada.
//  · La empresa se resuelve por el RUT de la conexión en Emisso, no por configuración: una clave de otra empresa no
//    puede escribir en ésta.
//  · Las nóminas de pago masivo (proveedores y remuneraciones) se guardan con cada pago y su beneficiario, y se ligan
//    al cargo que las pagó. Si leerlas falla, el resto de la corrida sigue: solo queda como advertencia.
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
  /** Nóminas del banco que se leyeron en esta corrida, y cuántas se ligaron por primera vez a su cargo. */
  nominas: number;
  nominasLigadas: number;
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

/** Las reglas de clasificación de la empresa y lo necesario para saber si una se aplica sola (ver lib/fin/clasificacion.ts). */
async function reglasDe(empresaId: string): Promise<{ reglas: ReglaCategoria[]; categorias: CategoriaLista[]; conSubcategorias: Set<string> }> {
  const [rR, cR, sR] = await Promise.all([
    supabaseAdmin.from("fin_reglas").select("*").eq("empresa_id", empresaId),
    supabaseAdmin.from("fin_categorias").select("id, nombre, sentido, requiere_proyecto, afecta_resultado, cuenta_contable, orden, activa").eq("empresa_id", empresaId),
    supabaseAdmin.from("fin_subcategorias").select("categoria_id, activa").eq("empresa_id", empresaId),
  ]);
  if (rR.error) throw new Error(`No se pudieron leer las reglas: ${rR.error.message}`);
  if (cR.error) throw new Error(`No se pudieron leer las categorías: ${cR.error.message}`);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const reglas: ReglaCategoria[] = ((rR.data ?? []) as any[]).map((r) => ({
    id: r.id, cuentaId: r.cuenta_id, patron: r.patron ?? "", contraparteRut: r.contraparte_rut ?? null, montoMin: num(r.monto_min), montoMax: num(r.monto_max),
    categoriaId: r.categoria_id, subcategoriaId: r.subcategoria_id ?? null, proyectoId: r.proyecto_id, prioridad: r.prioridad, activa: r.activa,
  }));
  const categorias: CategoriaLista[] = ((cR.data ?? []) as any[]).map((c) => ({
    id: c.id, nombre: c.nombre, sentido: c.sentido, requiereProyecto: c.requiere_proyecto, afectaResultado: c.afecta_resultado ?? true, cuentaContable: c.cuenta_contable,
    orden: c.orden, activa: c.activa,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // Sin la migración 0014 no hay subcategorías: las reglas se aplican como antes.
  const conSubcategorias = new Set(((sR.data ?? []) as { categoria_id: string; activa: boolean }[]).filter((s) => s.activa).map((s) => s.categoria_id));
  return { reglas, categorias, conSubcategorias };
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
  const { reglas, categorias, conSubcategorias } = await reglasDe(empresaId);
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
      // Igual que la cartola: una regla de Finanzas (por texto o por RUT) con la clasificación completa deja el
      // movimiento listo de una; lo demás queda «Por aclarar» con su sugerencia.
      const sugerencia = sugerirClasificacion({ glosa: f.glosa, monto: f.monto, cuentaId, contraparteRut: f.contraparteRut }, reglas, []);
      const directa = aplicableSola(sugerencia, categorias, conSubcategorias) ? sugerencia : null;
      return {
        empresa_id: empresaId, cuenta_id: cuentaId, fecha: f.fecha, glosa: f.glosa, monto: f.monto, numero_documento: f.documento,
        // La huella sigue siendo obligatoria y única; con el prefijo no choca con la de una cartola manual.
        huella: `emisso|${f.clave}`, clave_externa: f.clave, contraparte_rut: f.contraparteRut,
        importacion_id: imp!.id, creado_por: QUIEN,
        categoria_id: directa?.categoriaId ?? null, proyecto_id: directa?.proyectoId ?? null, regla_id: directa?.reglaId ?? null, tiene_respaldo: Boolean(directa),
        ...(conSubcategorias.size > 0 ? { subcategoria_id: directa?.subcategoriaId ?? null, clasificado_por: directa?.origen ?? null } : {}),
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

/**
 * Guarda todas las nóminas que Emisso tiene (con sus pagos) y liga a su cargo en Tesorería las pagadas que aún no lo
 * tienen. Una nómina ya guardada se actualiza (cambia de estado), pero su cargo ligado no se toca.
 */
async function guardarNominas(empresaId: string): Promise<{ leidas: number; ligadas: number; ambiguas: string[]; omitidas: number }> {
  const { filas, omitidas } = traducirNominas(await nominasItau());
  const origen = `emisso:${SISTEMA_ITAU}`;
  const ahora = new Date().toISOString();
  if (!filas.length) return { leidas: 0, ligadas: 0, ambiguas: [], omitidas };

  const { data: guardadas, error } = await supabaseAdmin
    .from("fin_banco_nominas")
    .upsert(
      filas.map((n: FilaNomina) => ({
        empresa_id: empresaId, origen, id_nomina: n.idNomina, fecha_pago: n.fechaPago, fecha_creacion: n.fechaCreacion, descripcion: n.descripcion,
        estado: n.estado, moneda: n.moneda, monto: n.monto, leida_en: ahora,
      })),
      { onConflict: "empresa_id,origen,id_nomina" },
    )
    .select("id, id_nomina");
  if (error) throw new Error(`No se pudieron guardar las nóminas: ${error.message}`);
  const idDe = new Map((guardadas ?? []).map((g: { id: string; id_nomina: string }) => [g.id_nomina, g.id]));

  const lineas = filas.flatMap((n) =>
    n.lineas.map((l) => ({ empresa_id: empresaId, nomina_id: idDe.get(n.idNomina), id_linea: l.idLinea, beneficiario: l.nombre, beneficiario_rut: l.rut, monto: l.monto, moneda: l.moneda, estado: l.estado })),
  );
  for (let i = 0; i < lineas.length; i += 200) {
    const { error: eL } = await supabaseAdmin.from("fin_banco_nomina_lineas").upsert(lineas.slice(i, i + 200), { onConflict: "nomina_id,id_linea" });
    if (eL) throw new Error(`No se pudieron guardar los pagos de las nóminas: ${eL.message}`);
  }

  // Ligar al cargo: nóminas pagadas sin cargo ↔ salidas del banco Itaú con el mismo monto (ver nominas-modelo.ts).
  const { data: todas, error: eT } = await supabaseAdmin
    .from("fin_banco_nominas")
    .select("id, id_nomina, fecha_pago, monto, estado, movimiento_id")
    .eq("empresa_id", empresaId)
    .eq("origen", origen);
  if (eT) throw new Error(`No se pudieron leer las nóminas: ${eT.message}`);
  type Fila = { id: string; id_nomina: string; fecha_pago: string | null; monto: number | string; estado: string; movimiento_id: string | null };
  const nominas = ((todas ?? []) as Fila[]).map((f) => ({ idNomina: f.id_nomina, fechaPago: f.fecha_pago, monto: Number(f.monto), estado: f.estado, movimientoId: f.movimiento_id }));
  const desde = nominas.filter((n) => n.fechaPago && !n.movimientoId).map((n) => n.fechaPago as string).sort()[0];
  let ligadas = 0;
  let ambiguas: string[] = [];
  if (desde) {
    const { data: cargos, error: eC } = await supabaseAdmin
      .from("fin_movimientos")
      .select("id, fecha, monto")
      .eq("empresa_id", empresaId)
      .like("clave_externa", `${SISTEMA_ITAU}:%`)
      .lt("monto", 0)
      .gte("fecha", desde);
    if (eC) throw new Error(`No se pudieron leer los cargos del banco: ${eC.message}`);
    const res = ligarNominas(nominas as Pick<NominaBanco, "idNomina" | "fechaPago" | "monto" | "estado" | "movimientoId">[], (cargos ?? []).map((c: { id: string; fecha: string; monto: number | string }) => ({ id: c.id, fecha: c.fecha, monto: Number(c.monto) })));
    const filaDe = new Map(((todas ?? []) as Fila[]).map((f) => [f.id_nomina, f.id]));
    for (const [idNomina, movimientoId] of res.ligas) {
      const { error: eU } = await supabaseAdmin.from("fin_banco_nominas").update({ movimiento_id: movimientoId }).eq("id", filaDe.get(idNomina) as string).eq("empresa_id", empresaId);
      if (eU) throw new Error(`No se pudo ligar la nómina ${idNomina} a su cargo: ${eU.message}`);
      ligadas++;
    }
    ambiguas = res.ambiguas;
  }
  return { leidas: filas.length, ligadas, ambiguas, omitidas };
}

async function registrar(empresaId: string | null, r: ResultadoSincronizacion): Promise<void> {
  if (!empresaId) return;
  const { error } = await supabaseAdmin.from("fin_banco_sincronizaciones").insert({
    empresa_id: empresaId, origen: `emisso:${SISTEMA_ITAU}`, ok: r.ok, nuevos: r.nuevos, actualizados: r.actualizados, omitidos: r.omitidos,
    saldos: r.saldos, nominas: r.nominas, datos_al: r.datosAl, mensaje: [r.mensaje, ...r.advertencias].filter(Boolean).join(" · ").slice(0, 1000) || null,
  });
  if (error) console.error("[banco-emisso] no se pudo registrar la corrida:", error.message);
}

/**
 * Una corrida: estado de la conexión → movimientos del mes y el anterior (o todos, con `todo`) → saldos → nóminas.
 * No lanza: devuelve el resultado con ok=false y el motivo, y lo deja registrado.
 */
export async function sincronizarBancoItau(opciones: { todo?: boolean; ahora?: Date } = {}): Promise<ResultadoSincronizacion> {
  const ahora = opciones.ahora ?? new Date();
  const r: ResultadoSincronizacion = { ok: false, empresaId: null, nuevos: 0, actualizados: 0, omitidos: 0, saldos: 0, nominas: 0, nominasLigadas: 0, datosAl: null, advertencias: [], requierePersona: false };
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
    try {
      const n = await guardarNominas(r.empresaId);
      r.nominas = n.leidas;
      r.nominasLigadas = n.ligadas;
      if (n.ambiguas.length) r.advertencias.push(`${n.ambiguas.length} ${n.ambiguas.length === 1 ? "nómina pagada calza" : "nóminas pagadas calzan"} con más de un cargo del mismo monto y no se ligaron (${n.ambiguas.join(", ")}).`);
    } catch (e) {
      r.advertencias.push(`No se pudieron leer las nóminas de pago masivo: ${e instanceof Error ? e.message : String(e)}`);
    }
    r.ok = true;
  } catch (e) {
    r.mensaje = e instanceof Error ? e.message : String(e);
    if (e instanceof ErrorEmisso && (requierePersona(e.codigo) || e.status === 428)) r.requierePersona = true;
  }
  await registrar(r.empresaId, r);
  return r;
}
