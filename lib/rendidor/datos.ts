import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import type { EstadoRendicion, GastoRendicion, Rendicion, ResumenRendicion } from "./tipos";
import { estadoDeGasto, type FilaMiGasto } from "./mis-gastos-modelo";

// Capa de datos de las rendiciones. Los gastos van como jsonb embebido porque
// se editan siempre en bloque desde la tabla de revision (el rendidor corrige
// varias filas y guarda), nunca de a uno.
//
// Todo el ciclo vive acá: crear, enviar a revisión, aprobar o rechazar, y pagar.
// Ya no se carga nada a Odoo.

interface FilaRendicion {
  id: string;
  nombre_quien_rinde: string;
  rinde_correo: string | null;
  monto_asignado: number | string;
  titulo_rendicion: string;
  estado: EstadoRendicion;
  empresa_company_id: number;
  gastos: GastoRendicion[];
  creado_por: string | null;
  creado_en: string;
  enviada_en: string | null;
  revisada_por: string | null;
  revisada_en: string | null;
  motivo_rechazo: string | null;
  pagada_por: string | null;
  pagada_en: string | null;
  nota_pago: string | null;
  fondo_id: string | null;
  empresa_id: string | null;
  ciclo_revision: number | null;
}

interface FilaResumen {
  id: string;
  creado_por: string | null;
  rinde_correo: string | null;
  nombre_quien_rinde: string;
  monto_asignado: number | string;
  titulo_rendicion: string;
  estado: EstadoRendicion;
  cantidad_gastos: number | string;
  total_gastos: number | string;
  enviada_en: string | null;
  revisada_en: string | null;
  motivo_rechazo: string | null;
  pagada_en: string | null;
  creado_en: string;
  fondo_id: string | null;
}

const COLUMNAS_BASE = `
  id, nombre_quien_rinde, rinde_correo, monto_asignado, titulo_rendicion, estado,
  empresa_company_id, gastos, creado_por, creado_en, enviada_en, revisada_por,
  revisada_en, motivo_rechazo, pagada_por, pagada_en, nota_pago`;
const COLUMNAS = `${COLUMNAS_BASE}, fondo_id, empresa_id, ciclo_revision`;
/** Sin el SQL de Fondos (0002) las columnas nuevas no existen: se lee sin ellas. */
const faltaColumna = (e: { message: string } | null) => !!e && /fondo_id|empresa_id|ciclo_revision/.test(e.message);

function filaARendicion(fila: FilaRendicion): Rendicion {
  return {
    id: fila.id,
    nombreQuienRinde: fila.nombre_quien_rinde,
    rindeCorreo: fila.rinde_correo,
    montoAsignado: Number(fila.monto_asignado),
    tituloRendicion: fila.titulo_rendicion,
    estado: fila.estado,
    empresaCompanyId: fila.empresa_company_id,
    gastos: fila.gastos ?? [],
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
    enviadaEn: fila.enviada_en,
    revisadaPor: fila.revisada_por,
    revisadaEn: fila.revisada_en,
    motivoRechazo: fila.motivo_rechazo,
    pagadaPor: fila.pagada_por,
    pagadaEn: fila.pagada_en,
    notaPago: fila.nota_pago,
    fondoId: fila.fondo_id ?? null,
    empresaId: fila.empresa_id ?? null,
    cicloRevision: Number(fila.ciclo_revision ?? 0),
  };
}

/**
 * Rendiciones para la pantalla de lista, mas recientes primero.
 *
 * Cada quien ve las suyas —las que creó y las que rinde— y quien administra gastos
 * ve todas, porque es quien las revisa y aprueba.
 *
 * Lee de la vista `rendiciones_resumen`, que calcula la cantidad de gastos y el
 * total en Postgres: la lista solo muestra esos dos numeros, y traer el jsonb
 * `gastos` completo para calcularlos en JS movia cientos de KB por carga.
 */
export async function listarRendiciones(quien: {
  usuarioId: string;
  correo: string;
  /** Si ve las de toda la empresa. Lo decide puedeVerRendicionesAjenas, no este archivo. */
  verTodas: boolean;
}): Promise<ResumenRendicion[]> {
  const base = `id, creado_por, rinde_correo, nombre_quien_rinde, monto_asignado, titulo_rendicion, estado,
       cantidad_gastos, total_gastos, enviada_en, revisada_en, motivo_rechazo, pagada_en, creado_en`;
  const armar = (cols: string) => supabaseAdmin.from("rendiciones_resumen").select(cols).order("creado_en", { ascending: false });

  // El filtro va en la CONSULTA y no en el resultado: filtrar despues significa
  // traer las rendiciones de toda la empresa a la memoria del servidor para
  // descartarlas.
  const correo = quien.correo.toLowerCase();
  const filtrar = (q: ReturnType<typeof armar>) => (quien.verTodas ? q : q.or(`creado_por.eq.${quien.usuarioId},rinde_correo.eq.${correo}`));
  let { data, error } = await filtrar(armar(`${base}, fondo_id`));
  if (faltaColumna(error)) ({ data, error } = await filtrar(armar(base)));

  // Se propaga el error en vez de devolver [] en silencio: una lista vacia por
  // fallo de red es indistinguible de "no tienes rendiciones".
  if (error) throw new Error(`No pudimos cargar las rendiciones: ${error.message}`);

  return ((data ?? []) as unknown as FilaResumen[]).map((f) => ({
    id: f.id,
    nombreQuienRinde: f.nombre_quien_rinde,
    rindeCorreo: f.rinde_correo,
    montoAsignado: Number(f.monto_asignado),
    tituloRendicion: f.titulo_rendicion,
    estado: f.estado,
    cantidadGastos: Number(f.cantidad_gastos),
    totalGastos: Number(f.total_gastos),
    esMia: f.creado_por === quien.usuarioId || f.rinde_correo?.toLowerCase() === correo,
    enviadaEn: f.enviada_en,
    revisadaEn: f.revisada_en,
    motivoRechazo: f.motivo_rechazo,
    pagadaEn: f.pagada_en,
    creadoEn: f.creado_en,
    fondoId: f.fondo_id ?? null,
  }));
}

export async function obtenerRendicion(id: string): Promise<Rendicion | null> {
  let { data, error } = await supabaseAdmin
    .from("rendiciones")
    .select(COLUMNAS)
    .eq("id", id)
    .maybeSingle();
  if (faltaColumna(error)) ({ data, error } = await supabaseAdmin.from("rendiciones").select(COLUMNAS_BASE).eq("id", id).maybeSingle());

  if (error) throw new Error(`No pudimos cargar la rendición: ${error.message}`);
  return data ? filaARendicion(data as unknown as FilaRendicion) : null;
}

export interface DatosNuevaRendicion {
  fondoId?: string | null;
  empresaId?: string | null;
  nombreQuienRinde: string;
  rindeCorreo: string;
  montoAsignado: number;
  tituloRendicion: string;
  empresaCompanyId: number;
}

/** Los datos iniciales, antes de subir ningún comprobante. */
export async function crearRendicion(datos: DatosNuevaRendicion, usuarioId: string): Promise<Rendicion> {
  const { data, error } = await supabaseAdmin
    .from("rendiciones")
    .insert({
      nombre_quien_rinde: datos.nombreQuienRinde.trim(),
      rinde_correo: datos.rindeCorreo.toLowerCase(),
      monto_asignado: datos.montoAsignado,
      titulo_rendicion: datos.tituloRendicion.trim(),
      empresa_company_id: datos.empresaCompanyId,
      fondo_id: datos.fondoId ?? null,
      empresa_id: datos.empresaId ?? null,
      creado_por: usuarioId,
      gastos: [],
    })
    .select(COLUMNAS)
    .single();

  if (error) throw new Error(`No pudimos crear la rendición: ${error.message}`);
  return filaARendicion(data as unknown as FilaRendicion);
}

/** Guarda los gastos corregidos desde la tabla de revisión. */
export async function guardarGastos(id: string, gastos: GastoRendicion[]): Promise<void> {
  const { error } = await supabaseAdmin
    .from("rendiciones")
    .update({ gastos, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`No pudimos guardar los gastos: ${error.message}`);
}

/** Cambia los datos de cabecera (título y fondo) mientras se puede editar. */
export async function actualizarCabecera(id: string, d: { tituloRendicion: string; montoAsignado: number }): Promise<void> {
  const { error } = await supabaseAdmin
    .from("rendiciones")
    .update({ titulo_rendicion: d.tituloRendicion.trim(), monto_asignado: d.montoAsignado, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`No pudimos guardar la rendición: ${error.message}`);
}

/**
 * Pasa una rendición de un estado a otro, solo si sigue en el estado `desde`.
 *
 * La condición va en el UPDATE: si dos personas aprietan a la vez (quien rinde la retira
 * y quien revisa la aprueba), gana la primera y la segunda no pisa nada. Devuelve false
 * si ya no estaba en `desde`.
 */
export async function cambiarEstado(
  id: string,
  desde: EstadoRendicion[],
  hacia: EstadoRendicion,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("rendiciones")
    .update({ estado: hacia, ...extra, actualizado_en: new Date().toISOString() })
    .eq("id", id)
    .in("estado", desde)
    .select("id");
  if (error) throw new Error(`No pudimos actualizar la rendición: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function eliminarRendicion(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("rendiciones").delete().eq("id", id);
  if (error) throw new Error(`No pudimos eliminar la rendición: ${error.message}`);
}

/** Las personas activas del Core, para elegir quién rinde. */
export async function listarPersonas(): Promise<{ correo: string; nombre: string }[]> {
  const { data, error } = await supabaseAdmin.from("usuarios").select("correo, nombre").eq("activo", true);
  if (error) throw new Error(`No pudimos leer los usuarios: ${error.message}`);
  return (data ?? [])
    .map((u) => ({ correo: (u.correo as string).toLowerCase(), nombre: (u.nombre as string | null) || (u.correo as string).split("@")[0] }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Los correos de quienes revisan rendiciones: el admin del Core y quien tenga el rol
 * «Administrador de gastos» en la app. A ellos les llega el aviso de una enviada.
 */
export async function correosRevisores(): Promise<string[]> {
  const [{ data: admins }, { data: app }] = await Promise.all([
    supabaseAdmin.from("usuarios").select("correo").eq("activo", true).eq("rol", "admin"),
    supabaseAdmin.from("aplicaciones").select("id").eq("slug", "rendir-gastos").maybeSingle(),
  ]);
  const correos = new Set((admins ?? []).map((u) => (u.correo as string).toLowerCase()));
  if (app) {
    const { data: conRol } = await supabaseAdmin
      .from("usuario_aplicaciones")
      .select("usuario_id")
      .eq("aplicacion_id", app.id)
      .eq("rol_extra", "admin");
    const ids = (conRol ?? []).map((f) => f.usuario_id as string);
    if (ids.length > 0) {
      const { data: usuarios } = await supabaseAdmin.from("usuarios").select("correo").eq("activo", true).in("id", ids);
      for (const u of usuarios ?? []) correos.add((u.correo as string).toLowerCase());
    }
  }
  return [...correos];
}

// ---------- «Mis gastos»: la bolsa de boletas sueltas de cada persona -------------------

/** La bolsa de esta persona (una rendición con tipo 'bolsa'); la crea la primera vez. */
export async function obtenerOCrearBolsa(rinde: { correo: string; nombre: string }, usuarioId: string): Promise<Rendicion> {
  const correo = rinde.correo.toLowerCase();
  const { data, error } = await supabaseAdmin.from("rendiciones").select(COLUMNAS).eq("tipo", "bolsa").eq("rinde_correo", correo).limit(1).maybeSingle();
  if (error) throw new Error(/tipo/.test(error.message) ? "Falta el SQL de «Mis gastos»: corre supabase/rendir-gastos/0003_mis_gastos.sql." : error.message);
  if (data) return filaARendicion(data as unknown as FilaRendicion);
  const { data: nueva, error: e2 } = await supabaseAdmin
    .from("rendiciones")
    .insert({ tipo: "bolsa", nombre_quien_rinde: rinde.nombre, rinde_correo: correo, monto_asignado: 0, titulo_rendicion: "Mis gastos por rendir", empresa_company_id: 1, creado_por: usuarioId, gastos: [] })
    .select(COLUMNAS)
    .single();
  if (e2) throw new Error(e2.message);
  return filaARendicion(nueva as unknown as FilaRendicion);
}

/** ¿Es la bolsa de alguien? (no se abre como informe) */
export async function esBolsa(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("rendiciones").select("tipo").eq("id", id).maybeSingle();
  if (error) return false;
  return data?.tipo === "bolsa";
}

/** Los informes donde esta persona puede agregar gastos: suyos y todavía editables. */
export async function informesAbiertosDe(correo: string): Promise<{ id: string; titulo: string; fondoId: string | null }[]> {
  const { data, error } = await supabaseAdmin
    .from("rendiciones")
    .select("id, titulo_rendicion, fondo_id")
    .eq("tipo", "informe")
    .eq("rinde_correo", correo.toLowerCase())
    .in("estado", ["borrador", "rechazada"])
    .order("creado_en", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id as string, titulo: r.titulo_rendicion as string, fondoId: (r.fondo_id as string | null) ?? null }));
}

/**
 * Los gastos de esta persona que ya están en un informe (en revisión o cerrados), uno por fila,
 * con el estado que les toca. Los sueltos (borradores) viven en la bolsa y los trae el panel.
 */
export async function gastosEnInformesDe(correo: string): Promise<FilaMiGasto[]> {
  const { data, error } = await supabaseAdmin
    .from("rendiciones")
    .select("id, titulo_rendicion, estado, gastos, creado_en")
    .eq("tipo", "informe")
    .eq("rinde_correo", correo.toLowerCase())
    .neq("estado", "anulada")
    .order("creado_en", { ascending: false });
  if (error) return [];
  return (data ?? []).flatMap((r) =>
    ((r.gastos ?? []) as GastoRendicion[]).map((g) => ({
      id: g.id,
      fecha: g.fecha,
      proveedor: g.proveedor,
      numeroDocumento: g.numeroDocumento,
      categoria: g.categoria,
      tipoDocumento: g.tipoDocumento,
      total: Number(g.total) || 0,
      estado: estadoDeGasto(g, r.estado as EstadoRendicion),
      informeId: r.id as string,
      informeTitulo: r.titulo_rendicion as string,
      proyectoNombre: g.proyectoNombre ?? null,
      conciliado: Boolean(g.conciliacion),
    })),
  );
}
