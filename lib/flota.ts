import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type {
  Asignacion,
  Contrato,
  LecturaOdometro,
  Marca,
  Modelo,
  Servicio,
  Vehiculo,
  VehiculoConDatos,
} from "./flota-modelo";

// -----------------------------------------------------------------------------
//  Capa de datos de Flota (solo servidor). Lee y escribe las tablas flo_*.
//  Las reglas puras (alertas, costos, odómetro) viven en flota-modelo.
// -----------------------------------------------------------------------------

const T = {
  marcas: "flo_marcas",
  modelos: "flo_modelos",
  vehiculos: "flo_vehiculos",
  odometro: "flo_odometro",
  servicios: "flo_servicios",
  contratos: "flo_contratos",
  asignaciones: "flo_asignaciones",
} as const;

function revienta(que: string, error: { message: string } | null): void {
  if (error) throw new Error(`[flota] No se pudo ${que}: ${error.message}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const aVehiculo = (r: any): Vehiculo => ({
  id: r.id, patente: r.patente, modeloId: r.modelo_id, anio: r.anio, color: r.color,
  numeroChasis: r.numero_chasis, numeroMotor: r.numero_motor, combustible: r.combustible,
  unidadOdometro: r.unidad_odometro, estado: r.estado, conductor: r.conductor, faena: r.faena,
  propiedad: r.propiedad, fechaAdquisicion: r.fecha_adquisicion, valorCompra: Number(r.valor_compra),
  revisionTecnicaVence: r.revision_tecnica_vence, permisoCirculacionVence: r.permiso_circulacion_vence,
  soapVence: r.soap_vence, notas: r.notas, activo: r.activo,
});
const aServicio = (r: any): Servicio => ({
  id: r.id, vehiculoId: r.vehiculo_id, tipo: r.tipo, estado: r.estado, fecha: r.fecha,
  descripcion: r.descripcion, proveedor: r.proveedor, costo: Number(r.costo),
  odometro: r.odometro === null ? null : Number(r.odometro),
});
const aContrato = (r: any): Contrato => ({
  id: r.id, vehiculoId: r.vehiculo_id, tipo: r.tipo, proveedor: r.proveedor, referencia: r.referencia,
  inicio: r.inicio, fin: r.fin, costoInicial: Number(r.costo_inicial), costoRecurrente: Number(r.costo_recurrente),
  frecuencia: r.frecuencia, cerrado: r.cerrado, notas: r.notas,
});
const aLectura = (r: any): LecturaOdometro => ({ id: r.id, vehiculoId: r.vehiculo_id, fecha: r.fecha, valor: Number(r.valor), registradoPor: r.registrado_por });
const aAsignacion = (r: any): Asignacion => ({ id: r.id, vehiculoId: r.vehiculo_id, conductor: r.conductor, faena: r.faena, desde: r.desde, hasta: r.hasta });
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- Catálogo ---------------------------------------------------------

export async function listarMarcas(): Promise<Marca[]> {
  const { data, error } = await supabaseAdmin.from(T.marcas).select("id, nombre").order("nombre");
  revienta("listar marcas", error);
  return (data ?? []).map((r) => ({ id: r.id as string, nombre: r.nombre as string }));
}

export async function listarModelos(): Promise<Modelo[]> {
  const { data, error } = await supabaseAdmin.from(T.modelos).select("id, marca_id, nombre, categoria").order("nombre");
  revienta("listar modelos", error);
  return (data ?? []).map((r) => ({ id: r.id, marcaId: r.marca_id, nombre: r.nombre, categoria: r.categoria }));
}

export async function crearMarca(nombre: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.marcas).insert({ nombre });
  if (error?.code === "23505") throw new Error("[flota] Esa marca ya existe.");
  revienta("crear la marca", error);
}

export async function crearModelo(d: { marcaId: string; nombre: string; categoria: string }): Promise<void> {
  const { error } = await supabaseAdmin.from(T.modelos).insert({ marca_id: d.marcaId, nombre: d.nombre, categoria: d.categoria });
  if (error?.code === "23505") throw new Error("[flota] Ese modelo ya existe para la marca.");
  revienta("crear el modelo", error);
}

// ---------- Vehículos --------------------------------------------------------

/** Todos los vehículos activos con marca, modelo y su última lectura de odómetro. */
export async function listarVehiculos(incluirBajas = true): Promise<VehiculoConDatos[]> {
  let consulta = supabaseAdmin.from(T.vehiculos).select("*").eq("activo", true).order("patente");
  if (!incluirBajas) consulta = consulta.neq("estado", "baja");
  const [vehiculos, modelos, marcas, lecturas] = await Promise.all([
    consulta,
    listarModelos(),
    listarMarcas(),
    supabaseAdmin.from(T.odometro).select("vehiculo_id, valor"),
  ]);
  revienta("listar vehículos", vehiculos.error);
  revienta("leer odómetros", lecturas.error);
  const modelo = new Map(modelos.map((m) => [m.id, m]));
  const marca = new Map(marcas.map((m) => [m.id, m.nombre]));
  const ultimo = new Map<string, number>();
  for (const l of lecturas.data ?? []) {
    const v = Number(l.valor);
    if (v > (ultimo.get(l.vehiculo_id) ?? -1)) ultimo.set(l.vehiculo_id, v);
  }
  return (vehiculos.data ?? []).map((r) => {
    const v = aVehiculo(r);
    const m = v.modeloId ? modelo.get(v.modeloId) : undefined;
    return { ...v, marca: m ? marca.get(m.marcaId) ?? null : null, modelo: m?.nombre ?? null, categoria: m?.categoria ?? null, odometro: ultimo.get(v.id) ?? null };
  });
}

export async function obtenerVehiculo(id: string): Promise<VehiculoConDatos | null> {
  const todos = await listarVehiculos();
  return todos.find((v) => v.id === id) ?? null;
}

export type DatosVehiculo = Omit<Vehiculo, "id" | "activo">;

const aFila = (d: Partial<DatosVehiculo>) => {
  const fila: Record<string, unknown> = {};
  const mapa: Record<keyof DatosVehiculo, string> = {
    patente: "patente", modeloId: "modelo_id", anio: "anio", color: "color", numeroChasis: "numero_chasis",
    numeroMotor: "numero_motor", combustible: "combustible", unidadOdometro: "unidad_odometro", estado: "estado",
    conductor: "conductor", faena: "faena", propiedad: "propiedad", fechaAdquisicion: "fecha_adquisicion",
    valorCompra: "valor_compra", revisionTecnicaVence: "revision_tecnica_vence",
    permisoCirculacionVence: "permiso_circulacion_vence", soapVence: "soap_vence", notas: "notas",
  };
  for (const [k, col] of Object.entries(mapa)) if (k in d) fila[col] = d[k as keyof DatosVehiculo];
  return fila;
};

export async function crearVehiculo(d: DatosVehiculo, creadoPor: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from(T.vehiculos).insert({ ...aFila(d), creado_por: creadoPor }).select("id").single();
  if (error?.code === "23505") throw new Error("[flota] Ya hay un vehículo con esa patente.");
  revienta("crear el vehículo", error);
  if (d.conductor) await abrirAsignacion(data!.id, d.conductor, d.faena, creadoPor);
  return data!.id as string;
}

export async function actualizarVehiculo(id: string, d: Partial<DatosVehiculo>): Promise<void> {
  const { error } = await supabaseAdmin.from(T.vehiculos).update({ ...aFila(d), actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error?.code === "23505") throw new Error("[flota] Ya hay un vehículo con esa patente.");
  revienta("actualizar el vehículo", error);
}

export async function cambiarEstado(id: string, estado: string): Promise<void> {
  await actualizarVehiculo(id, { estado: estado as Vehiculo["estado"] });
}

export async function darDeBaja(id: string): Promise<void> {
  await cerrarAsignacion(id);
  await actualizarVehiculo(id, { estado: "baja", conductor: null });
}

// ---------- Conductores ------------------------------------------------------

async function abrirAsignacion(vehiculoId: string, conductor: string, faena: string | null, creadoPor: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.asignaciones).insert({ vehiculo_id: vehiculoId, conductor, faena, creado_por: creadoPor });
  revienta("registrar la asignación", error);
}

async function cerrarAsignacion(vehiculoId: string): Promise<void> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabaseAdmin.from(T.asignaciones).update({ hasta: hoy }).eq("vehiculo_id", vehiculoId).is("hasta", null);
  revienta("cerrar la asignación", error);
}

/**
 * Cambia el conductor: cierra la asignación abierta y abre una nueva (queda el
 * historial, como en Odoo). Sin conductor, el vehículo vuelve a «Disponible».
 */
export async function asignarConductor(vehiculoId: string, conductor: string | null, faena: string | null, creadoPor: string): Promise<void> {
  await cerrarAsignacion(vehiculoId);
  if (conductor) await abrirAsignacion(vehiculoId, conductor, faena, creadoPor);
  await actualizarVehiculo(vehiculoId, { conductor, faena, estado: conductor ? "asignado" : "disponible" });
}

export async function listarAsignaciones(vehiculoId: string): Promise<Asignacion[]> {
  const { data, error } = await supabaseAdmin.from(T.asignaciones).select("*").eq("vehiculo_id", vehiculoId).order("desde", { ascending: false }).order("creado_en", { ascending: false });
  revienta("listar asignaciones", error);
  return (data ?? []).map(aAsignacion);
}

// ---------- Odómetro ---------------------------------------------------------

export async function listarLecturas(vehiculoId: string): Promise<LecturaOdometro[]> {
  const { data, error } = await supabaseAdmin.from(T.odometro).select("*").eq("vehiculo_id", vehiculoId).order("fecha", { ascending: false }).order("valor", { ascending: false });
  revienta("listar lecturas", error);
  return (data ?? []).map(aLectura);
}

export async function registrarLectura(vehiculoId: string, valor: number, fecha: string, registradoPor: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.odometro).insert({ vehiculo_id: vehiculoId, valor, fecha, registrado_por: registradoPor });
  revienta("registrar la lectura", error);
}

// ---------- Servicios --------------------------------------------------------

export async function listarServicios(filtro: { vehiculoId?: string } = {}): Promise<Servicio[]> {
  let q = supabaseAdmin.from(T.servicios).select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false });
  if (filtro.vehiculoId) q = q.eq("vehiculo_id", filtro.vehiculoId);
  const { data, error } = await q;
  revienta("listar servicios", error);
  return (data ?? []).map(aServicio);
}

export async function crearServicio(d: Omit<Servicio, "id">, creadoPor: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.servicios).insert({
    vehiculo_id: d.vehiculoId, tipo: d.tipo, estado: d.estado, fecha: d.fecha, descripcion: d.descripcion,
    proveedor: d.proveedor, costo: d.costo, odometro: d.odometro, creado_por: creadoPor,
  });
  revienta("crear el servicio", error);
}

export async function cambiarEstadoServicio(id: string, estado: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.servicios).update({ estado }).eq("id", id);
  revienta("actualizar el servicio", error);
}

export async function eliminarServicio(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.servicios).delete().eq("id", id);
  revienta("eliminar el servicio", error);
}

// ---------- Contratos --------------------------------------------------------

export async function listarContratos(filtro: { vehiculoId?: string } = {}): Promise<Contrato[]> {
  let q = supabaseAdmin.from(T.contratos).select("*").order("fin", { ascending: true, nullsFirst: false });
  if (filtro.vehiculoId) q = q.eq("vehiculo_id", filtro.vehiculoId);
  const { data, error } = await q;
  revienta("listar contratos", error);
  return (data ?? []).map(aContrato);
}

export async function crearContrato(d: Omit<Contrato, "id" | "cerrado">, creadoPor: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.contratos).insert({
    vehiculo_id: d.vehiculoId, tipo: d.tipo, proveedor: d.proveedor, referencia: d.referencia, inicio: d.inicio,
    fin: d.fin, costo_inicial: d.costoInicial, costo_recurrente: d.costoRecurrente, frecuencia: d.frecuencia,
    notas: d.notas, creado_por: creadoPor,
  });
  revienta("crear el contrato", error);
}

export async function cerrarContrato(id: string, cerrado: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from(T.contratos).update({ cerrado }).eq("id", id);
  revienta("actualizar el contrato", error);
}
