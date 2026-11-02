// -----------------------------------------------------------------------------
//  Flota: tipos, etiquetas y reglas puras (sin base de datos), al estilo del
//  módulo Fleet de Odoo. Lo usan el servidor, los componentes y las pruebas.
// -----------------------------------------------------------------------------

export const SLUG_APP_FLOTA = "flota";

export type CategoriaModelo = "auto" | "camioneta" | "camion" | "furgon" | "maquinaria" | "otro";
export type Combustible = "diesel" | "gasolina" | "electrico" | "hibrido" | "gas" | "otro";
export type UnidadOdometro = "km" | "horas";
export type EstadoVehiculo = "disponible" | "asignado" | "en_taller" | "fuera_servicio" | "baja";
export type Propiedad = "propio" | "leasing" | "arrendado";
export type TipoServicio = "mantencion" | "reparacion" | "neumaticos" | "combustible" | "lavado" | "revision" | "otro";
export type EstadoServicio = "programado" | "en_curso" | "hecho" | "cancelado";
export type TipoContrato = "leasing" | "seguro" | "arriendo" | "gps" | "otro";
export type Frecuencia = "unico" | "mensual" | "anual";

export interface Marca { id: string; nombre: string }
export interface Modelo { id: string; marcaId: string; nombre: string; categoria: CategoriaModelo }

export interface Vehiculo {
  id: string;
  patente: string;
  modeloId: string | null;
  anio: number | null;
  color: string | null;
  numeroChasis: string | null;
  numeroMotor: string | null;
  combustible: Combustible;
  unidadOdometro: UnidadOdometro;
  estado: EstadoVehiculo;
  conductor: string | null;
  faena: string | null;
  propiedad: Propiedad;
  fechaAdquisicion: string | null;
  valorCompra: number;
  revisionTecnicaVence: string | null;
  permisoCirculacionVence: string | null;
  soapVence: string | null;
  notas: string | null;
  activo: boolean;
}

/** El vehículo con lo que se muestra en listas: marca/modelo y último odómetro. */
export interface VehiculoConDatos extends Vehiculo {
  marca: string | null;
  modelo: string | null;
  categoria: CategoriaModelo | null;
  odometro: number | null;
}

export interface LecturaOdometro { id: string; vehiculoId: string; fecha: string; valor: number; registradoPor: string | null }

export interface Servicio {
  id: string;
  vehiculoId: string;
  tipo: TipoServicio;
  estado: EstadoServicio;
  fecha: string;
  descripcion: string | null;
  proveedor: string | null;
  costo: number;
  odometro: number | null;
}

export interface Contrato {
  id: string;
  vehiculoId: string;
  tipo: TipoContrato;
  proveedor: string | null;
  referencia: string | null;
  inicio: string;
  fin: string | null;
  costoInicial: number;
  costoRecurrente: number;
  frecuencia: Frecuencia;
  cerrado: boolean;
  notas: string | null;
}

export interface Asignacion { id: string; vehiculoId: string; conductor: string; faena: string | null; desde: string; hasta: string | null }

// ---------- Etiquetas --------------------------------------------------------

export const ETIQUETA_CATEGORIA: Record<CategoriaModelo, string> = {
  auto: "Auto", camioneta: "Camioneta", camion: "Camión", furgon: "Furgón", maquinaria: "Maquinaria", otro: "Otro",
};
export const ETIQUETA_COMBUSTIBLE: Record<Combustible, string> = {
  diesel: "Diésel", gasolina: "Gasolina", electrico: "Eléctrico", hibrido: "Híbrido", gas: "Gas", otro: "Otro",
};
export const ETIQUETA_ESTADO: Record<EstadoVehiculo, string> = {
  disponible: "Disponible", asignado: "Asignado", en_taller: "En taller", fuera_servicio: "Fuera de servicio", baja: "Dado de baja",
};
export const ETIQUETA_PROPIEDAD: Record<Propiedad, string> = { propio: "Propio", leasing: "Leasing", arrendado: "Arrendado" };
export const ETIQUETA_TIPO_SERVICIO: Record<TipoServicio, string> = {
  mantencion: "Mantención", reparacion: "Reparación", neumaticos: "Neumáticos", combustible: "Combustible",
  lavado: "Lavado", revision: "Revisión técnica", otro: "Otro",
};
export const ETIQUETA_ESTADO_SERVICIO: Record<EstadoServicio, string> = {
  programado: "Programado", en_curso: "En curso", hecho: "Hecho", cancelado: "Cancelado",
};
export const ETIQUETA_TIPO_CONTRATO: Record<TipoContrato, string> = {
  leasing: "Leasing", seguro: "Seguro", arriendo: "Arriendo", gps: "GPS / telemetría", otro: "Otro",
};
export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = { unico: "Pago único", mensual: "Mensual", anual: "Anual" };

/** Columnas del tablero, en orden (las etapas del kanban de Odoo). */
export const ESTADOS_TABLERO: EstadoVehiculo[] = ["disponible", "asignado", "en_taller", "fuera_servicio"];

const es = <T extends string>(r: Record<T, string>) => (v: unknown): v is T => typeof v === "string" && Object.hasOwn(r, v);
export const esCategoria = es(ETIQUETA_CATEGORIA);
export const esCombustible = es(ETIQUETA_COMBUSTIBLE);
export const esEstadoVehiculo = es(ETIQUETA_ESTADO);
export const esPropiedad = es(ETIQUETA_PROPIEDAD);
export const esTipoServicio = es(ETIQUETA_TIPO_SERVICIO);
export const esEstadoServicio = es(ETIQUETA_ESTADO_SERVICIO);
export const esTipoContrato = es(ETIQUETA_TIPO_CONTRATO);
export const esFrecuencia = es(ETIQUETA_FRECUENCIA);

// ---------- Reglas -----------------------------------------------------------

export const DIAS_AVISO = 30;

/** Días desde hoy hasta `fecha` (negativo si ya pasó); null si no hay fecha. */
export function diasHasta(fecha: string | null, hoy: Date = new Date()): number | null {
  if (!fecha) return null;
  const f = new Date(fecha + "T00:00:00");
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((f.getTime() - base.getTime()) / 86_400_000);
}

export type EstadoVencimiento = "vigente" | "por_vencer" | "vencido" | "sin_fecha";

export function estadoVencimiento(fecha: string | null, hoy: Date = new Date()): EstadoVencimiento {
  const d = diasHasta(fecha, hoy);
  if (d === null) return "sin_fecha";
  if (d < 0) return "vencido";
  return d <= DIAS_AVISO ? "por_vencer" : "vigente";
}

/** Los documentos obligatorios de un vehículo en Chile. */
export const DOCUMENTOS = [
  { clave: "revisionTecnicaVence", etiqueta: "Revisión técnica" },
  { clave: "permisoCirculacionVence", etiqueta: "Permiso de circulación" },
  { clave: "soapVence", etiqueta: "SOAP" },
] as const;

export interface Alerta {
  vehiculoId: string;
  patente: string;
  que: string;
  fecha: string | null;
  dias: number | null;
  estado: Exclude<EstadoVencimiento, "vigente">;
}

/**
 * Lo que pide atención en la flota: documentos vencidos, por vencer o sin fecha, y
 * contratos abiertos que terminan pronto. Los dados de baja no avisan. Ordenado de lo
 * más urgente a lo menos (los sin fecha al final).
 */
export function alertasDeFlota(vehiculos: Vehiculo[], contratos: Contrato[], hoy: Date = new Date()): Alerta[] {
  const activos = vehiculos.filter((v) => v.activo && v.estado !== "baja");
  const patente = new Map(activos.map((v) => [v.id, v.patente]));
  const alertas: Alerta[] = [];
  for (const v of activos) {
    for (const d of DOCUMENTOS) {
      const fecha = v[d.clave];
      const estado = estadoVencimiento(fecha, hoy);
      if (estado !== "vigente") alertas.push({ vehiculoId: v.id, patente: v.patente, que: d.etiqueta, fecha, dias: diasHasta(fecha, hoy), estado });
    }
  }
  for (const c of contratos) {
    if (c.cerrado || !c.fin || !patente.has(c.vehiculoId)) continue;
    const estado = estadoVencimiento(c.fin, hoy);
    if (estado === "vigente") continue;
    alertas.push({
      vehiculoId: c.vehiculoId, patente: patente.get(c.vehiculoId)!,
      que: `Contrato ${ETIQUETA_TIPO_CONTRATO[c.tipo].toLowerCase()}${c.proveedor ? ` (${c.proveedor})` : ""}`,
      fecha: c.fin, dias: diasHasta(c.fin, hoy), estado: estado as Alerta["estado"],
    });
  }
  return alertas.sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity));
}

/** Una lectura nueva no puede ser menor que la última (el odómetro no retrocede). */
export function revisarLectura(nueva: number, ultima: number | null): string | null {
  if (!Number.isFinite(nueva) || nueva < 0) return "La lectura tiene que ser un número positivo.";
  if (ultima !== null && nueva < ultima) return `La lectura no puede ser menor que la última registrada (${formatearNumero(ultima)}).`;
  return null;
}

/**
 * Cuánto cuesta un contrato entre dos fechas (inclusive): el costo inicial si empezó
 * en el período, más un cobro por cada mes (o año) cumplido dentro del período.
 */
export function costoDeContrato(c: Contrato, desde: string, hasta: string): number {
  let total = c.inicio >= desde && c.inicio <= hasta ? c.costoInicial : 0;
  if (c.costoRecurrente <= 0 || c.frecuencia === "unico") return total;
  const fin = c.fin && c.fin < hasta ? c.fin : hasta;
  const paso = c.frecuencia === "mensual" ? 1 : 12;
  const [a, m, d] = c.inicio.split("-").map(Number);
  for (let i = 0; ; i += paso) {
    const f = new Date(Date.UTC(a, m - 1 + i, d)).toISOString().slice(0, 10);
    if (f > fin) break;
    if (f >= desde) total += c.costoRecurrente;
  }
  return total;
}

export interface FilaCosto { vehiculoId: string; patente: string; servicios: number; contratos: number; total: number }
export interface ResumenCostos {
  total: number;
  servicios: number;
  contratos: number;
  porVehiculo: FilaCosto[];
  porTipo: { tipo: TipoServicio; total: number }[];
  porMes: { mes: string; servicios: number; contratos: number }[];
}

/** Costos de la flota en un período: servicios hechos más contratos, por vehículo, tipo y mes. */
export function resumirCostos(
  vehiculos: Pick<Vehiculo, "id" | "patente">[],
  servicios: Servicio[],
  contratos: Contrato[],
  desde: string,
  hasta: string,
): ResumenCostos {
  const fila = new Map<string, FilaCosto>(vehiculos.map((v) => [v.id, { vehiculoId: v.id, patente: v.patente, servicios: 0, contratos: 0, total: 0 }]));
  const porTipo = new Map<TipoServicio, number>();
  const porMes = new Map<string, { servicios: number; contratos: number }>();
  const mes = (m: string) => porMes.get(m) ?? porMes.set(m, { servicios: 0, contratos: 0 }).get(m)!;

  for (const s of servicios) {
    if (s.estado !== "hecho" || s.fecha < desde || s.fecha > hasta) continue;
    const f = fila.get(s.vehiculoId);
    if (f) f.servicios += s.costo;
    porTipo.set(s.tipo, (porTipo.get(s.tipo) ?? 0) + s.costo);
    mes(s.fecha.slice(0, 7)).servicios += s.costo;
  }
  for (const c of contratos) {
    const f = fila.get(c.vehiculoId);
    for (const [m0, m1] of mesesEntre(desde, hasta)) {
      const monto = costoDeContrato(c, m0, m1);
      if (monto === 0) continue;
      if (f) f.contratos += monto;
      mes(m0.slice(0, 7)).contratos += monto;
    }
  }
  const filas = [...fila.values()].map((f) => ({ ...f, total: f.servicios + f.contratos })).filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
  const servTotal = filas.reduce((s, f) => s + f.servicios, 0);
  const contTotal = filas.reduce((s, f) => s + f.contratos, 0);
  return {
    total: servTotal + contTotal,
    servicios: servTotal,
    contratos: contTotal,
    porVehiculo: filas,
    porTipo: [...porTipo].map(([tipo, total]) => ({ tipo, total })).filter((t) => t.total > 0).sort((a, b) => b.total - a.total),
    porMes: [...porMes].map(([m, v]) => ({ mes: m, ...v })).sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

/** Los meses (primer y último día) que toca un período, recortados al período. */
function mesesEntre(desde: string, hasta: string): [string, string][] {
  const res: [string, string][] = [];
  let [a, m] = desde.split("-").map(Number);
  for (;;) {
    const ini = `${a}-${String(m).padStart(2, "0")}-01`;
    if (ini > hasta) break;
    const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    res.push([ini < desde ? desde : ini, fin > hasta ? hasta : fin]);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return res;
}

/** Normaliza una patente chilena: mayúsculas, sin espacios, puntos ni guiones. */
export function normalizarPatente(p: string): string {
  return p.toUpperCase().replace(/[\s.·-]/g, "");
}

/** «ABCD12» → «ABCD·12», «AB1234» → «AB·1234»: como se lee en la placa. */
export function formatearPatente(p: string): string {
  const n = normalizarPatente(p);
  const m = /^([A-Z]{2,4})(\d{2,4})$/.exec(n);
  return m ? `${m[1]}·${m[2]}` : n;
}

export function formatearNumero(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
}

export function formatearMonto(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export function nombreVehiculo(v: Pick<VehiculoConDatos, "marca" | "modelo" | "patente">): string {
  return [v.marca, v.modelo].filter(Boolean).join(" ") || formatearPatente(v.patente);
}
