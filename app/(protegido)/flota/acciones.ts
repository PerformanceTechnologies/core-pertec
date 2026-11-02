"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import {
  actualizarVehiculo,
  asignarConductor,
  cambiarEstado,
  cambiarEstadoServicio,
  cerrarContrato,
  crearContrato,
  crearMarca,
  crearModelo,
  crearServicio,
  crearVehiculo,
  darDeBaja,
  eliminarServicio,
  listarLecturas,
  registrarLectura,
  type DatosVehiculo,
} from "@/lib/flota";
import {
  SLUG_APP_FLOTA,
  esCategoria,
  esCombustible,
  esEstadoServicio,
  esEstadoVehiculo,
  esFrecuencia,
  esPropiedad,
  esTipoContrato,
  esTipoServicio,
  normalizarPatente,
  revisarLectura,
} from "@/lib/flota-modelo";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  const error = e instanceof Error ? e.message.replace(/^\[flota\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

function refrescar(vehiculoId?: string): void {
  for (const r of ["/flota", "/flota/vehiculos", "/flota/servicios", "/flota/contratos", "/flota/costos"]) revalidatePath(r);
  if (vehiculoId) revalidatePath(`/flota/vehiculos/${vehiculoId}`);
}

const texto = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const fecha = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
const monto = (fd: FormData, k: string) => {
  const n = Number(fd.get(k) ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const hoy = () => new Date().toISOString().slice(0, 10);

// ---------- Vehículos --------------------------------------------------------

function leerVehiculo(fd: FormData): DatosVehiculo | string {
  const patente = normalizarPatente(String(fd.get("patente") ?? ""));
  if (!patente) return "La patente es obligatoria.";
  if (patente.length > 10) return "La patente es demasiado larga.";
  const anio = Number(fd.get("anio") || NaN);
  const combustible = fd.get("combustible");
  const propiedad = fd.get("propiedad");
  const estado = fd.get("estado");
  const conductor = texto(fd, "conductor", 120);
  return {
    patente,
    modeloId: texto(fd, "modeloId", 60),
    anio: Number.isInteger(anio) && anio >= 1950 && anio <= 2100 ? anio : null,
    color: texto(fd, "color", 40),
    numeroChasis: texto(fd, "numeroChasis", 40),
    numeroMotor: texto(fd, "numeroMotor", 40),
    combustible: esCombustible(combustible) ? combustible : "diesel",
    unidadOdometro: fd.get("unidadOdometro") === "horas" ? "horas" : "km",
    estado: esEstadoVehiculo(estado) ? estado : conductor ? "asignado" : "disponible",
    conductor,
    faena: texto(fd, "faena", 120),
    propiedad: esPropiedad(propiedad) ? propiedad : "propio",
    fechaAdquisicion: fecha(fd, "fechaAdquisicion"),
    valorCompra: monto(fd, "valorCompra"),
    revisionTecnicaVence: fecha(fd, "revisionTecnicaVence"),
    permisoCirculacionVence: fecha(fd, "permisoCirculacionVence"),
    soapVence: fecha(fd, "soapVence"),
    notas: texto(fd, "notas", 2000),
  };
}

export async function crearVehiculoAction(fd: FormData): Promise<Resultado> {
  try {
    const u = await exigirAccesoApp(SLUG_APP_FLOTA);
    const d = leerVehiculo(fd);
    if (typeof d === "string") return { ok: false, error: d };
    const id = await crearVehiculo(d, u.correo);
    const odo = Number(fd.get("odometroInicial") || NaN);
    if (Number.isFinite(odo) && odo > 0) await registrarLectura(id, odo, hoy(), u.correo);
    refrescar(id);
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarVehiculoAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    const d = leerVehiculo(fd);
    if (typeof d === "string") return { ok: false, error: d };
    // El conductor y el estado se cambian con sus propias acciones (dejan historial).
    const { conductor: _c, estado: _e, ...resto } = d;
    void _c; void _e;
    await actualizarVehiculo(id, resto);
    refrescar(id);
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarEstadoAction(id: string, estado: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    if (!esEstadoVehiculo(estado) || estado === "baja") return { ok: false, error: "Estado no válido." };
    await cambiarEstado(id, estado);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function darDeBajaAction(id: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    await darDeBaja(id);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function asignarConductorAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const u = await exigirAccesoApp(SLUG_APP_FLOTA);
    await asignarConductor(id, texto(fd, "conductor", 120), texto(fd, "faena", 120), u.correo);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Odómetro ---------------------------------------------------------

export async function registrarLecturaAction(vehiculoId: string, fd: FormData): Promise<Resultado> {
  try {
    const u = await exigirAccesoApp(SLUG_APP_FLOTA);
    const valor = Number(fd.get("valor"));
    const ultima = (await listarLecturas(vehiculoId))[0]?.valor ?? null;
    const problema = revisarLectura(valor, ultima);
    if (problema) return { ok: false, error: problema };
    await registrarLectura(vehiculoId, valor, fecha(fd, "fecha") ?? hoy(), u.correo);
    refrescar(vehiculoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Servicios --------------------------------------------------------

export async function crearServicioAction(fd: FormData): Promise<Resultado> {
  try {
    const u = await exigirAccesoApp(SLUG_APP_FLOTA);
    const vehiculoId = texto(fd, "vehiculoId", 60);
    if (!vehiculoId) return { ok: false, error: "Elige el vehículo." };
    const tipo = fd.get("tipo");
    const estado = fd.get("estado");
    const odo = Number(fd.get("odometro") || NaN);
    await crearServicio(
      {
        vehiculoId,
        tipo: esTipoServicio(tipo) ? tipo : "mantencion",
        estado: esEstadoServicio(estado) ? estado : "hecho",
        fecha: fecha(fd, "fecha") ?? hoy(),
        descripcion: texto(fd, "descripcion", 2000),
        proveedor: texto(fd, "proveedor", 120),
        costo: monto(fd, "costo"),
        odometro: Number.isFinite(odo) && odo >= 0 ? odo : null,
      },
      u.correo,
    );
    // Si trae odómetro y es mayor al último, queda también como lectura.
    if (Number.isFinite(odo) && odo > 0) {
      const ultima = (await listarLecturas(vehiculoId))[0]?.valor ?? null;
      if (ultima === null || odo > ultima) await registrarLectura(vehiculoId, odo, fecha(fd, "fecha") ?? hoy(), u.correo);
    }
    refrescar(vehiculoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarEstadoServicioAction(id: string, estado: string, vehiculoId: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    if (!esEstadoServicio(estado)) return { ok: false, error: "Estado no válido." };
    await cambiarEstadoServicio(id, estado);
    refrescar(vehiculoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarServicioAction(id: string, vehiculoId: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    await eliminarServicio(id);
    refrescar(vehiculoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Contratos --------------------------------------------------------

export async function crearContratoAction(fd: FormData): Promise<Resultado> {
  try {
    const u = await exigirAccesoApp(SLUG_APP_FLOTA);
    const vehiculoId = texto(fd, "vehiculoId", 60);
    if (!vehiculoId) return { ok: false, error: "Elige el vehículo." };
    const tipo = fd.get("tipo");
    const frecuencia = fd.get("frecuencia");
    const inicio = fecha(fd, "inicio") ?? hoy();
    const fin = fecha(fd, "fin");
    if (fin && fin < inicio) return { ok: false, error: "El término no puede ser antes del inicio." };
    await crearContrato(
      {
        vehiculoId,
        tipo: esTipoContrato(tipo) ? tipo : "seguro",
        proveedor: texto(fd, "proveedor", 120),
        referencia: texto(fd, "referencia", 80),
        inicio,
        fin,
        costoInicial: monto(fd, "costoInicial"),
        costoRecurrente: monto(fd, "costoRecurrente"),
        frecuencia: esFrecuencia(frecuencia) ? frecuencia : "mensual",
        notas: texto(fd, "notas", 2000),
      },
      u.correo,
    );
    refrescar(vehiculoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function cerrarContratoAction(id: string, cerrado: boolean, vehiculoId: string): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    await cerrarContrato(id, cerrado);
    refrescar(vehiculoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Catálogo ---------------------------------------------------------

export async function crearMarcaAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    const nombre = texto(fd, "nombre", 60);
    if (!nombre) return { ok: false, error: "Escribe el nombre de la marca." };
    await crearMarca(nombre);
    revalidatePath("/flota/configuracion");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function crearModeloAction(fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoApp(SLUG_APP_FLOTA);
    const marcaId = texto(fd, "marcaId", 60);
    const nombre = texto(fd, "nombre", 80);
    const categoria = fd.get("categoria");
    if (!marcaId || !nombre) return { ok: false, error: "Elige la marca y escribe el modelo." };
    await crearModelo({ marcaId, nombre, categoria: esCategoria(categoria) ? categoria : "camioneta" });
    revalidatePath("/flota/configuracion");
    revalidatePath("/flota/vehiculos");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
